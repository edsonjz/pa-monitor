import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRealtimeChange } from '../src/services/realtimeReducer';
import type { Snapshot } from '../src/types';

function baseSnapshot(): Snapshot {
  return {
    workstations: [
      {
        id: 'PA-01',
        code: 'PA-01',
        label: 'PA-01',
        type: 'operator',
        blockName: 'Bloco 1',
        gridPosition: 'r1c1',
        status: 'active',
        updatedAt: '2026-11-22T08:00:00.000Z',
      },
    ],
    shifts: [],
    alerts: [],
  };
}

test('applyRealtimeChange aplica INSERT, UPDATE e DELETE nas tabelas', () => {
  const s0 = baseSnapshot();

  const s1 = applyRealtimeChange(s0, {
    table: 'operator_shifts',
    eventType: 'INSERT',
    oldRow: null,
    newRow: {
      id: 'sh-1',
      workstation_id: 'PA-01',
      operator_name: 'Ana',
      team: 'Victoria',
      shift_label: 'Manhã',
      login_time: '08:00',
      break10_1_time: '',
      break60_time: '',
      break10_2_time: '',
      logout_time: '17:20',
      notes: '',
      current_state: 'logged',
      break_kind: '',
      state_date: '2026-11-22',
      incident_time: '',
      updated_at: '2026-11-22T08:00:00.000Z',
    },
  });
  assert.equal(s1.shifts.length, 1);
  assert.equal(s1.shifts[0].operatorName, 'Ana');

  // Eco idêntico preserva a referência exata do Snapshot
  const sEcho = applyRealtimeChange(s1, {
    table: 'operator_shifts',
    eventType: 'UPDATE',
    oldRow: null,
    newRow: {
      id: 'sh-1',
      workstation_id: 'PA-01',
      operator_name: 'Ana',
      team: 'Victoria',
      shift_label: 'Manhã',
      login_time: '08:00',
      break10_1_time: '',
      break60_time: '',
      break10_2_time: '',
      logout_time: '17:20',
      notes: '',
      current_state: 'logged',
      break_kind: '',
      state_date: '2026-11-22',
      incident_time: '',
      updated_at: '2026-11-22T08:00:00.000Z',
    },
  });
  assert.strictEqual(sEcho, s1);

  const s2 = applyRealtimeChange(s1, {
    table: 'alert_logs',
    eventType: 'INSERT',
    oldRow: null,
    newRow: {
      id: 'al-1',
      shift_id: 'sh-1',
      workstation_id: 'PA-01',
      ws_code: 'PA-01',
      operator_name: 'Ana',
      event_type: 'login',
      scheduled_time: '08:00',
      acknowledged_at: null,
      created_at: '2026-11-22T08:00:00.000Z',
    },
  });
  assert.equal(s2.alerts.length, 1);

  const s3 = applyRealtimeChange(s2, {
    table: 'operator_shifts',
    eventType: 'DELETE',
    oldRow: { id: 'sh-1' },
    newRow: null,
  });
  assert.equal(s3.shifts.length, 0);
});
