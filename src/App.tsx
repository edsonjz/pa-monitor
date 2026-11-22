import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Clock,
  Download,
  FastForward,
  FileSpreadsheet,
  Home,
  LayoutGrid,
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
  X,
} from 'lucide-react';
import type { AlertLog, Shift, Snapshot, Workstation } from './types';
import { useStore } from './hooks/useStore';
import { useClock } from './hooks/useClock';
import { applyAck, buildViews, detectAlerts, effectiveState, inWindow, isIncidentState, isPastShiftLogout, shiftCycleDate } from './lib/engine';
import { fmtClock, minOfDay, todayStr } from './lib/time';
import { beep } from './lib/sound';
import { defaultWorkstations, hoNumber, isHomeOfficeWs, makeHomeOfficeWs } from './lib/layout';
import { storageMode, syncLocalToSupabase } from './services/storageService';
import { type AuthUser, getInitialAuthUser, logout, subscribeAuthState } from './services/authService';
import FloorMap from './components/FloorMap';
import HomeOfficeGrid from './components/HomeOfficeGrid';
import PACard from './components/PACard';
import EditModal from './components/EditModal';
import AlertPanel from './components/AlertPanel';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';

type ViewTab = 'presencial' | 'ho' | 'all';
type StatusFilter =
  | 'all'
  | 'alert'
  | 'logged'
  | 'break'
  | 'incident'
  | 'falta'
  | 'atestado'
  | 'dsr'
  | 'ferias'
  | 'maint'
  | 'free';

/** Troca de lugar (ou move) todos os turnos entre duas PAs (incluindo Presencial <-> Home Office). */
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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isAuth = authUser !== null;
  const clock = useClock();
  const { snap, ref, update, error, realtimeStatus } = useStore(isAuth, clock.simOn);

  useEffect(() => {
    let active = true;
    void getInitialAuthUser().then((u) => {
      if (!active) return;
      setAuthUser(u);
      setAuthLoading(false);
    });
    const unsub = subscribeAuthState((u) => {
      if (!active) return;
      setAuthUser(u);
      setAuthLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);
  const { now } = clock;
  const nowRef = useRef(now);
  nowRef.current = now;
  const getNow = useCallback(() => nowRef.current, []);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const locateScrollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const locateClearTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      clearTimeout(flashTimerRef.current);
      clearTimeout(locateScrollTimerRef.current);
      clearTimeout(locateClearTimerRef.current);
    };
  }, []);

  const [tab, setTab] = useState<ViewTab>('presencial');
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

  const hoWorkstations = useMemo(
    () =>
      (snap?.workstations ?? [])
        .filter((w) => isHomeOfficeWs(w))
        .sort((a, b) => hoNumber(a.id) - hoNumber(b.id)),
    [snap],
  );

  const occupiedWsIds = useMemo(
    () => new Set((snap?.shifts ?? []).filter((s) => s.operatorName.trim()).map((s) => s.wsId)),
    [snap],
  );

  const teams = useMemo(
    () => [...new Set((snap?.shifts ?? []).map((s) => s.team.trim()).filter(Boolean))].sort(),
    [snap],
  );

  // Alerta cruzado entre abas (Presencial vs Home Office)
  const pendingPresencial = useMemo(
    () => pending.filter((a) => !a.wsId.startsWith('HO-') && !a.wsCode.toUpperCase().startsWith('HO-')).length,
    [pending],
  );
  const pendingHO = useMemo(
    () => pending.filter((a) => a.wsId.startsWith('HO-') || a.wsCode.toUpperCase().startsWith('HO-')).length,
    [pending],
  );

  // Resumo rápido por status com quebra Presencial vs Home Office
  const summary = useMemo(() => {
    const empty = () => ({ total: 0, pres: 0, ho: 0 });
    const stats = {
      all: empty(),
      logged: empty(),
      break: empty(),
      alert: empty(),
      incident: empty(),
      falta: empty(),
      atestado: empty(),
      dsr: empty(),
      ferias: empty(),
      maint: empty(),
      free: empty(),
    };
    const bump = (bucket: { total: number; pres: number; ho: number }, ho: boolean) => {
      bucket.total += 1;
      if (ho) bucket.ho += 1;
      else bucket.pres += 1;
    };
    for (const v of views.values()) {
      const ho = isHomeOfficeWs(v.ws);
      bump(stats.all, ho);
      if (v.alert) bump(stats.alert, ho);
      bump(stats[v.category], ho);
    }
    return stats;
  }, [views]);

  const flash = (m: string) => {
    clearTimeout(flashTimerRef.current);
    setMsg(m);
    flashTimerRef.current = setTimeout(() => setMsg(''), 6000);
  };

  // Confirmação de alerta individual
  const ack = (id: string) =>
    update((s) => {
      const a = s.alerts.find((x) => x.id === id);
      if (!a || a.acknowledgedAt) return s;
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      return {
        ...s,
        alerts: s.alerts.map((x): AlertLog => (x.id === id ? { ...x, acknowledgedAt: iso } : x)),
        shifts: s.shifts.map((sh) =>
          sh.id === a.shiftId ? applyAck(sh, a.eventType, shiftCycleDate(sh, dStr, nowM), iso) : sh,
        ),
      };
    });

  // Confirmação de todos os alertas pendentes de uma só vez
  const ackAllAlerts = () => {
    if (!pending.length) return;
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      let shifts = [...s.shifts];
      const pendingList = s.alerts.filter((a) => !a.acknowledgedAt);

      pendingList.forEach((a) => {
        shifts = shifts.map((sh) =>
          sh.id === a.shiftId ? applyAck(sh, a.eventType, shiftCycleDate(sh, dStr, nowM), iso) : sh,
        );
      });

      return {
        ...s,
        shifts,
        alerts: s.alerts.map((a) => (a.acknowledgedAt ? a : { ...a, acknowledgedAt: iso })),
      };
    });
    flash(`Todos os ${pending.length} alerta(s) foram confirmados.`);
  };

  // Botão de ação rápida "OK" direto na PA (confirma presença ou normaliza ocorrência remota)
  const quickLog = (shiftId: string) => {
    let wasIncident = false;
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      const hhmm = fmtClock(curNow).slice(0, 5);
      const target = s.shifts.find((sh) => sh.id === shiftId);
      wasIncident = !!target && isIncidentState(target.currentState);
      const targetWs = target ? s.workstations.find((w) => w.id === target.wsId) : undefined;
      const extraLogs: AlertLog[] =
        wasIncident && target
          ? [
              {
                id: `${dStr}|${target.id}|incident_resolved|${Date.now().toString(36)}`,
                shiftId: target.id,
                wsId: target.wsId,
                wsCode: targetWs?.code ?? target.wsId,
                operatorName: target.operatorName,
                eventType: 'incident_resolved',
                scheduledTime: hhmm,
                acknowledgedAt: iso,
                createdAt: iso,
              },
            ]
          : [];
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          sh.id === shiftId
            ? {
                ...sh,
                currentState: 'logged',
                breakKind: '',
                stateDate: shiftCycleDate(sh, dStr, nowM),
                incidentTime: '',
                updatedAt: iso,
              }
            : sh,
        ),
        alerts: [
          ...s.alerts.map((al) =>
            al.shiftId === shiftId && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
          ),
          ...extraLogs,
        ],
      };
    });
    flash(wasIncident ? 'Ocorrência normalizada · Operador Logado (Verde).' : 'Operador confirmado como Logado (Verde).');
  };

  // Botão rápido "Deslogar" para confirmar encerramento do turno vencido
  const quickLogout = (shiftId: string) => {
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          sh.id === shiftId
            ? {
                ...sh,
                currentState: 'done',
                breakKind: '',
                stateDate: shiftCycleDate(sh, dStr, nowM),
                incidentTime: '',
                updatedAt: iso,
              }
            : sh,
        ),
        alerts: s.alerts.map((al) =>
          al.shiftId === shiftId && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
        ),
      };
    });
    flash('Operador deslogado (Pós-logout).');
  };

  // Operadores que estão no horário de trabalho mas ainda não estão com status "logado"
  const scheduledToLog = useMemo(() => {
    return (snap?.shifts ?? []).filter((s) => {
      if (!s.operatorName.trim()) return false;
      const st = effectiveState(s, today, nowMin);
      if (st === 'logged' || st === 'falta' || st === 'atestado' || st === 'dsr' || st === 'ferias' || isIncidentState(st))
        return false;
      return inWindow(s, nowMin);
    });
  }, [snap, today, nowMin]);

  // Operadores logados ou em pausa cujo horário de saída já passou
  const overdueLogouts = useMemo(() => {
    return (snap?.shifts ?? []).filter((s) => {
      if (!s.operatorName.trim()) return false;
      const st = effectiveState(s, today, nowMin);
      return (st === 'logged' || st === 'break') && isPastShiftLogout(s, nowMin);
    });
  }, [snap, today, nowMin]);

  // Dar OK em lote para todos os operadores que estão no horário agora
  const confirmAllScheduled = () => {
    if (!scheduledToLog.length) return;
    const count = scheduledToLog.length;
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      const targetIds = new Set(scheduledToLog.map((x) => x.id));
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          targetIds.has(sh.id)
            ? {
                ...sh,
                currentState: 'logged',
                breakKind: '',
                stateDate: shiftCycleDate(sh, dStr, nowM),
                incidentTime: '',
                updatedAt: iso,
              }
            : sh,
        ),
        alerts: s.alerts.map((al) =>
          targetIds.has(al.shiftId) && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
        ),
      };
    });
    flash(`${count} operador(es) do horário confirmados como Logados (Verde).`);
  };

  // Confirmar logout em lote para todos os operadores com horário de saída vencido
  const confirmAllOverdueLogouts = () => {
    if (!overdueLogouts.length) return;
    const count = overdueLogouts.length;
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      const targetIds = new Set(overdueLogouts.map((x) => x.id));
      return {
        ...s,
        shifts: s.shifts.map((sh) =>
          targetIds.has(sh.id)
            ? {
                ...sh,
                currentState: 'done',
                breakKind: '',
                stateDate: shiftCycleDate(sh, dStr, nowM),
                incidentTime: '',
                updatedAt: iso,
              }
            : sh,
        ),
        alerts: s.alerts.map((al) =>
          targetIds.has(al.shiftId) && !al.acknowledgedAt ? { ...al, acknowledgedAt: iso } : al,
        ),
      };
    });
    flash(`${count} operador(es) com horário vencido foram deslogados.`);
  };

  // Localizar inteligente: muda automaticamente para a aba certa (Presencial ou Home Office) e destaca o card
  const locate = (wsId: string) => {
    const targetWs = ref.current?.workstations.find((w) => w.id === wsId);
    const targetIsHO = targetWs ? isHomeOfficeWs(targetWs) : wsId.startsWith('HO-');
    if (targetIsHO && tab === 'presencial') setTab('ho');
    else if (!targetIsHO && tab === 'ho') setTab('presencial');

    clearTimeout(locateScrollTimerRef.current);
    clearTimeout(locateClearTimerRef.current);
    setHighlight(wsId);
    locateScrollTimerRef.current = setTimeout(() => {
      document.getElementById(`pa-${wsId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 80);
    locateClearTimerRef.current = setTimeout(() => setHighlight(null), 3500);
  };

  // Adicionar nova posição dinâmica no Home Office
  const addHomeOfficeSlot = () => {
    update((s) => {
      const maxNum = s.workstations
        .filter((w) => isHomeOfficeWs(w))
        .reduce((m, w) => Math.max(m, hoNumber(w.id)), 0);
      const nextWs = makeHomeOfficeWs(maxNum + 1);
      return { ...s, workstations: [...s.workstations, nextWs] };
    });
    flash('Nova posição Home Office adicionada.');
  };

  const saveWs = (ws: Workstation, list: Shift[], removed: string[], moveTo: string): string | null => {
    if (!ws.code) return 'Informe o código da PA.';
    const s0 = ref.current!;
    if (s0.workstations.some((w) => w.id !== ws.id && w.code.toLowerCase() === ws.code.toLowerCase()))
      return `O código "${ws.code}" já existe em outra PA.`;
    if (moveTo) {
      const dest = s0.workstations.find((w) => w.id === moveTo);
      if (ws.status === 'maintenance' || !dest || dest.status === 'maintenance') {
        return 'Não é possível transferir envolvendo uma PA em manutenção.';
      }
    }

    let movedMsg = '';
    const removedSet = new Set(removed);
    update((s) => {
      const iso = nowRef.current.toISOString();
      const dStr = todayStr(nowRef.current);
      const hhmm = fmtClock(nowRef.current).slice(0, 5);
      const kept = s.shifts.filter((x) => !removedSet.has(x.id) && !list.some((l) => l.id === x.id));
      const clearedShiftIds = new Set(
        list
          .filter((l) =>
            ['logged', 'falta', 'atestado', 'dsr', 'ferias', 'done', 'no_internet', 'no_power', 'tech_issue'].includes(
              l.currentState,
            ),
          )
          .map((l) => l.id),
      );

      // Registrar ocorrências remotas e retornos de ocorrências no histórico
      const incidentLogs: AlertLog[] = [];
      list.forEach((l, idx) => {
        const prev = s.shifts.find((x) => x.id === l.id);
        if (
          isIncidentState(l.currentState) &&
          (!prev || prev.currentState !== l.currentState || prev.incidentTime !== l.incidentTime)
        ) {
          incidentLogs.push({
            id: `${dStr}|${l.id}|${l.currentState}|${Date.now().toString(36)}${idx}`,
            shiftId: l.id,
            wsId: ws.id,
            wsCode: ws.code,
            operatorName: l.operatorName,
            eventType: l.currentState,
            scheduledTime: l.incidentTime || hhmm,
            acknowledgedAt: iso,
            createdAt: iso,
          });
        } else if (prev && isIncidentState(prev.currentState) && l.currentState === 'logged') {
          incidentLogs.push({
            id: `${dStr}|${l.id}|incident_resolved|${Date.now().toString(36)}${idx}`,
            shiftId: l.id,
            wsId: ws.id,
            wsCode: ws.code,
            operatorName: l.operatorName,
            eventType: 'incident_resolved',
            scheduledTime: hhmm,
            acknowledgedAt: iso,
            createdAt: iso,
          });
        }
      });

      let next: Snapshot = {
        ...s,
        workstations: s.workstations.map((w) => (w.id === ws.id ? { ...ws, label: ws.code } : w)),
        shifts: [...kept, ...list.map((l) => ({ ...l, wsId: ws.id, updatedAt: iso }))],
        alerts: [
          ...s.alerts
            .filter((a) => a.acknowledgedAt || !removedSet.has(a.shiftId))
            .map((a) => {
              if (a.acknowledgedAt) return a;
              if (clearedShiftIds.has(a.shiftId)) {
                return { ...a, wsCode: ws.code, acknowledgedAt: iso };
              }
              return a.wsId === ws.id ? { ...a, wsCode: ws.code } : a;
            }),
          ...incidentLogs,
        ],
      };
      if (moveTo) {
        const dest = s.workstations.find((w) => w.id === moveTo);
        next = swapWs(next, ws.id, moveTo);
        if (dest) movedMsg = `Operador transferido de ${ws.code} para ${dest.code}.`;
      }
      return next;
    });
    setEditId(null);
    if (movedMsg) flash(movedMsg);
    return null;
  };

  const onImport = async (f: File) => {
    try {
      const { parseImport } = await import('./lib/excel');
      const r = await parseImport(f, ref.current!.workstations);
      if (
        !window.confirm(
          `Importar ${r.shifts.length} operador(es) em ${r.affectedWs.size} posição(ões)?\nOs turnos atuais dessas posições serão substituídos (linhas em branco da planilha são ignoradas).`,
        )
      )
        return;
      update((s) => {
        const existingIds = new Set(s.workstations.map((w) => w.id));
        const addedWs = r.newWorkstations.filter((w) => !existingIds.has(w.id));
        const replacedIds = new Set(s.shifts.filter((x) => r.affectedWs.has(x.wsId)).map((x) => x.id));
        return {
          ...s,
          workstations: [...s.workstations, ...addedWs],
          shifts: [...s.shifts.filter((x) => !r.affectedWs.has(x.wsId)), ...r.shifts],
          alerts: s.alerts.filter((a) => a.acknowledgedAt || !replacedIds.has(a.shiftId)),
        };
      });
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
    if (statusF === 'incident' && v.category !== 'incident') return false;
    if (statusF === 'falta' && v.category !== 'falta') return false;
    if (statusF === 'atestado' && v.category !== 'atestado') return false;
    if (statusF === 'dsr' && v.category !== 'dsr') return false;
    if (statusF === 'ferias' && v.category !== 'ferias') return false;
    if (statusF === 'maint' && v.category !== 'maint') return false;
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
        onQuickLogout={quickLogout}
        onDropOn={(a, b) => update((s) => swapWs(s, a, b))}
      />
    );
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071326] text-sm font-medium text-sky-200">
        Verificando sessão…
      </div>
    );
  }

  // Se não estiver autenticado, exibe tela de login
  if (!authUser) {
    return <LoginScreen onSuccess={(u) => setAuthUser(u)} />;
  }

  if (!snap) return <div className="p-10 text-center text-slate-500">Carregando…</div>;

  const editWs = snap.workstations.find((w) => w.id === editId);
  const online = storageMode === 'supabase';

  const summaryCards: {
    key: StatusFilter;
    label: string;
    stat: { total: number; pres: number; ho: number };
    cls: string;
    valCls: string;
  }[] = [
    { key: 'all', label: 'Todos', stat: summary.all, cls: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: 'text-slate-800 dark:text-slate-100' },
    { key: 'logged', label: 'Logados', stat: summary.logged, cls: 'bg-[#C6EFCE]/60 border-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-700', valCls: 'text-emerald-800 dark:text-emerald-300' },
    { key: 'break', label: 'Em Pausa', stat: summary.break, cls: 'bg-[#FFEB9C]/60 border-amber-400 dark:bg-amber-950/60 dark:border-amber-700', valCls: 'text-amber-800 dark:text-amber-300' },
    { key: 'alert', label: 'Em Alerta', stat: summary.alert, cls: summary.alert.total > 0 ? 'animate-pulse bg-red-100 border-red-500 dark:bg-red-950/80 dark:border-red-600' : 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: summary.alert.total > 0 ? 'text-red-600 dark:text-red-300' : 'text-slate-500' },
    { key: 'incident', label: 'Ocorrências HO', stat: summary.incident, cls: summary.incident.total > 0 ? 'bg-orange-100 border-orange-500 dark:bg-orange-950/70 dark:border-orange-600' : 'bg-orange-50/50 border-orange-200 dark:bg-slate-800 dark:border-slate-700', valCls: summary.incident.total > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-slate-500' },
    { key: 'atestado', label: 'Atestado', stat: summary.atestado, cls: 'bg-[#B7DEE8]/60 border-cyan-400 dark:bg-cyan-950/50 dark:border-cyan-700', valCls: 'text-cyan-800 dark:text-cyan-300' },
    { key: 'dsr', label: 'DSR', stat: summary.dsr, cls: 'bg-[#E4DFEC]/70 border-purple-400 dark:bg-purple-950/50 dark:border-purple-700', valCls: 'text-purple-800 dark:text-purple-300' },
    { key: 'falta', label: 'Faltas', stat: summary.falta, cls: 'bg-[#FFC7CE]/60 border-rose-400 dark:bg-rose-950/50 dark:border-rose-700', valCls: 'text-rose-700 dark:text-rose-300' },
    { key: 'ferias', label: 'Férias', stat: summary.ferias, cls: 'bg-[#E0E7FF]/70 border-indigo-400 dark:bg-indigo-950/50 dark:border-indigo-700', valCls: 'text-indigo-700 dark:text-indigo-300' },
    { key: 'maint', label: 'Manutenção', stat: summary.maint, cls: 'bg-slate-200/80 border-slate-400 dark:bg-slate-800 dark:border-slate-600', valCls: 'text-slate-700 dark:text-slate-300' },
    { key: 'free', label: 'Livres', stat: summary.free, cls: 'bg-[#F2F2F2] border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: 'text-slate-600 dark:text-slate-300' },
  ];

  const blinkHO = tab === 'presencial' && pendingHO > 0;
  const blinkPresencial = tab === 'ho' && pendingPresencial > 0;

  return (
    <div className="flex h-screen flex-col">
      {/* CABEÇALHO + NAVEGAÇÃO POR ABAS */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-navy px-4 py-2 text-white">
        <div>
          <h1 className="text-base font-bold leading-tight">Monitor de PAs — Operação Híbrida</h1>
          <p className="text-[11px] text-sky-200">
            62 PAs presenciais · {hoWorkstations.length} posições Home Office
          </p>
        </div>

        {/* ABAS DE NAVEGAÇÃO COM ALERTA CRUZADO */}
        <nav className="flex items-center gap-1 rounded-lg bg-black/25 p-1">
          <button
            onClick={() => setTab('presencial')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              blinkPresencial
                ? 'animate-alertBlink bg-red-600 text-white shadow'
                : tab === 'presencial'
                  ? 'bg-white text-navy shadow'
                  : 'text-sky-100 hover:bg-white/10'
            }`}
          >
            <Building2 size={14} /> Presencial
            {pendingPresencial > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-black text-white ring-1 ring-white">
                {pendingPresencial}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('ho')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              blinkHO
                ? 'animate-alertBlink bg-red-600 text-white shadow'
                : tab === 'ho'
                  ? 'bg-indigo-500 text-white shadow'
                  : 'text-sky-100 hover:bg-white/10'
            }`}
          >
            <Home size={14} /> Home Office
            {pendingHO > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-black text-white ring-1 ring-white">
                {pendingHO}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('all')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
              tab === 'all' ? 'bg-sky-400 text-slate-950 shadow' : 'text-sky-100 hover:bg-white/10'
            }`}
          >
            <LayoutGrid size={14} /> Todos
            {pending.length > 0 && tab !== 'all' && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                {pending.length}
              </span>
            )}
          </button>
        </nav>

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
          <button
            className="btn"
            onClick={() => {
              void import('./lib/excel')
                .then(({ downloadTemplate }) => downloadTemplate(snap.workstations))
                .catch((e) => flash('Erro ao gerar planilha: ' + (e as Error).message));
            }}
          >
            <FileSpreadsheet size={14} /> Planilha Modelo (.xlsx)
          </button>
          <button
            className="btn"
            onClick={() => {
              void import('./lib/excel')
                .then(({ exportCurrent }) => exportCurrent(snap.workstations, snap.shifts))
                .catch((e) => flash('Erro ao exportar planilha: ' + (e as Error).message));
            }}
          >
            <Download size={14} /> Exportar Escala (.xlsx)
          </button>
          <button className="btn" onClick={() => setSoundOn((v) => !v)} title="Som dos alertas">
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
            <span
              title={authUser.email}
              className="flex max-w-[160px] items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs font-bold text-sky-200"
            >
              <UserCheck size={14} className="shrink-0 text-emerald-400" />
              <span className="truncate">{authUser.displayName}</span>
            </span>
            <button
              onClick={() => {
                void logout().finally(() => setAuthUser(null));
              }}
              title="Encerrar sessão"
              className="btn !bg-rose-600/80 hover:!bg-rose-700"
            >
              <LogOut size={13} /> Sair
            </button>
          </div>
        </div>
      </header>

      {clock.simOn && (
        <div className="border-b border-fuchsia-400 bg-fuchsia-600 px-4 py-1.5 text-center text-xs font-bold text-white">
          Modo Simulação ativo — alertas e alterações simuladas ficam apenas na memória e NÃO são gravados no banco. Desative a simulação para recarregar os dados reais.
        </div>
      )}

      {/* PAINEL DE RESUMO RÁPIDO CLICÁVEL (PRESENCIAL + HOME OFFICE) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
        {summaryCards.map((c) => {
          const active = statusF === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatusF(active ? 'all' : c.key)}
              title={`Filtrar por ${c.label}`}
              className={`flex flex-col items-start rounded-lg border px-2.5 py-1 text-left transition hover:shadow-sm active:scale-[0.98] ${c.cls} ${
                active ? 'ring-2 ring-navy ring-offset-1 dark:ring-sky-400' : ''
              }`}
            >
              <div className="flex w-full items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{c.label}</span>
                <span className={`text-base font-black tabular-nums leading-none ${c.valCls}`}>{c.stat.total}</span>
              </div>
              <span className="mt-0.5 text-[9.5px] font-medium text-slate-500 dark:text-slate-400">
                Pres: {c.stat.pres} · HO: {c.stat.ho}
              </span>
            </button>
          );
        })}

        {statusF !== 'all' && (
          <button
            type="button"
            onClick={() => setStatusF('all')}
            className="flex items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-xs font-bold text-white shadow hover:bg-navy/90 active:scale-95"
          >
            <X size={13} /> Mostrar Todos
          </button>
        )}

        {scheduledToLog.length > 0 && (
          <button
            onClick={confirmAllScheduled}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
          >
            <Check size={14} strokeWidth={3} /> Dar OK nos {scheduledToLog.length} do Horário
          </button>
        )}

        {overdueLogouts.length > 0 && (
          <button
            onClick={confirmAllOverdueLogouts}
            className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-700 active:scale-95 transition"
          >
            <Check size={14} strokeWidth={3} /> Confirmar Logout dos {overdueLogouts.length} Vencidos
          </button>
        )}

        <span
          className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
            !online
              ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              : realtimeStatus === 'connected'
                ? 'bg-emerald-100 text-emerald-800'
                : realtimeStatus === 'error'
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
          }`}
        >
          {!online || realtimeStatus === 'error' ? <WifiOff size={14} /> : <Wifi size={14} />}{' '}
          {!online
            ? 'Modo Local (Testes)'
            : realtimeStatus === 'connected'
              ? 'Supabase Online'
              : realtimeStatus === 'error'
                ? 'Realtime Offline'
                : 'Conectando…'}
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
          className="input !w-48 font-medium"
          value={statusF}
          onChange={(e) => setStatusF(e.target.value as StatusFilter)}
        >
          <option value="all">Status: Todos</option>
          <option value="alert">Em Alerta ({summary.alert.total})</option>
          <option value="logged">Logados ({summary.logged.total})</option>
          <option value="break">Em Pausa ({summary.break.total})</option>
          <option value="incident">🟠 Ocorrências HO ({summary.incident.total})</option>
          <option value="falta">🚫 Faltas ({summary.falta.total})</option>
          <option value="atestado">📋 Atestados ({summary.atestado.total})</option>
          <option value="dsr">🏖️ DSR ({summary.dsr.total})</option>
          <option value="ferias">✈️ Férias ({summary.ferias.total})</option>
          <option value="maint">🔧 Manutenção ({summary.maint.total})</option>
          <option value="free">Livres ({summary.free.total})</option>
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
          <Legend c="bg-[#FED7AA] border-orange-500" t="Ocorrência HO" />
          <Legend c="bg-[#FFC7CE] border-rose-500" t="Falta" />
          <Legend c="bg-[#B7DEE8] border-cyan-500" t="Atestado" />
          <Legend c="bg-[#E4DFEC] border-purple-500" t="DSR" />
          <Legend c="bg-[#E0E7FF] border-indigo-400" t="Férias" />
          <Legend c="bg-[#F2F2F2] border-slate-400" t="Livre" />
          <Legend c="bg-[#FFE699] border-amber-400" t="Supervisor" />
          <Legend c="bg-red-500 border-red-700" t="Alerta" />
        </div>
        {msg && <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">{msg}</span>}
        {error && <span className="ml-auto text-xs font-semibold text-red-600">⚠ {error}</span>}
      </div>

      {/* MAPA + GRADE HOME OFFICE + PAINEL */}
      <div className="flex min-h-0 flex-1">
        <main className="flex-1 overflow-auto">
          {(tab === 'presencial' || tab === 'all') && <FloorMap renderCard={renderCard} />}
          {(tab === 'ho' || tab === 'all') && (
            <div className={tab === 'all' ? 'border-t-2 border-indigo-200 dark:border-indigo-900' : ''}>
              <HomeOfficeGrid
                hoWorkstations={hoWorkstations}
                views={views}
                renderCard={renderCard}
                onAddSlot={addHomeOfficeSlot}
              />
            </div>
          )}
        </main>
        <AlertPanel pending={pending} history={history} onAck={ack} onAckAll={ackAllAlerts} onLocate={locate} />
      </div>

      {editWs && (
        <EditModal
          key={editWs.id}
          ws={editWs}
          shifts={snap.shifts.filter((s) => s.wsId === editWs.id)}
          allWs={snap.workstations}
          occupiedWsIds={occupiedWsIds}
          today={today}
          getNow={getNow}
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
            if (clock.simOn) {
              flash('Desative o Modo Simulação antes de sincronizar.');
              return;
            }
            if (
              !window.confirm(
                'Enviar os dados salvos no localStorage deste navegador para o Supabase? Registros com o mesmo ID serão sobrescritos.',
              )
            )
              return;
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
            const typed = window.prompt(
              'Ação destrutiva! Isso apagará TODOS os operadores e logs do banco.\nDigite APAGAR para confirmar:',
            );
            if (typed?.trim().toUpperCase() !== 'APAGAR') return;
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

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${c}`} />
      {t}
    </span>
  );
}
