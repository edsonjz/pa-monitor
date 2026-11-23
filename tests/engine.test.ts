import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAck, buildViews, detectAlerts, effectiveState, shiftCycleDate } from '../src/lib/engine';
import type { AlertLog, Shift, Workstation } from '../src/types';

function makeWs(id = 'PA-01', status: Workstation['status'] = 'active'): Workstation {
  return {
    id,
    code: id,
    label: id,
    type: 'operator',
    blockName: 'Bloco 1',
    gridPosition: 'r1c1',
    status,
    updatedAt: '2026-11-22T08:00:00.000Z',
  };
}

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'sh-1',
    wsId: 'PA-01',
    operatorName: 'Maria Souza',
    team: 'Victoria',
    shiftLabel: 'Manhã',
    loginTime: '08:00',
    break101Time: '09:45',
    break60Time: '12:00',
    break102Time: '15:00',
    logoutTime: '17:20',
    notes: '',
    currentState: 'pending',
    breakKind: '',
    stateDate: '',
    incidentTime: '',
    updatedAt: '2026-11-22T08:00:00.000Z',
    ...overrides,
  };
}

test('detectAlerts dispara alertas diurnos conforme estado atual', () => {
  const wss = [makeWs()];
  const pendingShift = makeShift({ currentState: 'pending' });
  const a1 = detectAlerts([pendingShift], wss, new Set(), 8 * 60 + 5, '2026-11-22', '2026-11-22T11:05:00.000Z');
  assert.equal(a1.length, 1);
  assert.equal(a1[0].eventType, 'login');

  const loggedShift = makeShift({ currentState: 'logged', stateDate: '2026-11-22' });
  const a2 = detectAlerts([loggedShift], wss, new Set(), 9 * 60 + 45, '2026-11-22', '2026-11-22T12:45:00.000Z');
  assert.equal(a2.length, 1);
  assert.equal(a2[0].eventType, 'b1s');

  const outShift = makeShift({ currentState: 'logged', stateDate: '2026-11-22' });
  const a3 = detectAlerts([outShift], wss, new Set(), 17 * 60 + 25, '2026-11-22', '2026-11-22T20:25:00.000Z');
  assert.equal(a3.length, 1);
  assert.equal(a3[0].eventType, 'logout');
});

test('turnos noturnos preservam estado e cycleDate após 00:00', () => {
  const night = makeShift({
    id: 'sh-night',
    loginTime: '22:00',
    break101Time: '23:30',
    break60Time: '01:30',
    break102Time: '04:00',
    logoutTime: '06:00',
    currentState: 'logged',
    stateDate: '2026-11-22',
  });

  assert.equal(shiftCycleDate(night, '2026-11-22', 22 * 60 + 15), '2026-11-22');
  assert.equal(shiftCycleDate(night, '2026-11-23', 1 * 60 + 30), '2026-11-22');
  assert.equal(effectiveState(night, '2026-11-23', 1 * 60 + 30), 'logged');

  // Após o ponto médio (14:00), inicia novo ciclo diário
  assert.equal(shiftCycleDate(night, '2026-11-23', 15 * 60), '2026-11-23');
  assert.equal(effectiveState(night, '2026-11-23', 15 * 60), 'pending');

  const alerts = detectAlerts([night], [makeWs()], new Set(), 1 * 60 + 35, '2026-11-23', '2026-11-23T04:35:00.000Z');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].eventType, 'b60s');
  assert.ok(alerts[0].id.startsWith('2026-11-22|sh-night|b60s|'));
});

test('alerta de retorno de pausa respeita breakKind ativo', () => {
  const onB60 = makeShift({
    currentState: 'break',
    breakKind: 'b60',
    stateDate: '2026-11-22',
    break101Time: '09:45',
    break60Time: '12:00',
  });
  const at1215 = detectAlerts([onB60], [makeWs()], new Set(), 12 * 60 + 15, '2026-11-22', '2026-11-22T15:15:00.000Z');
  assert.equal(at1215.length, 0);

  const at1302 = detectAlerts([onB60], [makeWs()], new Set(), 13 * 60 + 2, '2026-11-22', '2026-11-22T16:02:00.000Z');
  assert.equal(at1302.length, 1);
  assert.equal(at1302[0].eventType, 'b60r');
});

test('applyAck e buildViews mantêm prioridade de alerta e manutenção', () => {
  const base = makeShift({ currentState: 'break', breakKind: 'b1', incidentTime: '10:00' });
  const acked = applyAck(base, 'b1r', '2026-11-22', '2026-11-22T12:55:00.000Z');
  assert.equal(acked.currentState, 'logged');
  assert.equal(acked.breakKind, '');
  assert.equal(acked.incidentTime, '');
  assert.equal(acked.stateDate, '2026-11-22');

  const ws1 = makeWs('PA-01');
  const ws2 = makeWs('PA-02', 'maintenance');
  const sA = makeShift({ id: 'sh-a', wsId: 'PA-01', loginTime: '06:00', logoutTime: '12:00' });
  const sB = makeShift({ id: 'sh-b', wsId: 'PA-01', loginTime: '13:00', logoutTime: '19:00', currentState: 'logged', stateDate: '2026-11-22' });
  const pendingAlert: AlertLog = {
    id: '2026-11-22|sh-a|logout|12:00',
    shiftId: 'sh-a',
    wsId: 'PA-01',
    wsCode: 'PA-01',
    operatorName: 'Maria Souza',
    eventType: 'logout',
    scheduledTime: '12:00',
    acknowledgedAt: null,
    createdAt: '2026-11-22T15:00:00.000Z',
  };

  const views = buildViews([ws1, ws2], [sA, sB], [pendingAlert], 14 * 60, '2026-11-22');
  assert.equal(views.get('PA-01')?.shift?.id, 'sh-a');
  assert.equal(views.get('PA-01')?.alert?.id, pendingAlert.id);
  assert.equal(views.get('PA-02')?.state, 'maint');
});
