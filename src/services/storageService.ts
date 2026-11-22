import type { AlertLog, Shift, Snapshot, Workstation } from '../types';
import { defaultWorkstations, ensureHomeOfficeWorkstations } from '../lib/layout';
import { sampleShifts } from '../lib/seed';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const KEY = 'pa-monitor-v1';
export const storageMode: 'local' | 'supabase' = isSupabaseConfigured ? 'supabase' : 'local';
export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error';

/* ---------------- localStorage ---------------- */
export function readLocal(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
const writeLocal = (s: Snapshot) => localStorage.setItem(KEY, JSON.stringify(s));

function initLocal(): Snapshot {
  const existing = readLocal();
  if (existing) {
    const ensured = ensureHomeOfficeWorkstations(existing.workstations, 24);
    if (ensured.length !== existing.workstations.length) {
      const updated = { ...existing, workstations: ensured };
      writeLocal(updated);
      return updated;
    }
    return existing;
  }
  // primeira inicialização: layout + 6 operadores de exemplo
  const snap: Snapshot = { workstations: defaultWorkstations(), shifts: sampleShifts(), alerts: [] };
  writeLocal(snap);
  return snap;
}

/* ---------------- mapeadores Supabase ---------------- */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

const wsToRow = (w: Workstation): Row => ({
  id: w.id, code: w.code, label: w.label, type: w.type, block_name: w.blockName,
  grid_position: w.gridPosition, status: w.status, updated_at: w.updatedAt,
});
const wsFromRow = (r: Row): Workstation => ({
  id: s(r.id), code: s(r.code), label: s(r.label), type: s(r.type) as Workstation['type'],
  blockName: s(r.block_name), gridPosition: s(r.grid_position), status: s(r.status) as Workstation['status'],
  updatedAt: s(r.updated_at),
});
const shiftToRow = (x: Shift): Row => ({
  id: x.id, workstation_id: x.wsId, operator_name: x.operatorName, team: x.team, shift_label: x.shiftLabel,
  login_time: x.loginTime, break10_1_time: x.break101Time, break60_time: x.break60Time,
  break10_2_time: x.break102Time, logout_time: x.logoutTime, notes: x.notes,
  current_state: x.currentState, break_kind: x.breakKind, state_date: x.stateDate,
  incident_time: x.incidentTime || '', updated_at: x.updatedAt,
});
const shiftFromRow = (r: Row): Shift => ({
  id: s(r.id), wsId: s(r.workstation_id), operatorName: s(r.operator_name), team: s(r.team),
  shiftLabel: s(r.shift_label), loginTime: s(r.login_time), break101Time: s(r.break10_1_time),
  break60Time: s(r.break60_time), break102Time: s(r.break10_2_time), logoutTime: s(r.logout_time),
  notes: s(r.notes), currentState: (s(r.current_state) || 'pending') as Shift['currentState'],
  breakKind: s(r.break_kind) as Shift['breakKind'], stateDate: s(r.state_date),
  incidentTime: s(r.incident_time), updatedAt: s(r.updated_at),
});
const alertToRow = (a: AlertLog): Row => ({
  id: a.id, shift_id: a.shiftId, workstation_id: a.wsId, ws_code: a.wsCode, operator_name: a.operatorName,
  event_type: a.eventType, scheduled_time: a.scheduledTime, acknowledged_at: a.acknowledgedAt, created_at: a.createdAt,
});
const alertFromRow = (r: Row): AlertLog => ({
  id: s(r.id), shiftId: s(r.shift_id), wsId: s(r.workstation_id), wsCode: s(r.ws_code),
  operatorName: s(r.operator_name), eventType: s(r.event_type) as AlertLog['eventType'],
  scheduledTime: s(r.scheduled_time), acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
  createdAt: s(r.created_at),
});

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function loadRemote(): Promise<Snapshot> {
  const db = supabase!;
  const cutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const [w, sh, al] = await Promise.all([
    must(db.from('workstations').select('*')),
    must(db.from('operator_shifts').select('*')),
    must(
      db
        .from('alert_logs')
        .select('*')
        .or(`acknowledged_at.is.null,created_at.gte.${cutoffIso}`)
        .order('created_at', { ascending: false })
        .limit(500),
    ),
  ]);
  let workstations = (w as Row[]).map(wsFromRow);
  if (workstations.length === 0) {
    workstations = defaultWorkstations();
    await must(db.from('workstations').upsert(workstations.map(wsToRow)));
  } else {
    const existingIds = new Set(workstations.map((x) => x.id));
    const ensured = ensureHomeOfficeWorkstations(workstations, 24);
    const added = ensured.filter((x) => !existingIds.has(x.id));
    if (added.length > 0) {
      workstations = ensured;
      await must(db.from('workstations').upsert(added.map(wsToRow)));
    }
  }
  return {
    workstations,
    shifts: (sh as Row[]).map(shiftFromRow),
    alerts: (al as Row[]).map(alertFromRow).reverse(),
  };
}

/* ---------------- API pública ---------------- */
export async function loadSnapshot(): Promise<Snapshot> {
  return storageMode === 'supabase' ? loadRemote() : initLocal();
}

function diff<T extends { id: string }>(prev: T[], next: T[]) {
  const pm = new Map(prev.map((x) => [x.id, JSON.stringify(x)]));
  const nm = new Set(next.map((x) => x.id));
  return {
    created: next.filter((x) => !pm.has(x.id)),
    changed: next.filter((x) => pm.has(x.id) && pm.get(x.id) !== JSON.stringify(x)),
    removed: prev.filter((x) => !nm.has(x.id)).map((x) => x.id),
  };
}

export async function persist(prev: Snapshot, next: Snapshot): Promise<void> {
  if (storageMode === 'local') {
    writeLocal(next);
    return;
  }
  const db = supabase!;
  const w = diff(prev.workstations, next.workstations);
  const sh = diff(prev.shifts, next.shifts);
  const al = diff(prev.alerts, next.alerts);
  const ops: PromiseLike<unknown>[] = [];
  const up = (table: string, rows: Row[], ignoreDuplicates = false) =>
    rows.length && ops.push(must(db.from(table).upsert(rows, { ignoreDuplicates })));
  up('workstations', [...w.created, ...w.changed].map(wsToRow));
  up('operator_shifts', [...sh.created, ...sh.changed].map(shiftToRow));
  up('alert_logs', al.created.map(alertToRow), true); // não sobrescreve confirmação de outro supervisor
  up('alert_logs', al.changed.map(alertToRow));
  if (sh.removed.length) ops.push(must(db.from('operator_shifts').delete().in('id', sh.removed)));
  if (al.removed.length) ops.push(must(db.from('alert_logs').delete().in('id', al.removed)));
  await Promise.all(ops);
}

export function subscribeRealtime(
  onChange: () => void,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  if (storageMode !== 'supabase') {
    onStatus?.('idle');
    return () => {};
  }
  const db = supabase!;
  onStatus?.('connecting');
  let t: ReturnType<typeof setTimeout> | undefined;
  const cb = () => {
    clearTimeout(t);
    t = setTimeout(onChange, 150);
  };
  const ch = db.channel('pa-monitor-realtime');
  ['workstations', 'operator_shifts', 'alert_logs'].forEach((table) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb),
  );
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') onStatus?.('connected');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onStatus?.('error');
    }
  });
  return () => {
    clearTimeout(t);
    onStatus?.('idle');
    void db.removeChannel(ch);
  };
}

/** Migra os dados salvos no localStorage para o Supabase (1 clique). */
export async function syncLocalToSupabase(): Promise<number> {
  if (storageMode !== 'supabase') throw new Error('Supabase não configurado.');
  const local = readLocal();
  if (!local) throw new Error('Não há dados locais para sincronizar.');
  const db = supabase!;
  await must(db.from('workstations').upsert(local.workstations.map(wsToRow)));
  if (local.shifts.length) await must(db.from('operator_shifts').upsert(local.shifts.map(shiftToRow)));
  if (local.alerts.length) await must(db.from('alert_logs').upsert(local.alerts.map(alertToRow)));
  return local.workstations.length + local.shifts.length + local.alerts.length;
}
