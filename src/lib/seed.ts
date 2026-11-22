import type { Shift } from '../types';
import { fmtMin, minOfDay, todayStr } from './time';

export const uid = (p = 'sh') =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${p}-${crypto.randomUUID()}`
    : `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export const emptyShift = (wsId: string, label = 'Manhã'): Shift => ({
  id: uid(),
  wsId,
  operatorName: '',
  team: '',
  shiftLabel: label,
  loginTime: '',
  break101Time: '',
  break60Time: '',
  break102Time: '',
  logoutTime: '',
  notes: '',
  currentState: 'pending',
  breakKind: '',
  stateDate: '',
  incidentTime: '',
  updatedAt: new Date().toISOString(),
});

/** 6 operadores de exemplo com horários próximos do momento atual. */
export function sampleShifts(): Shift[] {
  const d = new Date();
  const n = minOfDay(d);
  const today = todayStr(d);
  const t = (o: number) => fmtMin(n + o);
  const mk = (
    wsId: string,
    name: string,
    team: string,
    o: { l: number; b1: number; b60: number; b2: number; out: number; state: Shift['currentState']; kind?: Shift['breakKind'] },
  ): Shift => ({
    ...emptyShift(wsId),
    id: `sample-${wsId}`,
    operatorName: name,
    team,
    loginTime: t(o.l),
    break101Time: t(o.b1),
    break60Time: t(o.b60),
    break102Time: t(o.b2),
    logoutTime: t(o.out),
    notes: 'Exemplo',
    currentState: o.state,
    breakKind: o.kind ?? '',
    stateDate: o.state === 'pending' ? '' : today,
  });
  return [
    mk('PA-08', 'Patricia', 'Victoria', { l: 1, b1: 90, b60: 200, b2: 330, out: 480, state: 'pending' }),
    mk('PA-10', 'Leonardo Menezes', 'Victoria', { l: -120, b1: 2, b60: 120, b2: 240, out: 360, state: 'logged' }),
    mk('PA-12', 'Larissa', 'Edson', { l: -200, b1: -120, b60: -65, b2: 180, out: 280, state: 'break', kind: 'b60' }),
    mk('PA-14', 'Shaiane', 'Edson', { l: -220, b1: -150, b60: 3, b2: 180, out: 240, state: 'logged' }),
    mk('PA-16', 'Gregory', 'Victoria', { l: -300, b1: -200, b60: -150, b2: 120, out: 4, state: 'logged' }),
    mk('PA-19', 'Kamille', 'Edson', { l: -300, b1: -240, b60: -150, b2: 6, out: 300, state: 'logged' }),
  ];
}
