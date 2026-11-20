import { useState } from 'react';
import { ArrowRightLeft, Building2, Check, Home, Plus, Trash2, X, Zap } from 'lucide-react';
import type { Shift, WsStatus, WsType, Workstation } from '../types';
import { isIncidentState } from '../lib/engine';
import { hoNumber, isHomeOfficeWs } from '../lib/layout';
import { emptyShift } from '../lib/seed';

interface Props {
  ws: Workstation;
  shifts: Shift[];
  allWs: Workstation[];
  occupiedWsIds: Set<string>;
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

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const QUICK_STATES: {
  state: Shift['currentState'];
  label: string;
  cls: string;
}[] = [
  { state: 'logged', label: '🟢 Logado (OK)', cls: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { state: 'break', label: '🟡 Em Pausa', cls: 'bg-amber-500 text-amber-950 hover:bg-amber-600' },
  { state: 'falta', label: '🚫 Falta', cls: 'bg-rose-600 text-white hover:bg-rose-700' },
  { state: 'atestado', label: '📋 Atestado', cls: 'bg-cyan-700 text-white hover:bg-cyan-800' },
  { state: 'dsr', label: '🏖️ DSR', cls: 'bg-purple-700 text-white hover:bg-purple-800' },
  { state: 'ferias', label: '✈️ Férias', cls: 'bg-indigo-600 text-white hover:bg-indigo-700' },
  { state: 'pending', label: '⚪ Pendente', cls: 'bg-slate-600 text-white hover:bg-slate-700' },
];

const INCIDENT_STATES: {
  state: Shift['currentState'];
  label: string;
}[] = [
  { state: 'no_internet', label: '🌐 Sem Internet' },
  { state: 'no_power', label: '⚡ Sem Energia' },
  { state: 'tech_issue', label: '💻 Problema Técnico (TI)' },
];

export default function EditModal({ ws, shifts, allWs, occupiedWsIds, onClose, onSave }: Props) {
  const [code, setCode] = useState(ws.code);
  const [type, setType] = useState<WsType>(ws.type);
  const [status, setStatus] = useState<WsStatus>(ws.status);
  const [list, setList] = useState<Shift[]>(shifts.map((s) => ({ ...s })));
  const [moveTo, setMoveTo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const isHO = isHomeOfficeWs(ws);
  const freeHO = allWs
    .filter((w) => w.id !== ws.id && isHomeOfficeWs(w) && w.status === 'active' && !occupiedWsIds.has(w.id))
    .sort((a, b) => hoNumber(a.id) - hoNumber(b.id));
  const freePresencial = allWs.filter(
    (w) => w.id !== ws.id && !isHomeOfficeWs(w) && w.type === 'operator' && w.status === 'active' && !occupiedWsIds.has(w.id),
  );
  const freeIds = new Set([...freeHO.map((w) => w.id), ...freePresencial.map((w) => w.id)]);
  const otherWs = allWs.filter((w) => w.id !== ws.id && !freeIds.has(w.id));

  const [quickPresencialId, setQuickPresencialId] = useState(freePresencial[0]?.id ?? '');

  const todayStr = new Date().toISOString().slice(0, 10);
  const patch = (id: string, p: Partial<Shift>) => setList((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const labels = ['Manhã', 'Tarde', 'Noite'];

  const saveList = (targetList: Shift[], targetMoveTo = moveTo) => {
    const removed = shifts.filter((o) => !targetList.some((s) => s.id === o.id)).map((s) => s.id);
    const e = onSave(
      { ...ws, code: code.trim(), type, status, updatedAt: new Date().toISOString() },
      targetList,
      removed,
      targetMoveTo,
    );
    if (e) setErr(e);
  };

  /** Ação rápida de 1 clique: atualiza o status do turno, salva no Supabase e fecha o modal. */
  const quickApplyAndSave = (shiftId: string, newState: Shift['currentState']) => {
    const hhmm = nowHHMM();
    const nextList: Shift[] = list.map((s) => {
      if (s.id !== shiftId) return s;
      const breakKind: Shift['breakKind'] = newState === 'break' ? s.breakKind || 'b60' : '';
      const incidentTime = isIncidentState(newState) ? hhmm : '';
      return {
        ...s,
        currentState: newState,
        breakKind,
        stateDate: newState === 'pending' ? '' : todayStr,
        incidentTime,
      };
    });
    setList(nextList);
    saveList(nextList);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-navy dark:text-sky-300">Editar {ws.code}</h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isHO
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {isHO ? <Home size={12} /> : <Building2 size={12} />} {isHO ? 'Home Office' : 'Presencial'}
            </span>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <span className="label">Código / Nº da PA</span>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <span className="label">Tipo</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as WsType)}>
              <option value="operator">Operador</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div>
            <span className="label">Status manual</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as WsStatus)}>
              <option value="active">Ativa</option>
              <option value="maintenance">Manutenção</option>
            </select>
          </div>
          <div>
            <span className="label">Mover / Transferir para</span>
            <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">— manter aqui —</option>
              {freeHO.length > 0 && (
                <optgroup label="🏠 Home Office Livres">
                  {freeHO.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} (Livre)
                    </option>
                  ))}
                </optgroup>
              )}
              {freePresencial.length > 0 && (
                <optgroup label="🏢 PAs Presenciais Livres">
                  {freePresencial.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} (Livre)
                    </option>
                  ))}
                </optgroup>
              )}
              {otherWs.length > 0 && (
                <optgroup label="🔄 Outras PAs (Trocar de lugar)">
                  {otherWs.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* MOVIMENTAÇÃO HÍBRIDA RÁPIDA (1 CLIQUE) */}
        {list.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/30">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
              <ArrowRightLeft size={14} /> Movimentação Híbrida (mantém horários e pausas intactos):
            </div>
            {!isHO ? (
              freeHO.length > 0 ? (
                <button
                  type="button"
                  onClick={() => saveList(list, freeHO[0].id)}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-indigo-700 active:scale-95 transition"
                >
                  <Home size={13} /> Transferir para Home Office ({freeHO[0].code})
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-500">Nenhuma posição Home Office livre</span>
              )
            ) : freePresencial.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <select
                  className="input !w-36 !py-1 text-xs font-bold"
                  value={quickPresencialId}
                  onChange={(e) => setQuickPresencialId(e.target.value)}
                >
                  {freePresencial.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} (Livre)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => quickPresencialId && saveList(list, quickPresencialId)}
                  className="flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-navy/90 active:scale-95 transition"
                >
                  <Building2 size={13} /> Transferir para Presencial
                </button>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-500">Nenhuma PA presencial livre</span>
            )}
          </div>
        )}

        <div className="mb-2 mt-5 flex items-center justify-between">
          <h3 className="font-semibold">Turnos / Operadores ({list.length})</h3>
          <button
            className="flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => setList((l) => [...l, emptyShift(ws.id, labels[l.length % 3])])}
          >
            <Plus size={14} /> Incluir operador
          </button>
        </div>
        {list.length === 0 && (
          <p className="rounded border border-dashed p-4 text-center text-sm text-slate-500">
            PA livre — nenhum operador cadastrado.
          </p>
        )}

        {list.map((s) => (
          <div key={s.id} className="mb-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700">
            {/* BARRA DE AÇÃO RÁPIDA (1 CLIQUE — SALVA E FECHA) */}
            <div className="mb-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 dark:border-sky-900 dark:bg-sky-950/40">
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                <Zap size={13} /> Ação Rápida (1 Clique — Salva e Fecha)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_STATES.map((q) => {
                  const active = s.currentState === q.state && (q.state === 'pending' || s.stateDate === todayStr);
                  return (
                    <button
                      key={q.state}
                      type="button"
                      onClick={() => quickApplyAndSave(s.id, q.state)}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${q.cls} ${
                        active ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white' : ''
                      }`}
                    >
                      {q.state === 'logged' && <Check size={13} strokeWidth={3} />}
                      {q.label}
                    </button>
                  );
                })}
              </div>

              {/* OCORRÊNCIAS REMOTAS (LARANJA + HISTÓRICO) */}
              <div className="border-t border-sky-200/80 pt-2 dark:border-sky-900/80">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                  Ocorrências Remotas / Home Office (destaca em laranja e registra no histórico)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INCIDENT_STATES.map((inc) => {
                    const active = s.currentState === inc.state && s.stateDate === todayStr;
                    return (
                      <button
                        key={inc.state}
                        type="button"
                        onClick={() => quickApplyAndSave(s.id, inc.state)}
                        className={`flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-95 ${
                          active ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white' : ''
                        }`}
                      >
                        {inc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <span className="label">Nome</span>
                <input
                  className="input"
                  value={s.operatorName}
                  onChange={(e) => patch(s.id, { operatorName: e.target.value })}
                />
              </div>
              <div>
                <span className="label">Equipe / Supervisor</span>
                <input className="input" value={s.team} onChange={(e) => patch(s.id, { team: e.target.value })} />
              </div>
              <div>
                <span className="label">Turno</span>
                <input
                  className="input"
                  list="turnos"
                  value={s.shiftLabel}
                  onChange={(e) => patch(s.id, { shiftLabel: e.target.value })}
                />
                <datalist id="turnos">
                  {labels.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>

              <div className={isIncidentState(s.currentState) ? 'col-span-2 sm:col-span-3' : 'col-span-2 sm:col-span-4'}>
                <span className="label">Status do Operador (ao salvar manualmente)</span>
                <select
                  className="input font-semibold"
                  value={s.currentState}
                  onChange={(e) => {
                    const nextState = e.target.value as Shift['currentState'];
                    patch(s.id, {
                      currentState: nextState,
                      stateDate: nextState === 'pending' ? '' : todayStr,
                      breakKind: nextState === 'break' ? s.breakKind || 'b60' : '',
                      incidentTime: isIncidentState(nextState) ? s.incidentTime || nowHHMM() : '',
                    });
                  }}
                >
                  <option value="logged">🟢 Logado (Verde)</option>
                  <option value="break">🟡 Em Pausa (Amarelo)</option>
                  <option value="falta">🚫 Falta (Ausente)</option>
                  <option value="atestado">📋 Atestado Médico</option>
                  <option value="dsr">🏖️ DSR (Descanso Semanal)</option>
                  <option value="ferias">✈️ Férias</option>
                  <option value="no_internet">🌐 Sem Internet (Ocorrência)</option>
                  <option value="no_power">⚡ Sem Energia (Ocorrência)</option>
                  <option value="tech_issue">💻 Problema Técnico TI (Ocorrência)</option>
                  <option value="pending">⚪ Aguardando Login (Pendente)</option>
                  <option value="done">⚫ Pós-Logout (Finalizado)</option>
                </select>
              </div>

              {isIncidentState(s.currentState) && (
                <div>
                  <span className="label">Hora da ocorrência</span>
                  <input
                    type="time"
                    className="input"
                    value={s.incidentTime}
                    onChange={(e) => patch(s.id, { incidentTime: e.target.value })}
                  />
                </div>
              )}

              {TIME_FIELDS.map((f) => (
                <div key={f.key}>
                  <span className="label">{f.label}</span>
                  <input
                    type="time"
                    className="input"
                    value={s[f.key] as string}
                    onChange={(e) => patch(s.id, { [f.key]: e.target.value } as Partial<Shift>)}
                  />
                  {f.key === 'break101Time' && s.break101Time && (
                    <span className="text-[10px] text-slate-500">retorno {addMin(s.break101Time, 10)}</span>
                  )}
                  {f.key === 'break60Time' && s.break60Time && (
                    <span className="text-[10px] text-slate-500">retorno {addMin(s.break60Time, 60)}</span>
                  )}
                  {f.key === 'break102Time' && s.break102Time && (
                    <span className="text-[10px] text-slate-500">retorno {addMin(s.break102Time, 10)}</span>
                  )}
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4">
                <span className="label">Observações</span>
                <input className="input" value={s.notes} onChange={(e) => patch(s.id, { notes: e.target.value })} />
              </div>
            </div>
            <div className="mt-2 text-right">
              <button
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                onClick={() => setList((l) => l.filter((x) => x.id !== s.id))}
              >
                <Trash2 size={14} /> Excluir operador
              </button>
            </div>
          </div>
        ))}

        {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-md border px-4 py-2 text-sm dark:border-slate-600" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white"
            onClick={() => saveList(list)}
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}
