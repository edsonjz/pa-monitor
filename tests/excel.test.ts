import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseImport, sanitizeCell } from '../src/lib/excel';
import { todayStr } from '../src/lib/time';
import type { Workstation } from '../src/types';

const makeWs = (id: string): Workstation => ({
  id,
  code: id,
  label: id,
  type: 'operator',
  blockName: 'Bloco 1',
  gridPosition: 'r1c1',
  status: 'active',
  updatedAt: '2026-11-22T08:00:00.000Z',
});

function buildWorkbookFile(rows: (string | number)[][], name = 'escala.xlsx'): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Escala');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('sanitizeCell neutraliza fórmulas potencialmente perigosas', () => {
  assert.equal(sanitizeCell('=CMD()'), "'=CMD()");
  assert.equal(sanitizeCell('+1+1'), "'+1+1");
  assert.equal(sanitizeCell('-2+3'), "'-2+3");
  assert.equal(sanitizeCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(sanitizeCell('  =1+1'), "'  =1+1");
  assert.equal(sanitizeCell('\t=1'), "'\t=1");
  assert.equal(sanitizeCell('Maria Souza'), 'Maria Souza');
  assert.equal(sanitizeCell(42), 42);
});

test('parseImport ignora linhas em branco e usa data local em stateDate', async () => {
  const wss = [makeWs('PA-01'), makeWs('PA-02')];
  const file = buildWorkbookFile([
    ['Código PA', 'Nome', 'Equipe/Supervisor', 'Status / Presença', 'Entrada', 'Pausa 10 (1)', 'Pausa 1h', 'Pausa 10 (2)', 'Saída', 'Observações', 'Turno'],
    ['PA-01', 'João Lima', 'Edson', 'Logado', '08:00', '09:45', '12:00', '15:00', '17:20', '', 'Manhã'],
    ['PA-02', '', '', '', '', '', '', '', '', '', ''],
  ]);

  const res = await parseImport(file, wss);
  assert.equal(res.shifts.length, 1);
  assert.equal(res.affectedWs.has('PA-01'), true);
  assert.equal(res.affectedWs.has('PA-02'), false);
  assert.equal(res.emptyWs.has('PA-02'), true);
  assert.equal(res.shifts[0].stateDate, todayStr(new Date()));
});

test('parseImport valida extensão, tamanho máximo e limite de linhas', async () => {
  const wss = [makeWs('PA-01')];
  const badExt = new File(['abc'], 'escala.txt', { type: 'text/plain' });
  await assert.rejects(() => parseImport(badExt, wss), /Formato inválido/);

  const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.xlsx');
  await assert.rejects(() => parseImport(huge, wss), /limite máximo de 5 MB/);

  const header = ['Código PA', 'Nome', 'Entrada'];
  const tooManyRows: (string | number)[][] = [header];
  for (let i = 0; i < 2001; i++) {
    tooManyRows.push(['PA-01', `Op ${i}`, '08:00']);
  }
  const bigSheet = buildWorkbookFile(tooManyRows);
  await assert.rejects(() => parseImport(bigSheet, wss), /limite de 2000 linhas/);
});
