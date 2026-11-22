import * as XLSX from 'xlsx';
import type { Shift, Workstation } from '../types';
import { shiftCycleDate } from './engine';
import { hoId, hoNumber, isHomeOfficeWs, makeHomeOfficeWs } from './layout';
import { emptyShift } from './seed';
import { fmtClock, minOfDay, parseTimeCell, todayStr } from './time';

const HEAD = [
  'Código PA',
  'Modalidade',
  'Tipo',
  'Nome',
  'Equipe/Supervisor',
  'Status / Presença',
  'Entrada',
  'Pausa 10 (1)',
  'Pausa 1h',
  'Pausa 10 (2)',
  'Saída',
  'Observações',
  'Turno',
];

const typeLabel = (w: Workstation) => (w.type === 'supervisor' ? 'Supervisor' : 'Operador');
const modalityLabel = (w: Workstation) => (isHomeOfficeWs(w) ? 'Home Office' : 'Presencial');

const statusLabel = (s: Shift): string => {
  switch (s.currentState) {
    case 'logged':
      return 'Logado';
    case 'break':
      return 'Em Pausa';
    case 'falta':
      return 'Falta';
    case 'atestado':
      return 'Atestado';
    case 'dsr':
      return 'DSR';
    case 'ferias':
      return 'Férias';
    case 'no_internet':
      return 'Sem Internet';
    case 'no_power':
      return 'Sem Energia';
    case 'tech_issue':
      return 'Problema Técnico';
    case 'done':
      return 'Finalizado';
    default:
      return 'Pendente';
  }
};

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

function sanitizeCell(value: string | number): string | number {
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function save(rows: (string | number)[][], name: string, sheet: string) {
  const safeRows = rows.map((r) => r.map(sanitizeCell));
  const ws = XLSX.utils.aoa_to_sheet(safeRows);
  ws['!cols'] = HEAD.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, name);
}

export function downloadTemplate(wss: Workstation[]) {
  const examples: Record<string, string[]> = {
    'PA-01': ['Maria Souza', 'Victoria', 'Logado', '08:00', '09:45', '12:00', '15:00', '17:20', 'Exemplo Presencial', 'Manhã'],
    'PA-07': ['João Lima', 'Edson', 'Pendente', '08:30', '10:15', '12:30', '15:30', '17:50', 'Exemplo Presencial', 'Manhã'],
    'PA-12': ['Larissa', 'Edson', 'Falta', '07:10', '09:10', '11:50', '13:20', '15:20', 'Falta informada', 'Manhã'],
    'PA-31': ['Ana Paula', 'Pablo', 'Atestado', '12:30', '14:15', '17:00', '19:30', '21:54', 'Atestado médico', 'Tarde'],
    'SUP-01': ['Victoria', '', 'Logado', '06:00', '09:30', '11:30', '14:00', '15:24', 'Supervisor exemplo', 'Manhã'],
    'HO-01': ['Lucas Martins', 'Edson', 'Logado', '08:00', '10:00', '12:00', '15:00', '17:00', 'Exemplo Home Office', 'Manhã'],
    'HO-02': ['Camila Reis', 'Victoria', 'Sem Internet', '09:00', '10:50', '13:00', '15:30', '18:00', 'Ocorrência remota', 'Manhã'],
  };
  const rows = wss.map((w) => [
    w.code,
    modalityLabel(w),
    typeLabel(w),
    ...(examples[w.code] ?? ['', '', '', '', '', '', '', '', '', '']),
  ]);
  save([HEAD, ...rows], 'planilha-modelo-pas.xlsx', 'Escala');
}

export function exportCurrent(wss: Workstation[], shifts: Shift[]) {
  const rows: string[][] = [];
  for (const w of wss) {
    const list = shifts.filter((s) => s.wsId === w.id);
    if (!list.length) rows.push([w.code, modalityLabel(w), typeLabel(w), '', '', '', '', '', '', '', '', '', '']);
    list.forEach((s) =>
      rows.push([
        w.code,
        modalityLabel(w),
        typeLabel(w),
        s.operatorName,
        s.team,
        statusLabel(s),
        s.loginTime,
        s.break101Time,
        s.break60Time,
        s.break102Time,
        s.logoutTime,
        s.notes,
        s.shiftLabel,
      ]),
    );
  }
  save([HEAD, ...rows], `escala-atual-${todayStr(new Date())}.xlsx`, 'Escala');
}

const norm = (k: string) =>
  k
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normCode = (c: string) => {
  const s = String(c).trim().toUpperCase();
  const m = /^(PA|SUP|HO)[-\s_]?0*(\d+)$/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : s;
};

export interface ImportResult {
  shifts: Shift[];
  affectedWs: Set<string>;
  emptyWs: Set<string>;
  newWorkstations: Workstation[];
  warnings: string[];
}

export async function parseImport(file: File, wss: Workstation[]): Promise<ImportResult> {
  if (!ALLOWED_EXT.test(file.name)) {
    throw new Error('Formato inválido. Envie um arquivo .xlsx, .xls ou .csv.');
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('Arquivo excede o limite máximo de 5 MB.');
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: MAX_IMPORT_ROWS + 2 });
  const sheet = wb.SheetNames.length ? wb.Sheets[wb.SheetNames[0]] : undefined;
  if (!sheet) {
    throw new Error('Planilha vazia ou inválida.');
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`A planilha excede o limite de ${MAX_IMPORT_ROWS} linhas.`);
  }
  const byCode = new Map(wss.map((w) => [normCode(w.code), w]));
  const shifts: Shift[] = [];
  const affected = new Set<string>();
  const emptyWs = new Set<string>();
  const newWorkstations: Workstation[] = [];
  const warnings: string[] = [];
  const now = new Date();
  const today = todayStr(now);
  const nowMin = minOfDay(now);
  const nowHHMM = fmtClock(now).slice(0, 5);

  let nextHoNum = wss.reduce((m, w) => (isHomeOfficeWs(w) ? Math.max(m, hoNumber(w.id)) : m), 0) + 1;
  const usedHoIds = new Set<string>();

  rows.forEach((row, i) => {
    const r: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => (r[norm(k)] = v));

    const modRaw = String(r['modalidade'] ?? r['local'] ?? '').toLowerCase();
    const isRowHO = modRaw.includes('home') || modRaw === 'ho' || modRaw.includes('remoto');

    let rawCode = String(r['codigopa'] ?? r['pa'] ?? '').trim();
    const name = String(r['nome'] ?? '').trim();
    const times = [r['entrada'], r['pausa101'], r['pausa1h'], r['pausa102'], r['saida']].map(parseTimeCell);

    if (!rawCode && isRowHO && (name || times.some(Boolean))) {
      // Atribui automaticamente o próximo código HO disponível se modalidade for Home Office sem código
      const available = wss.find((w) => isHomeOfficeWs(w) && !usedHoIds.has(w.id));
      if (available) {
        rawCode = available.code;
      } else {
        rawCode = hoId(nextHoNum++);
      }
    }

    if (!rawCode) return;

    const normalized = normCode(rawCode);
    let ws = byCode.get(normalized);

    if (!name && times.every((t) => !t)) {
      if (ws) emptyWs.add(ws.id);
      return;
    }

    // Se for código HO-XX novo além dos 24 existentes, cria dinamicamente
    if (!ws && /^HO-\d+$/.test(normalized)) {
      const n = hoNumber(normalized);
      ws = makeHomeOfficeWs(n);
      byCode.set(normalized, ws);
      newWorkstations.push(ws);
      if (n >= nextHoNum) nextHoNum = n + 1;
    }

    if (!ws) {
      warnings.push(`Linha ${i + 2}: PA "${rawCode}" não existe no mapa — ignorada.`);
      return;
    }

    if (isHomeOfficeWs(ws)) usedHoIds.add(ws.id);

    // Detecção automática de Status, Ausências e Ocorrências Remotas
    const statusVal = String(r['status'] ?? r['statuspresenca'] ?? r['situacao'] ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const obsVal = String(r['observacoes'] ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let detectedState: Shift['currentState'] = 'pending';
    let incidentTime = '';

    if (statusVal.includes('falta') || obsVal.includes('falta')) {
      detectedState = 'falta';
    } else if (statusVal.includes('atestado') || obsVal.includes('atestado')) {
      detectedState = 'atestado';
    } else if (
      statusVal.includes('dsr') ||
      statusVal.includes('folga') ||
      obsVal.includes('dsr') ||
      obsVal.includes('folga')
    ) {
      detectedState = 'dsr';
    } else if (statusVal.includes('ferias') || obsVal.includes('ferias')) {
      detectedState = 'ferias';
    } else if (statusVal.includes('internet') || obsVal.includes('sem internet')) {
      detectedState = 'no_internet';
      incidentTime = nowHHMM;
    } else if (statusVal.includes('energia') || obsVal.includes('sem energia')) {
      detectedState = 'no_power';
      incidentTime = nowHHMM;
    } else if (statusVal.includes('tecnic') || statusVal.includes('(ti)') || obsVal.includes('problema tecnic')) {
      detectedState = 'tech_issue';
      incidentTime = nowHHMM;
    } else if (statusVal.includes('pausa')) {
      detectedState = 'break';
    } else if (statusVal.includes('logad')) {
      detectedState = 'logged';
    }

    affected.add(ws.id);
    emptyWs.delete(ws.id);
    const shift: Shift = {
      ...emptyShift(ws.id, String(r['turno'] ?? '').trim() || 'Manhã'),
      operatorName: name,
      team: String(r['equipesupervisor'] ?? '').trim(),
      loginTime: times[0],
      break101Time: times[1],
      break60Time: times[2],
      break102Time: times[3],
      logoutTime: times[4],
      notes: String(r['observacoes'] ?? '').trim(),
      currentState: detectedState,
      stateDate: '',
      incidentTime,
    };
    if (detectedState !== 'pending') {
      shift.stateDate = shiftCycleDate(shift, today, nowMin);
    }
    shifts.push(shift);
  });
  return { shifts, affectedWs: affected, emptyWs, newWorkstations, warnings };
}
