import type { AlertLog, BreakKind, EventType, IncidentState, Shift, ShiftState, Workstation } from '../types';
import { addDaysStr, fmtMin, toMin } from './time';

export const EVENT_LABEL: Record<EventType, string> = {
  login: 'LOGIN PENDENTE',
  b1s: 'INÍCIO PAUSA 10 (1)',
  b1r: 'RETORNO PAUSA 10 (1)',
  b60s: 'INÍCIO PAUSA 1H',
  b60r: 'RETORNO PAUSA 1H',
  b2s: 'INÍCIO PAUSA 10 (2)',
  b2r: 'RETORNO PAUSA 10 (2)',
  logout: 'HORA DE LOGOUT',
  no_internet: 'OCORRÊNCIA: SEM INTERNET',
  no_power: 'OCORRÊNCIA: SEM ENERGIA',
  tech_issue: 'OCORRÊNCIA: PROBLEMA TÉCNICO (TI)',
  incident_resolved: 'RETORNO DE OCORRÊNCIA',
};

export const INCIDENT_LABEL: Record<IncidentState, string> = {
  no_internet: 'Sem Internet',
  no_power: 'Sem Energia',
  tech_issue: 'Problema Técnico (TI)',
};

export const isIncidentState = (state: string): state is IncidentState =>
  state === 'no_internet' || state === 'no_power' || state === 'tech_issue';

export const BREAK_LABEL: Record<Exclude<BreakKind, ''>, string> = {
  b1: 'Pausa 10 (1)',
  b60: 'Pausa 1h',
  b2: 'Pausa 10 (2)',
};
const BREAK_DUR: Record<Exclude<BreakKind, ''>, number> = { b1: 10, b60: 60, b2: 10 };

const breakStart = (s: Shift, k: Exclude<BreakKind, ''>) =>
  toMin(k === 'b1' ? s.break101Time : k === 'b60' ? s.break60Time : s.break102Time);

export const breakReturn = (s: Shift, k: Exclude<BreakKind, ''>): string => {
  const st = breakStart(s, k);
  return st === null ? '' : fmtMin(st + BREAK_DUR[k]);
};

/** Eventos do turno, em minutos; horários que "voltam" no relógio são tratados como dia seguinte. */
export function shiftEvents(s: Shift): { type: EventType; time: number }[] {
  const raw: [EventType, number | null][] = [
    ['login', toMin(s.loginTime)],
    ['b1s', toMin(s.break101Time)],
    ['b1r', toMin(s.break101Time) === null ? null : toMin(s.break101Time)! + 10],
    ['b60s', toMin(s.break60Time)],
    ['b60r', toMin(s.break60Time) === null ? null : toMin(s.break60Time)! + 60],
    ['b2s', toMin(s.break102Time)],
    ['b2r', toMin(s.break102Time) === null ? null : toMin(s.break102Time)! + 10],
    ['logout', toMin(s.logoutTime)],
  ];
  const out: { type: EventType; time: number }[] = [];
  let prev = -1;
  for (const [type, t0] of raw) {
    if (t0 === null) continue;
    let t = t0;
    while (t < prev) t += 1440;
    out.push({ type, time: t });
    prev = t;
  }
  return out;
}

const WINDOW = 25; // minutos de tolerância para disparar um evento recém-vencido

const due = (t: number, now: number) => {
  const d = now - t;
  if (d >= 0 && d <= WINDOW) return true;
  const d2 = now + 1440 - t;
  return t >= 1440 && d2 >= 0 && d2 <= WINDOW;
};

export const alertKey = (today: string, shiftId: string, type: EventType, t: number) =>
  `${today}|${shiftId}|${type}|${fmtMin(t)}`;

export function detectAlerts(
  shifts: Shift[],
  wss: Workstation[],
  existing: Set<string>,
  nowMin: number,
  today: string,
  nowIso: string,
): AlertLog[] {
  const wsMap = new Map(wss.map((w) => [w.id, w]));
  const out: AlertLog[] = [];
  for (const s of shifts) {
    const ws = wsMap.get(s.wsId);
    if (!ws || ws.status === 'maintenance') continue;

    const cycleDate = shiftCycleDate(s, today, nowMin);
    const curState = effectiveState(s, today, nowMin);
    // Operadores em ausência ou ocorrência remota não geram alertas de login/pausa/logout
    if (
      curState === 'falta' ||
      curState === 'atestado' ||
      curState === 'dsr' ||
      curState === 'ferias' ||
      isIncidentState(curState)
    ) {
      continue;
    }
    const logoutM = toMin(s.logoutTime);
    const loginM = toMin(s.loginTime);
    const isPastLogout = isPastShiftLogout(s, nowMin);
    const relNow =
      loginM !== null && logoutM !== null && logoutM < loginM && nowMin < loginM ? nowMin + 1440 : nowMin;

    for (const ev of shiftEvents(s)) {
      let isDue = false;

      if (ev.type === 'login') {
        if (curState === 'pending' && !isPastLogout) {
          isDue = logoutM !== null ? inWindow(s, nowMin) : loginM !== null && nowMin >= loginM;
        }
      } else if (ev.type === 'b1s' || ev.type === 'b60s' || ev.type === 'b2s') {
        if (curState === 'logged') {
          isDue = due(ev.time, nowMin);
        }
      } else if (ev.type === 'b1r' || ev.type === 'b60r' || ev.type === 'b2r') {
        const expectedKind = ev.type === 'b1r' ? 'b1' : ev.type === 'b60r' ? 'b60' : 'b2';
        if (curState === 'break' && !isPastLogout && (!s.breakKind || s.breakKind === expectedKind)) {
          if (relNow >= ev.time) isDue = true;
        }
      } else if (ev.type === 'logout') {
        // Dispara continuamente se o operador ainda estiver logado ou em pausa quando chegar/passar o horário de saída
        if (curState === 'logged' || curState === 'break') {
          isDue = isPastLogout || due(ev.time, nowMin);
        }
      }

      if (!isDue) continue;

      const id = alertKey(cycleDate, s.id, ev.type, ev.time);
      if (existing.has(id)) continue;
      existing.add(id);
      out.push({
        id,
        shiftId: s.id,
        wsId: ws.id,
        wsCode: ws.code,
        operatorName: s.operatorName,
        eventType: ev.type,
        scheduledTime: fmtMin(ev.time),
        acknowledgedAt: null,
        createdAt: nowIso,
      });
    }
  }
  return out;
}

export function applyAck(s: Shift, type: EventType, today: string, nowIso: string): Shift {
  const base = { ...s, stateDate: today, updatedAt: nowIso };
  switch (type) {
    case 'login':
    case 'b1r':
    case 'b60r':
    case 'b2r':
    case 'incident_resolved':
      return { ...base, currentState: 'logged', breakKind: '', incidentTime: '' };
    case 'b1s':
      return { ...base, currentState: 'break', breakKind: 'b1' };
    case 'b60s':
      return { ...base, currentState: 'break', breakKind: 'b60' };
    case 'b2s':
      return { ...base, currentState: 'break', breakKind: 'b2' };
    case 'logout':
      return { ...base, currentState: 'done', breakKind: '' };
    case 'no_internet':
    case 'no_power':
    case 'tech_issue':
      return { ...base, currentState: type, breakKind: '' };
  }
}

export function shiftCycleDate(s: Shift, today: string, nowMin?: number): string {
  const loginM = toMin(s.loginTime);
  const logoutM = toMin(s.logoutTime);
  if (nowMin !== undefined && loginM !== null && logoutM !== null && logoutM < loginM) {
    const cutoff = Math.floor((logoutM + loginM) / 2);
    if (nowMin < cutoff) return addDaysStr(today, -1);
  }
  return today;
}

export const effectiveState = (s: Shift, today: string, nowMin?: number): ShiftState => {
  const cycle = shiftCycleDate(s, today, nowMin);
  if (s.stateDate === cycle) return s.currentState;
  if (cycle !== today && s.stateDate === today) return s.currentState;
  return 'pending';
};

export function isPastShiftLogout(s: Shift, nowMin: number): boolean {
  const loginM = toMin(s.loginTime);
  const logoutM = toMin(s.logoutTime);
  if (loginM === null || logoutM === null) return false;
  return logoutM < loginM ? nowMin >= logoutM && nowMin < loginM : nowMin >= logoutM;
}

export function inWindow(s: Shift, now: number): boolean {
  const a = toMin(s.loginTime);
  const bRaw = toMin(s.logoutTime);
  if (a === null || bRaw === null) return false;
  const b = bRaw < a ? bRaw + 1440 : bRaw;
  return (now >= a && now < b) || (now + 1440 >= a && now + 1440 < b);
}

export type Category =
  | 'free'
  | 'logged'
  | 'break'
  | 'maint'
  | 'falta'
  | 'atestado'
  | 'dsr'
  | 'ferias'
  | 'incident';

export interface WsView {
  ws: Workstation;
  shift: Shift | null;
  count: number;
  state: 'free' | 'pending' | ShiftState | 'maint';
  category: Category;
  alert: AlertLog | null;
  alertCount: number;
  pastLogout: boolean;
}

const ACTIVE_STATES: ShiftState[] = [
  'logged',
  'break',
  'falta',
  'atestado',
  'dsr',
  'ferias',
  'no_internet',
  'no_power',
  'tech_issue',
];

export function buildViews(
  wss: Workstation[],
  shifts: Shift[],
  pending: AlertLog[],
  now: number,
  today: string,
): Map<string, WsView> {
  const byWs = new Map<string, Shift[]>();
  for (const s of shifts) {
    let arr = byWs.get(s.wsId);
    if (!arr) {
      arr = [];
      byWs.set(s.wsId, arr);
    }
    arr.push(s);
  }
  const alertsByWs = new Map<string, AlertLog[]>();
  for (const a of pending) {
    let arr = alertsByWs.get(a.wsId);
    if (!arr) {
      arr = [];
      alertsByWs.set(a.wsId, arr);
    }
    arr.push(a);
  }
  const map = new Map<string, WsView>();
  for (const ws of wss) {
    const list = byWs.get(ws.id) ?? [];
    const als = alertsByWs.get(ws.id) ?? [];
    let shift: Shift | null = null;
    if (als.length) shift = list.find((s) => s.id === als[0].shiftId) ?? null;
    if (!shift) shift = list.find((s) => inWindow(s, now)) ?? null;
    if (!shift) shift = list.find((s) => ACTIVE_STATES.includes(effectiveState(s, today, now))) ?? null;
    if (!shift) shift = list[0] ?? null;
    let state: WsView['state'] = 'free';
    if (ws.status === 'maintenance') state = 'maint';
    else if (shift) state = effectiveState(shift, today, now);
    const category: Category =
      state === 'maint'
        ? 'maint'
        : state === 'logged'
        ? 'logged'
        : state === 'break'
        ? 'break'
        : state === 'falta'
        ? 'falta'
        : state === 'atestado'
        ? 'atestado'
        : state === 'dsr'
        ? 'dsr'
        : state === 'ferias'
        ? 'ferias'
        : isIncidentState(state)
        ? 'incident'
        : 'free';
    map.set(ws.id, {
      ws,
      shift,
      count: list.length,
      state,
      category,
      alert: als[0] ?? null,
      alertCount: als.length,
      pastLogout: shift ? isPastShiftLogout(shift, now) : false,
    });
  }
  return map;
}
