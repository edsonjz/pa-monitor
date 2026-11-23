import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  FileSpreadsheet,
  Download,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  Settings,
  Sun,
  Upload,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AlertLog, Shift, Snapshot, Workstation } from './types';
import { useStore } from './hooks/useStore';
import { useClock } from './hooks/useClock';
import {
  applyAck,
  buildViews,
  detectAlerts,
  effectiveState,
  inWindow,
  isIncidentState,
  isPastShiftLogout,
  shiftCycleDate,
} from './lib/engine';
import { fmtClock, minOfDay, todayStr } from './lib/time';
import { beep } from './lib/sound';
import { defaultWorkstations, hoNumber, isHomeOfficeId, isHomeOfficeWs, makeHomeOfficeWs } from './lib/layout';
import { storageMode, syncLocalToSupabase } from './services/storageService';
import { type AuthUser, getInitialAuthUser, logout, subscribeAuthState } from './services/authService';
import FloorMap from './components/FloorMap';
import HomeOfficeGrid from './components/HomeOfficeGrid';
import PACard from './components/PACard';
import EditModal from './components/EditModal';
import AlertPanel from './components/AlertPanel';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';
import HeaderClock from './components/HeaderClock';
import SummaryBar, { type StatusFilter, type SummaryStats } from './components/SummaryBar';
import FilterBar from './components/FilterBar';

type ViewTab = 'presencial' | 'ho' | 'all';

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
  const { snap, ref, update, error, realtimeStatus } = useStore(isAuth);

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

  const { now, getNow } = clock;
  const nowRef = useRef(now);
  nowRef.current = now;

  const [tab, setTab] = useState<ViewTab>('presencial');
  const [dark, setDark] = useState(() => localStorage.getItem('pa-dark') === '1');
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('pa-sound') !== '0');
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [teamF, setTeamF] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('pa-dark', dark ? '1' : '0');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('pa-sound', soundOn ? '1' : '0');
  }, [soundOn]);

  const today = todayStr(now);
  const nowMin = minOfDay(now);

  // Motor de alertas: avalia na virada de minuto ou alteração do snapshot (com pequeno jitter em nuvem)
  useEffect(() => {
    if (!isAuth || !snap) return;
    const delay = storageMode === 'supabase' ? Math.floor(Math.random() * 1200) : 0;
    const t = setTimeout(() => {
      const s = ref.current;
      if (!s) return;
      const curNow = getNow();
      const curToday = todayStr(curNow);
      const curMin = minOfDay(curNow);
      const existing = new Set(s.alerts.map((a) => a.id));
      const created = detectAlerts(s.shifts, s.workstations, existing, curMin, curToday, curNow.toISOString());
      if (created.length) {
        update((cur) => ({
          ...cur,
          alerts: [...cur.alerts, ...created.filter((c) => !cur.alerts.some((a) => a.id === c.id))],
        }));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [isAuth, clock.minuteKey, snap, getNow, ref, update]);

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

  const hasPending = pending.length > 0;
  // Som: bipe contínuo e suave enquanto houver alertas pendentes e usuário autenticado
  useEffect(() => {
    if (!isAuth || !soundOn || !hasPending) return;
    beep();
    const i = setInterval(beep, 4000);
    return () => clearInterval(i);
  }, [isAuth, soundOn, hasPending]);

  const views = useMemo(
    () => buildViews(snap?.workstations ?? [], snap?.shifts ?? [], pending, nowMin, today),
    [snap, pending, nowMin, today],
  );

  const shiftsByWs = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of snap?.shifts ?? []) {
      let arr = map.get(s.wsId);
      if (!arr) {
        arr = [];
        map.set(s.wsId, arr);
      }
      arr.push(s);
    }
    return map;
  }, [snap]);

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
    () => pending.filter((a) => !isHomeOfficeId(a.wsId, a.wsCode)).length,
    [pending],
  );
  const pendingHO = useMemo(
    () => pending.filter((a) => isHomeOfficeId(a.wsId, a.wsCode)).length,
    [pending],
  );

  // Resumo rápido por status com quebra Presencial vs Home Office
  const summary: SummaryStats = useMemo(() => {
    const empty = () => ({ total: 0, pres: 0, ho: 0 });
    const stats: SummaryStats = {
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

  const matchingIds = useMemo(() => {
    const matched = new Set<string>();
    const q = search.trim().toLowerCase();
    for (const [id, v] of views.entries()) {
      const list = shiftsByWs.get(id) ?? [];
      if (q && !(v.ws.code.toLowerCase().includes(q) || list.some((s) => s.operatorName.toLowerCase().includes(q)))) {
        continue;
      }
      if (teamF && !list.some((s) => s.team === teamF || (v.ws.type === 'supervisor' && s.operatorName === teamF))) {
        continue;
      }
      if (statusF === 'alert' && !v.alert) continue;
      if (statusF !== 'all' && statusF !== 'alert' && v.category !== statusF) continue;
      matched.add(id);
    }
    return matched;
  }, [views, shiftsByWs, search, teamF, statusF]);

  const flash = useCallback((m: string) => {
    clearTimeout(flashTimerRef.current);
    setMsg(m);
    flashTimerRef.current = setTimeout(() => setMsg(''), 6000);
  }, []);

  // Confirmação de alerta individual
  const ack = useCallback(
    (id: string) =>
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
      }),
    [update],
  );

  // Confirmação de todos os alertas pendentes de uma só vez (O(A + S))
  const ackAllAlerts = useCallback(() => {
    if (!pending.length) return;
    update((s) => {
      const curNow = nowRef.current;
      const iso = curNow.toISOString();
      const dStr = todayStr(curNow);
      const nowM = minOfDay(curNow);
      const byShiftId = new Map(s.shifts.map((sh) => [sh.id, sh]));
      for (const a of s.alerts) {
        if (a.acknowledgedAt) continue;
        const curShift = byShiftId.get(a.shiftId);
        if (curShift) {
          byShiftId.set(a.shiftId, applyAck(curShift, a.eventType, shiftCycleDate(curShift, dStr, nowM), iso));
        }
      }
      return {
        ...s,
        shifts: s.shifts.map((sh) => byShiftId.get(sh.id) ?? sh),
        alerts: s.alerts.map((a) => (a.acknowledgedAt ? a : { ...a, acknowledgedAt: iso })),
      };
    });
    flash(`Todos os ${pending.length} alerta(s) foram confirmados.`);
  }, [pending.length, update, flash]);

  // Botão de ação rápida "OK" direto na PA (confirma presença ou normaliza ocorrência remota)
  const quickLog = useCallback(
    (shiftId: string) => {
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
      flash(
        wasIncident ? 'Ocorrência normalizada · Operador Logado (Verde).' : 'Operador confirmado como Logado (Verde).',
      );
    },
    [update, flash],
  );

  // Botão rápido "Deslogar" para confirmar encerramento do turno vencido
  const quickLogout = useCallback(
    (shiftId: string) => {
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
    },
    [update, flash],
  );

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
  const confirmAllScheduled = useCallback(() => {
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
  }, [scheduledToLog, update, flash]);

  // Confirmar logout em lote para todos os operadores com horário de saída vencido
  const confirmAllOverdueLogouts = useCallback(() => {
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
  }, [overdueLogouts, update, flash]);

  // Localizar inteligente: muda automaticamente para a aba certa (Presencial ou Home Office) e destaca o card
  const locate = useCallback(
    (wsId: string) => {
      const targetWs = ref.current?.workstations.find((w) => w.id === wsId);
      const targetIsHO = targetWs ? isHomeOfficeWs(targetWs) : isHomeOfficeId(wsId);
      if (targetIsHO && tab === 'presencial') setTab('ho');
      else if (!targetIsHO && tab === 'ho') setTab('presencial');

      clearTimeout(locateScrollTimerRef.current);
      clearTimeout(locateClearTimerRef.current);
      setHighlight(wsId);
      locateScrollTimerRef.current = setTimeout(() => {
        document.getElementById(`pa-${wsId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 80);
      locateClearTimerRef.current = setTimeout(() => setHighlight(null), 3500);
    },
    [ref, tab],
  );

  // Adicionar nova posição dinâmica no Home Office
  const addHomeOfficeSlot = useCallback(() => {
    update((s) => {
      const maxNum = s.workstations
        .filter((w) => isHomeOfficeWs(w))
        .reduce((m, w) => Math.max(m, hoNumber(w.id)), 0);
      const nextWs = makeHomeOfficeWs(maxNum + 1);
      return { ...s, workstations: [...s.workstations, nextWs] };
    });
    flash('Nova posição Home Office adicionada.');
  }, [update, flash]);

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

  const openWs = useCallback((wsId: string) => setEditId(wsId), []);
  const handleDropOn = useCallback((a: string, b: string) => update((s) => swapWs(s, a, b)), [update]);
  const clearStatus = useCallback(() => setStatusF('all'), []);
  const closeEdit = useCallback(() => setEditId(null), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const renderCard = useCallback(
    (id: string) => {
      const v = views.get(id);
      if (!v) return null;
      const span =
        id === 'SUP-01' || id === 'SUP-02' ? '!w-[304px]' : id === 'SUP-03' || id === 'SUP-04' ? '!h-[208px]' : '';
      return (
        <PACard
          view={v}
          spanClass={span}
          dim={!matchingIds.has(id)}
          highlight={highlight === id}
          onOpen={openWs}
          onAck={ack}
          onQuickLog={quickLog}
          onQuickLogout={quickLogout}
          onDropOn={handleDropOn}
        />
      );
    },
    [views, matchingIds, highlight, openWs, ack, quickLog, quickLogout, handleDropOn],
  );

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
  const presencialCount = snap.workstations.length - hoWorkstations.length;
  const blinkHO = tab === 'presencial' && pendingHO > 0;
  const blinkPresencial = tab === 'ho' && pendingPresencial > 0;

  return (
    <div className="flex h-screen flex-col">
      {/* CABEÇALHO + NAVEGAÇÃO POR ABAS */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-navy px-4 py-2 text-white">
        <div>
          <h1 className="text-base font-bold leading-tight">Monitor de PAs — Operação Híbrida</h1>
          <p className="text-[11px] text-sky-200">
            {presencialCount} PAs presenciais · {hoWorkstations.length} posições Home Office
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

        <HeaderClock getNow={getNow} />

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
          <button className="btn" onClick={() => setDark((v) => !v)} aria-label="Alternar tema">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="btn" onClick={() => setShowSettings(true)} aria-label="Abrir configurações">
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

      <SummaryBar
        summary={summary}
        statusF={statusF}
        onSelectStatus={setStatusF}
        onClearStatus={clearStatus}
        scheduledCount={scheduledToLog.length}
        overdueCount={overdueLogouts.length}
        onConfirmScheduled={confirmAllScheduled}
        onConfirmOverdue={confirmAllOverdueLogouts}
        online={online}
        realtimeStatus={realtimeStatus}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        statusF={statusF}
        onStatusChange={setStatusF}
        teamF={teamF}
        onTeamChange={setTeamF}
        teams={teams}
        summary={summary}
        msg={msg}
        error={error}
      />

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
          shifts={shiftsByWs.get(editWs.id) ?? []}
          allWs={snap.workstations}
          occupiedWsIds={occupiedWsIds}
          today={today}
          getNow={getNow}
          onClose={closeEdit}
          onSave={saveWs}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={closeSettings}
          syncing={syncing}
          message={msg}
          onSync={async () => {
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
