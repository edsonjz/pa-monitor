import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { Shift, WsStatus, WsType, Workstation } from '../types';
import { emptyShift } from '../lib/seed';

interface Props {
  ws: Workstation;
  shifts: Shift[];
  allWs: Workstation[];
  onClose: () => void;
  onSave: (ws: Workstation, shifts: Shift[], removedIds: string[], moveTo: string) => string | null;
}

const TIME_FIELDS: { key: keyof Shift; label: string }[] = [
  { key: 'loginTime', label: 'Entrada (Login)' },
  { key: 'break101Time', label: 'Pausa 10 (1)' },
  { key: 'break60Time', label: 'Pausa 1h' },
  { key: 'break102Time', label: 'Pausa 10 (2)' },
  { key: 'logoutTime', label: 'Saída (Logout)' },
];

const addMin = (t: string, m: number) => {
  const x = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!x) return '';
  const v = (+x[1] * 60 + +x[2] + m) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

export default function EditModal({ ws, shifts, allWs, onClose, onSave }: Props) {
  const [code, setCode] = useState(ws.code);
  const [type, setType] = useState<WsType>(ws.type);
  const [status, setStatus] = useState<WsStatus>(ws.status);
  const [list, setList] = useState<Shift[]>(shifts.map((s) => ({ ...s })));
  const [moveTo, setMoveTo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const patch = (id: string, p: Partial<Shift>) => setList((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const labels = ['Manhã', 'Tarde', 'Noite'];

  const save = () => {
    const removed = shifts.filter((o) => !list.some((s) => s.id === o.id)).map((s) => s.id);
    const e = onSave({ ...ws, code: code.trim(), type, status, updatedAt: new Date().toISOString() }, list, removed, moveTo);
    if (e) setErr(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy dark:text-sky-300">Editar {ws.code}</h2>
          <button onClick={onClose}><X /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><span className="label">Código / Nº da PA</span><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div><span className="label">Tipo</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as WsType)}>
              <option value="operator">Operador</option><option value="supervisor">Supervisor</option>
            </select></div>
          <div><span className="label">Status manual</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as WsStatus)}>
              <option value="active">Ativa</option><option value="maintenance">Manutenção</option>
            </select></div>
          <div><span className="label">Mover para outra PA</span>
            <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">— manter aqui —</option>
              {allWs.filter((w) => w.id !== ws.id).map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
            </select></div>
        </div>

        <div className="mb-2 mt-5 flex items-center justify-between">
          <h3 className="font-semibold">Turnos / Operadores ({list.length})</h3>
          <button className="flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setList((l) => [...l, emptyShift(ws.id, labels[l.length % 3])])}>
            <Plus size={14} /> Incluir operador
          </button>
        </div>
        {list.length === 0 && <p className="rounded border border-dashed p-4 text-center text-sm text-slate-500">PA livre — nenhum operador cadastrado.</p>}

        {list.map((s) => (
          <div key={s.id} className="mb-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2"><span className="label">Nome</span><input className="input" value={s.operatorName} onChange={(e) => patch(s.id, { operatorName: e.target.value })} /></div>
              <div><span className="label">Equipe / Supervisor</span><input className="input" value={s.team} onChange={(e) => patch(s.id, { team: e.target.value })} /></div>
              <div><span className="label">Turno</span>
                <input className="input" list="turnos" value={s.shiftLabel} onChange={(e) => patch(s.id, { shiftLabel: e.target.value })} />
                <datalist id="turnos">{labels.map((l) => <option key={l} value={l} />)}</datalist></div>

              <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-2.5 dark:bg-slate-800">
                <div className="flex-1 min-w-[200px]">
                  <span className="label">Status do Operador</span>
                  <select
                    className="input font-semibold"
                    value={s.currentState}
                    onChange={(e) => patch(s.id, { currentState: e.target.value as Shift['currentState'], stateDate: todayStr, breakKind: e.target.value === 'break' ? (s.breakKind || 'b60') : '' })}
                  >
                    <option value="logged">🟢 Logado (Verde)</option>
                    <option value="break">🟡 Em Pausa (Amarelo)</option>
                    <option value="falta">🚫 Falta (Ausente)</option>
                    <option value="atestado">📋 Atestado Médico</option>
                    <option value="dsr">🏖️ DSR (Descanso Semanal)</option>
                    <option value="pending">⚪ Aguardando Login (Pendente)</option>
                    <option value="done">⚫ Pós-Logout (Finalizado)</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-3">
                  <button
                    type="button"
                    onClick={() => patch(s.id, { currentState: 'logged', breakKind: '', stateDate: todayStr })}
                    className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
                  >
                    <Check size={13} strokeWidth={3} /> Logado
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(s.id, { currentState: 'falta', breakKind: '', stateDate: todayStr })}
                    className="flex items-center gap-1 rounded bg-rose-600 px-2 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-700 active:scale-95 transition"
                  >
                    🚫 Falta
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(s.id, { currentState: 'atestado', breakKind: '', stateDate: todayStr })}
                    className="flex items-center gap-1 rounded bg-cyan-700 px-2 py-1.5 text-xs font-bold text-white shadow hover:bg-cyan-800 active:scale-95 transition"
                  >
                    📋 Atestado
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(s.id, { currentState: 'dsr', breakKind: '', stateDate: todayStr })}
                    className="flex items-center gap-1 rounded bg-purple-700 px-2 py-1.5 text-xs font-bold text-white shadow hover:bg-purple-800 active:scale-95 transition"
                  >
                    🏖️ DSR
                  </button>
                </div>
              </div>

              {TIME_FIELDS.map((f) => (
                <div key={f.key}>
                  <span className="label">{f.label}</span>
                  <input type="time" className="input" value={s[f.key] as string} onChange={(e) => patch(s.id, { [f.key]: e.target.value } as Partial<Shift>)} />
                  {f.key === 'break101Time' && s.break101Time && <span className="text-[10px] text-slate-500">retorno {addMin(s.break101Time, 10)}</span>}
                  {f.key === 'break60Time' && s.break60Time && <span className="text-[10px] text-slate-500">retorno {addMin(s.break60Time, 60)}</span>}
                  {f.key === 'break102Time' && s.break102Time && <span className="text-[10px] text-slate-500">retorno {addMin(s.break102Time, 10)}</span>}
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4"><span className="label">Observações</span><input className="input" value={s.notes} onChange={(e) => patch(s.id, { notes: e.target.value })} /></div>
            </div>
            <div className="mt-2 text-right">
              <button className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700" onClick={() => setList((l) => l.filter((x) => x.id !== s.id))}>
                <Trash2 size={14} /> Excluir operador
              </button>
            </div>
          </div>
        ))}

        {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-md border px-4 py-2 text-sm dark:border-slate-600" onClick={onClose}>Cancelar</button>
          <button className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
