import type { AlertLog, BreakKind, EventType, Shift, Workstation } from '../types';
import { fmtMin, toMin } from './time';

export const EVENT_LABEL: Record<EventType, string> = {
  login: 'LOGIN PENDENTE',
  b1s: 'INÍCIO PAUSA 10 (1)',
  b1r: 'RETORNO PAUSA 10 (1)',
  b60s: 'INÍCIO PAUSA 1H',
  b60r: 'RETORNO PAUSA 1H',
  b2s: 'INÍCIO PAUSA 10 (2)',
  b2r: 'RETORNO PAUSA 10 (2)',
  logout: 'HORA DE LOGOUT',
};

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

    const curState = effectiveState(s, today);
    // Operadores em Falta, Atestado ou DSR não geram alertas operacionais
    if (curState === 'falta' || curState === 'atestado' || curState === 'dsr') {
      continue;
    }
    const logoutM = toMin(s.logoutTime);
    const loginM = toMin(s.loginTime);
    const isPastLogout =
      logoutM !== null &&
      loginM !== null &&
      (logoutM < loginM ? nowMin >= logoutM && nowMin < loginM : nowMin >= logoutM);

    for (const ev of shiftEvents(s)) {
      let isDue = due(ev.time, nowMin);

      // 1. Alerta de login pendente: se o horário de entrada já chegou/passou hoje e o operador ainda não foi confirmado como logado (e ainda não passou da saída)
      if (ev.type === 'login' && curState === 'pending') {
        if (loginM !== null && nowMin >= loginM && !isPastLogout) {
          isDue = true;
        }
      }

      // 2. Alerta de retorno de pausa pendente: se o operador está em pausa e já deu o horário de voltar (e ainda não passou da saída)
      if ((ev.type === 'b1r' || ev.type === 'b60r' || ev.type === 'b2r') && curState === 'break') {
        if (nowMin >= ev.time && !isPastLogout) {
          isDue = true;
        }
      }

      if (!isDue) continue;

      const id = alertKey(today, s.id, ev.type, ev.time);
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
      return { ...base, currentState: 'logged', breakKind: '' };
    case 'b1s':
      return { ...base, currentState: 'break', breakKind: 'b1' };
    case 'b60s':
      return { ...base, currentState: 'break', breakKind: 'b60' };
    case 'b2s':
      return { ...base, currentState: 'break', breakKind: 'b2' };
    case 'logout':
      return { ...base, currentState: 'done', breakKind: '' };
  }
}

export const effectiveState = (s: Shift, today: string) =>
  s.stateDate === today ? s.currentState : 'pending';

export function inWindow(s: Shift, now: number): boolean {
  const a = toMin(s.loginTime);
  const bRaw = toMin(s.logoutTime);
  if (a === null || bRaw === null) return false;
  const b = bRaw < a ? bRaw + 1440 : bRaw;
  return (now >= a && now < b) || (now + 1440 >= a && now + 1440 < b);
}

export type Category = 'free' | 'logged' | 'break' | 'maint' | 'falta' | 'atestado' | 'dsr';

export interface WsView {
  ws: Workstation;
  shift: Shift | null;
  count: number;
  state: 'free' | 'pending' | 'logged' | 'break' | 'done' | 'maint' | 'falta' | 'atestado' | 'dsr';
  category: Category;
  alert: AlertLog | null;
  alertCount: number;
}

export function buildViews(
  wss: Workstation[],
  shifts: Shift[],
  pending: AlertLog[],
  now: number,
  today: string,
): Map<string, WsView> {
  const byWs = new Map<string, Shift[]>();
  shifts.forEach((s) => byWs.set(s.wsId, [...(byWs.get(s.wsId) ?? []), s]));
  const alertsByWs = new Map<string, AlertLog[]>();
  pending.forEach((a) => alertsByWs.set(a.wsId, [...(alertsByWs.get(a.wsId) ?? []), a]));
  const map = new Map<string, WsView>();
  for (const ws of wss) {
    const list = byWs.get(ws.id) ?? [];
    const als = alertsByWs.get(ws.id) ?? [];
    let shift: Shift | null = null;
    if (als.length) shift = list.find((s) => s.id === als[0].shiftId) ?? null;
    if (!shift) shift = list.find((s) => inWindow(s, now)) ?? null;
    if (!shift) shift = list.find((s) => ['logged', 'break', 'falta', 'atestado', 'dsr'].includes(effectiveState(s, today))) ?? null;
    if (!shift) shift = list[0] ?? null;
    let state: WsView['state'] = 'free';
    if (ws.status === 'maintenance') state = 'maint';
    else if (shift) state = effectiveState(shift, today);
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
        : 'free';
    map.set(ws.id, {
      ws,
      shift,
      count: list.length,
      state,
      category,
      alert: als[0] ?? null,
      alertCount: als.length,
    });
  }
  return map;
}
