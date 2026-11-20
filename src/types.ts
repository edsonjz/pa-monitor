export type WsType = 'operator' | 'supervisor';
export type WsStatus = 'active' | 'maintenance';

export interface Workstation {
  id: string;
  code: string;
  label: string;
  type: WsType;
  blockName: string;
  gridPosition: string;
  status: WsStatus;
  updatedAt: string;
}

export type ShiftState = 'pending' | 'logged' | 'break' | 'done' | 'falta' | 'atestado' | 'dsr';
export type AbsenceKind = 'falta' | 'atestado' | 'dsr';
export type BreakKind = '' | 'b1' | 'b60' | 'b2';

export interface Shift {
  id: string;
  wsId: string;
  operatorName: string;
  team: string;
  shiftLabel: string;
  loginTime: string;
  break101Time: string;
  break60Time: string;
  break102Time: string;
  logoutTime: string;
  notes: string;
  currentState: ShiftState;
  breakKind: BreakKind;
  stateDate: string;
  updatedAt: string;
}

export type EventType = 'login' | 'b1s' | 'b1r' | 'b60s' | 'b60r' | 'b2s' | 'b2r' | 'logout';

export interface AlertLog {
  id: string;
  shiftId: string;
  wsId: string;
  wsCode: string;
  operatorName: string;
  eventType: EventType;
  scheduledTime: string;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface Snapshot {
  workstations: Workstation[];
  shifts: Shift[];
  alerts: AlertLog[];
}
