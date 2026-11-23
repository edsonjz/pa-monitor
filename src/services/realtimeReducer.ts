import type { AlertLog, Shift, Snapshot, Workstation } from '../types';

export type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export const wsToRow = (w: Workstation): Row => ({
  id: w.id,
  code: w.code,
  label: w.label,
  type: w.type,
  block_name: w.blockName,
  grid_position: w.gridPosition,
  status: w.status,
  updated_at: w.updatedAt,
});

export const wsFromRow = (r: Row): Workstation => ({
  id: s(r.id),
  code: s(r.code),
  label: s(r.label),
  type: s(r.type) as Workstation['type'],
  blockName: s(r.block_name),
  gridPosition: s(r.grid_position),
  status: s(r.status) as Workstation['status'],
  updatedAt: s(r.updated_at),
});

export const shiftToRow = (x: Shift): Row => ({
  id: x.id,
  workstation_id: x.wsId,
  operator_name: x.operatorName,
  team: x.team,
  shift_label: x.shiftLabel,
  login_time: x.loginTime,
  break10_1_time: x.break101Time,
  break60_time: x.break60Time,
  break10_2_time: x.break102Time,
  logout_time: x.logoutTime,
  notes: x.notes,
  current_state: x.currentState,
  break_kind: x.breakKind,
  state_date: x.stateDate,
  incident_time: x.incidentTime || '',
  updated_at: x.updatedAt,
});

export const shiftFromRow = (r: Row): Shift => ({
  id: s(r.id),
  wsId: s(r.workstation_id),
  operatorName: s(r.operator_name),
  team: s(r.team),
  shiftLabel: s(r.shift_label),
  loginTime: s(r.login_time),
  break101Time: s(r.break10_1_time),
  break60Time: s(r.break60_time),
  break102Time: s(r.break10_2_time),
  logoutTime: s(r.logout_time),
  notes: s(r.notes),
  currentState: (s(r.current_state) || 'pending') as Shift['currentState'],
  breakKind: s(r.break_kind) as Shift['breakKind'],
  stateDate: s(r.state_date),
  incidentTime: s(r.incident_time),
  updatedAt: s(r.updated_at),
});

export const alertToRow = (a: AlertLog): Row => ({
  id: a.id,
  shift_id: a.shiftId,
  workstation_id: a.wsId,
  ws_code: a.wsCode,
  operator_name: a.operatorName,
  event_type: a.eventType,
  scheduled_time: a.scheduledTime,
  acknowledged_at: a.acknowledgedAt,
  created_at: a.createdAt,
});

export const alertFromRow = (r: Row): AlertLog => ({
  id: s(r.id),
  shiftId: s(r.shift_id),
  wsId: s(r.workstation_id),
  wsCode: s(r.ws_code),
  operatorName: s(r.operator_name),
  eventType: s(r.event_type) as AlertLog['eventType'],
  scheduledTime: s(r.scheduled_time),
  acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
  createdAt: s(r.created_at),
});

export type RealtimeTable = 'workstations' | 'operator_shifts' | 'alert_logs';

export interface RealtimeChange {
  table: RealtimeTable;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRow: Row | null;
  oldRow: Row | null;
}

function upsertItem<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  if (JSON.stringify(list[idx]) === JSON.stringify(item)) return list;
  const next = list.slice();
  next[idx] = item;
  return next;
}

function removeItem<T extends { id: string }>(list: T[], id: string): T[] {
  if (!id) return list;
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return list;
  return list.filter((x) => x.id !== id);
}

/** Aplica eventos Realtime incrementalmente preservando identidade referencial quando nada mudou. */
export function applyRealtimeChange(snap: Snapshot, change: RealtimeChange): Snapshot {
  if (change.table === 'workstations') {
    const nextWs =
      change.eventType === 'DELETE'
        ? removeItem(snap.workstations, s(change.oldRow?.id))
        : change.newRow
          ? upsertItem(snap.workstations, wsFromRow(change.newRow))
          : snap.workstations;
    return nextWs === snap.workstations ? snap : { ...snap, workstations: nextWs };
  }

  if (change.table === 'operator_shifts') {
    const nextShifts =
      change.eventType === 'DELETE'
        ? removeItem(snap.shifts, s(change.oldRow?.id))
        : change.newRow
          ? upsertItem(snap.shifts, shiftFromRow(change.newRow))
          : snap.shifts;
    return nextShifts === snap.shifts ? snap : { ...snap, shifts: nextShifts };
  }

  const nextAlerts =
    change.eventType === 'DELETE'
      ? removeItem(snap.alerts, s(change.oldRow?.id))
      : change.newRow
        ? upsertItem(snap.alerts, alertFromRow(change.newRow))
        : snap.alerts;
  return nextAlerts === snap.alerts ? snap : { ...snap, alerts: nextAlerts };
}
