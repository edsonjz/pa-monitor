import * as XLSX from 'xlsx';
import type { Shift, Workstation } from '../types';
import { emptyShift } from './seed';
import { parseTimeCell } from './time';

const HEAD = ['Código PA', 'Tipo', 'Nome', 'Equipe/Supervisor', 'Entrada', 'Pausa 10 (1)', 'Pausa 1h', 'Pausa 10 (2)', 'Saída', 'Observações', 'Turno'];

const typeLabel = (w: Workstation) => (w.type === 'supervisor' ? 'Supervisor' : 'Operador');

function save(rows: (string | number)[][], name: string, sheet: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = HEAD.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, name);
}

export function downloadTemplate(wss: Workstation[]) {
  const examples: Record<string, string[]> = {
    'PA-01': ['Maria Souza', 'Victoria', '08:00', '09:45', '12:00', '15:00', '17:20', 'Exemplo', 'Manhã'],
    'PA-07': ['João Lima', 'Edson', '08:30', '10:15', '12:30', '15:30', '17:50', 'Exemplo', 'Manhã'],
    'PA-31': ['Ana Paula', 'Pablo', '12:30', '14:15', '17:00', '19:30', '21:54', 'Exemplo', 'Tarde'],
    'SUP-01': ['Victoria', '', '06:00', '09:30', '11:30', '14:00', '15:24', 'Supervisor exemplo', 'Manhã'],
  };
  const rows = wss.map((w) => [w.code, typeLabel(w), ...(examples[w.code] ?? ['', '', '', '', '', '', '', '', ''])]);
  save([HEAD, ...rows], 'planilha-modelo-pas.xlsx', 'Escala');
}

export function exportCurrent(wss: Workstation[], shifts: Shift[]) {
  const rows: string[][] = [];
  for (const w of wss) {
    const list = shifts.filter((s) => s.wsId === w.id);
    if (!list.length) rows.push([w.code, typeLabel(w), '', '', '', '', '', '', '', '', '']);
    list.forEach((s) =>
      rows.push([w.code, typeLabel(w), s.operatorName, s.team, s.loginTime, s.break101Time, s.break60Time, s.break102Time, s.logoutTime, s.notes, s.shiftLabel]),
    );
  }
  save([HEAD, ...rows], `escala-atual-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Escala');
}

const norm = (k: string) =>
  k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const normCode = (c: string) => {
  const s = String(c).trim().toUpperCase();
  const m = /^(PA|SUP)[-\s_]?0*(\d+)$/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : s;
};

export interface ImportResult {
  shifts: Shift[];
  affectedWs: Set<string>;
  warnings: string[];
}

export async function parseImport(file: File, wss: Workstation[]): Promise<ImportResult> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const byCode = new Map(wss.map((w) => [normCode(w.code), w]));
  const shifts: Shift[] = [];
  const affected = new Set<string>();
  const warnings: string[] = [];
  rows.forEach((row, i) => {
    const r: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => (r[norm(k)] = v));
    const code = String(r['codigopa'] ?? '').trim();
    if (!code) return;
    const ws = byCode.get(normCode(code));
    const name = String(r['nome'] ?? '').trim();
    const times = [r['entrada'], r['pausa101'], r['pausa1h'], r['pausa102'], r['saida']].map(parseTimeCell);
    if (!name && times.every((t) => !t)) {
      if (ws) affected.add(ws.id);
      return;
    }
    if (!ws) {
      warnings.push(`Linha ${i + 2}: PA "${code}" não existe no mapa — ignorada.`);
      return;
    }
    affected.add(ws.id);
    shifts.push({
      ...emptyShift(ws.id, String(r['turno'] ?? '').trim() || 'Manhã'),
      operatorName: name,
      team: String(r['equipesupervisor'] ?? '').trim(),
      loginTime: times[0],
      break101Time: times[1],
      break60Time: times[2],
      break102Time: times[3],
      logoutTime: times[4],
      notes: String(r['observacoes'] ?? '').trim(),
    });
  });
  return { shifts, affectedWs: affected, warnings };
}
