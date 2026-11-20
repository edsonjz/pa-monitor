import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Download,
  FastForward,
  FileSpreadsheet,
  LogOut,
  Moon,
  Play,
  Search,
  Settings,
  Square,
  Sun,
  Upload,
  UserCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { AlertLog, Shift, Snapshot, Workstation } from './types';
import { useStore } from './hooks/useStore';
import { useClock } from './hooks/useClock';
import { applyAck, buildViews, detectAlerts, effectiveState, inWindow } from './lib/engine';
import { fmtClock, minOfDay, todayStr } from './lib/time';
import { beep } from './lib/sound';
import { downloadTemplate, exportCurrent, parseImport } from './lib/excel';
import { defaultWorkstations } from './lib/layout';
import { storageMode, syncLocalToSupabase } from './services/storageService';
import { isAuthenticated, logout } from './services/authService';
import FloorMap from './components/FloorMap';
import PACard from './components/PACard';
import EditModal from './components/EditModal';
import AlertPanel from './components/AlertPanel';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';

type StatusFilter = 'all' | 'alert' | 'logged' | 'break' | 'falta' | 'atestado' | 'dsr' | 'free';

/** Troca de lugar (ou move) todos os turnos entre duas PAs. */
function swapWs(s: Snapshot, a: string, b: string): Snapshot {
  const wb = s.workstations.find((w) => w.id === b);
  const wa = s.workstations.find((w) => w.id === a);
  if (!wa || !wb || wb.status === 'maintenance' || wa.status === 'maintenance') return s;
  const iso = new Date().toISOString();
  const target = (id: string) => (id === a ? b : id === b ? a : null);
  const moved = new Set<string>();
  const shifts = s.shifts.map((x) => {
    const t = target(x.wsId);
    if (!t) return x;
    moved.add(x.id);
    return { ...x, wsId: t, updatedAt: iso };
  });
  const codeOf = (id: string) => s.workstations.find((w) => w.id === id)?.code ?? id;
  const alerts = s.alerts.map((al) => {
    const t = !al.acknowledgedAt && moved.has(al.shiftId) ? target(al.wsId) : null;
    return t ? { ...al, wsId: t, wsCode: codeOf(t) } : al;
  });
  return { ...s, shifts, alerts };
}

export default function App() {
  const [isAuth, setIsAuth] = useState(() => isAuthenticated());
  const { snap, ref, update, error } = useStore(isAuth);
  const clock = useClock();
  const { now } = clock;
  const nowRef = useRef(now);
  nowRef.current = now;

  const [dark, setDark] = useState(() => localStorage.getItem('pa-dark') === '1');
  const [soundOn, setSoundOn] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [teamF, setTeamF] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [simH, setSimH] = useState(now.getHours());
  const [simM, setSimM] = useState(now.getMinutes());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('pa-dark', dark ? '1' : '0');
  }, [dark]);

  const today = todayStr(now);
  const nowMin = minOfDay(now);
  const sec = Math.floor(now.getTime() / 1000);

  // Motor de alertas: roda a cada segundo (apenas quando autenticado)
  useEffect(() => {
    if (!isAuth) return;
    const s = ref.current;
    if (!s) return;
    const existing = new Set(s.alerts.map((a) => a.id));
    const created = detectAlerts(s.shifts, s.workstations, existing, nowMin, today, nowRef.current.toISOString());
    if (created.length) {
      update((cur) => ({
        ...cur,
        alerts: [...cur.alerts, ...created.filter((c) => !cur.alerts.some((a) => a.id === c.id))],
      }));
    }
  }, [isAuth, sec, !!snap]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(
    () =>
      (snap?.alerts ?? [])
        .filter((a) => !a.acknowledgedAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.scheduledTime.localeCompare(b.scheduledTime)),
    [snap],
  );

  const history = useMemo(
    () =>
      (snap?.alerts ?? [])
        .filter((a) => a.acknowledgedAt)
        .sort((a, b) => (b.acknowledgedAt ?? '').localeCompare(a.acknowledgedAt ?? '')),
    [snap],
  );

  // Som: bipe contínuo e suave enquanto houver alertas pendentes e usuário autenticado
  useEffect(() => {
    if (!isAuth || !soundOn || pending.length === 0) return;
    beep();
    const i = setInterval(beep, 4000);
    return () => clearInterval(i);
  }, [isAuth, soundOn, pending.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const views = useMemo(
    () => buildViews(snap?.workstations ?? [], snap?.shifts ?? [], pending, nowMin, today),
    [snap, pending, nowMin, today],
  );

  const teams = useMemo(
    () => [...new Set((snap?.shifts ?? []).map((s) => s.team.trim()).filter(Boolean))].sort(),
    [snap],
  );

  const kpi = useMemo(() => {
    const v = [...views.values()];
    return {
      total: v.length,
      logged: v.filter((x) => x.category === 'logged').length,
      brk: v.filter((x) => x.category === 'break').length,
      falta: v.filter((x) => x.category === 'falta').length,
      atestado: v.filter((x) => x.category === 'atestado').length,
      dsr: v.filter((x) => x.category === 'dsr').length,
      free: v.filter((x) => x.category === 'free').length,
    };
  }, [views]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 6000);
  };

  // Confirmação de alerta individual
  const ack = (id: string) =>
    update((s) => {
      const a = s.alerts.find((x) => x.id === id);
      if (!a || a.acknowledgedAt) return s;
      const iso = nowRef.current.toISOString();
      return {
        ...s,
        alerts: s.alerts.map((x): AlertLog => (x.id === id ? { ...x, acknowledgedAt: iso } : x)),
        shifts: s.shifts.map((sh) => (sh.id === a.shiftId ? applyAck(sh, a.eventType, todayStr(nowRef.current), iso) : sh)),
      };
    });

  // Confirmação de todos os alertas pendentes de uma só vez
  const ackAllAlerts = () => {
    if (!pending.length) return;
    update((s) => {
      const iso = nowRef.current.toISOString();
      const today = todayStr(nowRef.current);
      let shifts = [...s.shifts];
      const pendingList = s.alerts.filter((a) => !a.acknowledgedAt);

      pendingList.forEach((a) => {
        shifts = shifts.map((sh) => (sh.id === a.shiftId ? applyAck(sh, a.eventType, today, iso) : sh));
      });

      return {
        ...s,
        shifts,
        alerts: s.alerts.map((a) => (a.acknowledgedAt ? a : { ...a, acknowledgedAt: iso })),
      };
    });
    flash(`Todos os ${pending.length} alerta(s) foram confirmados.`);
  };

  // Botão de ação rápida "Dar OK" direto na PA (marca operador como Logado/Verde)
  const quickLog = (shiftId: string) => {
    update((s) => {
      const iso = nowRef.current.toISOString();
      const today = todayStr(nowRef.current);
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          sh.id === shiftId
            ? { ...sh, currentState: 'logged', breakKind: '', stateDate: today, updatedAt: iso }
            : sh,
        ),
        alerts: s.alerts.map((al) =>
          al.shiftId === shiftId && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
        ),
      };
    });
    flash('Operador confirmado como Logado (Verde).');
  };

  // Operadores que estão no horário de trabalho mas ainda não estão com status "logado"
  const scheduledToLog = useMemo(() => {
    return (snap?.shifts ?? []).filter((s) => {
      if (!s.operatorName.trim()) return false;
      const st = effectiveState(s, today);
      if (st === 'logged' || st === 'falta' || st === 'atestado' || st === 'dsr') return false;
      return inWindow(s, nowMin);
    });
  }, [snap, today, nowMin]);

  // Dar OK em lote para todos os operadores que estão no horário agora
  const confirmAllScheduled = () => {
    if (!scheduledToLog.length) return;
    const count = scheduledToLog.length;
    update((s) => {
      const iso = nowRef.current.toISOString();
      const today = todayStr(nowRef.current);
      const targetIds = new Set(scheduledToLog.map((x) => x.id));
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          targetIds.has(sh.id)
            ? { ...sh, currentState: 'logged', breakKind: '', stateDate: today, updatedAt: iso }
            : sh,
        ),
        alerts: s.alerts.map((al) =>
          targetIds.has(al.shiftId) && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
        ),
      };
    });
    flash(`${count} operador(es) do horário confirmados como Logados (Verde).`);
  };

  const locate = (wsId: string) => {
    setHighlight(wsId);
    document.getElementById(`pa-${wsId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => setHighlight(null), 3500);
  };

  const saveWs = (ws: Workstation, list: Shift[], removed: string[], moveTo: string): string | null => {
    if (!ws.code) return 'Informe o código da PA.';
    const s0 = ref.current!;
    if (s0.workstations.some((w) => w.id !== ws.id && w.code.toLowerCase() === ws.code.toLowerCase()))
      return `O código "${ws.code}" já existe em outra PA.`;
    update((s) => {
      const iso = new Date().toISOString();
      const kept = s.shifts.filter((x) => !removed.includes(x.id) && !list.some((l) => l.id === x.id));
      const clearedShiftIds = new Set(
        list
          .filter((l) => ['logged', 'falta', 'atestado', 'dsr', 'done'].includes(l.currentState))
          .map((l) => l.id),
      );
      let next: Snapshot = {
        ...s,
        workstations: s.workstations.map((w) => (w.id === ws.id ? { ...ws, label: ws.code } : w)),
        shifts: [...kept, ...list.map((l) => ({ ...l, wsId: ws.id, updatedAt: iso }))],
        alerts: s.alerts.map((a) => {
          if (a.acknowledgedAt) return a;
          if (clearedShiftIds.has(a.shiftId)) {
            return { ...a, wsCode: ws.code, acknowledgedAt: iso };
          }
          return a.wsId === ws.id ? { ...a, wsCode: ws.code } : a;
        }),
      };
      if (moveTo) next = swapWs(next, ws.id, moveTo);
      return next;
    });
    setEditId(null);
    return null;
  };

  const onImport = async (f: File) => {
    try {
      const r = await parseImport(f, ref.current!.workstations);
      if (
        !window.confirm(
          `Importar ${r.shifts.length} operador(es) em ${r.affectedWs.size} PA(s)?\nOs turnos atuais dessas PAs serão substituídos.`,
        )
      )
        return;
      update((s) => ({ ...s, shifts: [...s.shifts.filter((x) => !r.affectedWs.has(x.wsId)), ...r.shifts] }));
      flash(
        `Importação concluída: ${r.shifts.length} turno(s).${r.warnings.length ? ' Avisos: ' + r.warnings.slice(0, 3).join(' ') : ''}`,
      );
    } catch (e) {
      flash('Erro ao ler a planilha: ' + (e as Error).message);
    }
  };

  const matches = (id: string): boolean => {
    const v = views.get(id);
    if (!v) return true;
    const list = (snap?.shifts ?? []).filter((s) => s.wsId === id);
    const q = search.trim().toLowerCase();
    if (q && !(v.ws.code.toLowerCase().includes(q) || list.some((s) => s.operatorName.toLowerCase().includes(q))))
      return false;
    if (teamF && !list.some((s) => s.team === teamF || (v.ws.type === 'supervisor' && s.operatorName === teamF)))
      return false;
    if (statusF === 'alert' && !v.alert) return false;
    if (statusF === 'logged' && v.category !== 'logged') return false;
    if (statusF === 'break' && v.category !== 'break') return false;
    if (statusF === 'falta' && v.category !== 'falta') return false;
    if (statusF === 'atestado' && v.category !== 'atestado') return false;
    if (statusF === 'dsr' && v.category !== 'dsr') return false;
    if (statusF === 'free' && v.category !== 'free') return false;
    return true;
  };

  const renderCard = (id: string) => {
    const v = views.get(id);
    if (!v) return null;
    const span = id === 'SUP-01' || id === 'SUP-02' ? '!w-[304px]' : id === 'SUP-03' || id === 'SUP-04' ? '!h-[208px]' : '';
    return (
      <PACard
        view={v}
        spanClass={span}
        dim={!matches(id)}
        highlight={highlight === id}
        onOpen={() => setEditId(id)}
        onAck={ack}
        onQuickLog={quickLog}
        onDropOn={(a, b) => update((s) => swapWs(s, a, b))}
      />
    );
  };

  // Se não estiver autenticado, exibe tela de login de Administrador Geral
  if (!isAuth) {
    return <LoginScreen onSuccess={() => setIsAuth(true)} />;
  }

  if (!snap) return <div className="p-10 text-center text-slate-500">Carregando…</div>;

  const editWs = snap.workstations.find((w) => w.id === editId);
  const online = storageMode === 'supabase';

  return (
    <div className="flex h-screen flex-col">
      {/* CABEÇALHO */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-navy px-4 py-2 text-white">
        <div>
          <h1 className="text-base font-bold leading-tight">Monitor de PAs — Layout da Operação</h1>
          <p className="text-[11px] text-sky-200">62 PAs · 58 operadores + 4 supervisores</p>
        </div>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1 ${clock.simOn ? 'bg-fuchsia-600' : 'bg-black/30'}`}>
          <Clock size={18} />
          <span className="font-mono text-2xl font-bold tabular-nums">{fmtClock(now)}</span>
          {clock.simOn && <span className="text-[10px] font-bold uppercase">simulação</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-black/20 px-2 py-1">
          <button
            className="btn"
            onClick={() => {
              setSimH(now.getHours());
              setSimM(now.getMinutes());
              clock.toggleSim();
            }}
          >
            {clock.simOn ? <Square size={13} /> : <Play size={13} />} Simulação {clock.simOn ? 'ON' : 'OFF'}
          </button>
          <input
            type="number"
            min={0}
            max={23}
            value={simH}
            onChange={(e) => setSimH(+e.target.value)}
            className="w-12 rounded bg-white/90 px-1 py-1 text-center text-xs text-black"
          />
          <span>:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={simM}
            onChange={(e) => setSimM(+e.target.value)}
            className="w-12 rounded bg-white/90 px-1 py-1 text-center text-xs text-black"
          />
          <button
            className="btn"
            onClick={() => clock.setSimTime(Math.min(23, Math.max(0, simH)), Math.min(59, Math.max(0, simM)))}
          >
            Aplicar
          </button>
          <button className="btn" disabled={!clock.simOn} onClick={() => clock.addMinutes(5)}>
            <FastForward size={13} /> +5min
          </button>
          <button className="btn" disabled={!clock.simOn} onClick={() => clock.addMinutes(15)}>
            <FastForward size={13} /> +15min
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Importar Excel
          </button>
          <button className="btn" onClick={() => downloadTemplate(snap.workstations)}>
            <FileSpreadsheet size={14} /> Planilha Modelo (.xlsx)
          </button>
          <button className="btn" onClick={() => exportCurrent(snap.workstations, snap.shifts)}>
            <Download size={14} /> Exportar Escala (.xlsx)
          </button>
          <button
            className="btn"
            onClick={() => setSoundOn((v) => !v)}
            title="Som dos alertas"
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />} {soundOn ? 'Som ON' : 'Mudo'}
          </button>
          <button className="btn" onClick={() => setDark((v) => !v)}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="btn" onClick={() => setShowSettings(true)}>
            <Settings size={14} />
          </button>

          {/* Indicador de Usuário e Botão de Logout */}
          <div className="ml-2 flex items-center gap-1 border-l border-white/20 pl-2">
            <span className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs font-bold text-sky-200">
              <UserCheck size={14} className="text-emerald-400" /> adm156
            </span>
            <button
              onClick={() => {
                logout();
                setIsAuth(false);
              }}
              title="Encerrar sessão"
              className="btn !bg-rose-600/80 hover:!bg-rose-700"
            >
              <LogOut size={13} /> Sair
            </button>
          </div>
        </div>
      </header>

      {/* KPIs + BOTAO DE CONFIRMAR TODOS LOGADOS */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-300 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
        <Kpi label="Total PAs" value={kpi.total} />
        <Kpi label="Logados" value={kpi.logged} cls="text-emerald-600 font-black" />
        <Kpi label="Em pausa" value={kpi.brk} cls="text-amber-600 font-black" />
        <Kpi label="Faltas" value={kpi.falta} cls={kpi.falta > 0 ? 'text-rose-600 font-black' : ''} />
        <Kpi label="Atestados" value={kpi.atestado} cls={kpi.atestado > 0 ? 'text-cyan-700 font-black' : ''} />
        <Kpi label="DSR" value={kpi.dsr} cls={kpi.dsr > 0 ? 'text-purple-700 font-black' : ''} />
        <Kpi label="Livres" value={kpi.free} />
        <Kpi
          label="Alertas pendentes"
          value={pending.length}
          cls={pending.length > 0 ? 'text-red-600 font-black' : ''}
          box={pending.length > 0}
        />

        {/* Botão de Ação Rápida para Confirmar Todos Logados no Horário */}
        {scheduledToLog.length > 0 && (
          <button
            onClick={confirmAllScheduled}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
          >
            <Check size={14} strokeWidth={3} /> Dar OK nos {scheduledToLog.length} Operadores do Horário
          </button>
        )}

        <span
          className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
            online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
          }`}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'Supabase Online' : 'Modo Local (Testes)'}
        </span>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
          <input
            className="input !w-64 !pl-7"
            placeholder="Buscar nome ou código da PA"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input !w-44 font-medium"
          value={statusF}
          onChange={(e) => setStatusF(e.target.value as StatusFilter)}
        >
          <option value="all">Status: Todos</option>
          <option value="alert">Em Alerta ({pending.length})</option>
          <option value="logged">Logados ({kpi.logged})</option>
          <option value="break">Em Pausa ({kpi.brk})</option>
          <option value="falta">🚫 Faltas ({kpi.falta})</option>
          <option value="atestado">📋 Atestados ({kpi.atestado})</option>
          <option value="dsr">🏖️ DSR ({kpi.dsr})</option>
          <option value="free">Livres ({kpi.free})</option>
        </select>
        <select className="input !w-44" value={teamF} onChange={(e) => setTeamF(e.target.value)}>
          <option value="">Equipe: Todas</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="ml-1 flex flex-wrap items-center gap-2.5 text-[11px]">
          <Legend c="bg-[#C6EFCE] border-slate-500" t="Logado" />
          <Legend c="bg-[#FFEB9C] border-amber-500" t="Pausa" />
          <Legend c="bg-[#FFC7CE] border-rose-500" t="Falta" />
          <Legend c="bg-[#B7DEE8] border-cyan-500" t="Atestado" />
          <Legend c="bg-[#E4DFEC] border-purple-500" t="DSR" />
          <Legend c="bg-[#F2F2F2] border-slate-400" t="Livre" />
          <Legend c="bg-[#FFE699] border-amber-400" t="Supervisor" />
          <Legend c="bg-red-500 border-red-700" t="Alerta" />
        </div>
        {msg && <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">{msg}</span>}
        {error && <span className="ml-auto text-xs font-semibold text-red-600">⚠ {error}</span>}
      </div>

      {/* MAPA + PAINEL */}
      <div className="flex min-h-0 flex-1">
        <main className="flex-1 overflow-auto">
          <FloorMap renderCard={renderCard} />
        </main>
        <AlertPanel pending={pending} history={history} onAck={ack} onAckAll={ackAllAlerts} onLocate={locate} />
      </div>

      {editWs && (
        <EditModal
          key={editWs.id}
          ws={editWs}
          shifts={snap.shifts.filter((s) => s.wsId === editWs.id)}
          allWs={snap.workstations}
          onClose={() => setEditId(null)}
          onSave={saveWs}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          syncing={syncing}
          message={msg}
          onSync={async () => {
            setSyncing(true);
            try {
              const n = await syncLocalToSupabase();
              flash(`Sincronizado: ${n} registro(s) enviados ao Supabase.`);
            } catch (e) {
              flash('Falha na sincronização: ' + (e as Error).message);
            }
            setSyncing(false);
          }}
          onClearSamples={() => {
            update((s) => {
              const ids = new Set(s.shifts.filter((x) => x.id.startsWith('sample-')).map((x) => x.id));
              return {
                ...s,
                shifts: s.shifts.filter((x) => !ids.has(x.id)),
                alerts: s.alerts.filter((a) => !ids.has(a.shiftId)),
              };
            });
            flash('Exemplos removidos.');
          }}
          onReset={() => {
            if (!window.confirm('Apagar TODOS os operadores e logs? (o layout das PAs é mantido)')) return;
            update((s) => ({
              workstations: s.workstations.length ? s.workstations : defaultWorkstations(),
              shifts: [],
              alerts: [],
            }));
            flash('Dados apagados.');
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  cls = '',
  box = false,
}: {
  label: string;
  value: number;
  cls?: string;
  box?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-2 rounded-md px-2.5 py-1 ${
        box ? 'animate-pulse bg-red-100 dark:bg-red-950' : 'bg-slate-100 dark:bg-slate-800'
      }`}
    >
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-lg font-extrabold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${c}`} />
      {t}
    </span>
  );
}
