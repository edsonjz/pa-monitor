import assert from 'node:assert/strict';
import test from 'node:test';
import { addDaysStr, fmtMin, parseTimeCell, toMin } from '../src/lib/time';

test('toMin converte horários válidos e rejeita inválidos', () => {
  assert.equal(toMin('08:30'), 510);
  assert.equal(toMin(' 9:05 '), 545);
  assert.equal(toMin('23:59'), 1439);
  assert.equal(toMin('24:00'), null);
  assert.equal(toMin('12:60'), null);
  assert.equal(toMin(''), null);
  assert.equal(toMin(null), null);
});

test('fmtMin formata com wrap em 24h', () => {
  assert.equal(fmtMin(0), '00:00');
  assert.equal(fmtMin(510), '08:30');
  assert.equal(fmtMin(1500), '01:00');
  assert.equal(fmtMin(-60), '23:00');
});

test('addDaysStr trata virada de mês e ano no calendário local', () => {
  assert.equal(addDaysStr('2026-11-22', 1), '2026-11-23');
  assert.equal(addDaysStr('2026-11-01', -1), '2026-10-31');
  assert.equal(addDaysStr('2026-01-01', -1), '2025-12-31');
  assert.equal(addDaysStr('2026-12-31', 1), '2027-01-01');
});

test('parseTimeCell converte frações numéricas, Date e strings', () => {
  assert.equal(parseTimeCell(0.5), '12:00');
  assert.equal(parseTimeCell(0.34375), '08:15');
  assert.equal(parseTimeCell(new Date(2026, 10, 22, 9, 45)), '09:45');
  assert.equal(parseTimeCell('8h30'), '08:30');
  assert.equal(parseTimeCell('08:00'), '08:00');
  assert.equal(parseTimeCell('invalido'), '');
  assert.equal(parseTimeCell(null), '');
});
