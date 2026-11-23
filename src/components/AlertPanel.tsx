import { useState } from 'react';
import { BellRing, Building2, Check, ChevronRight, History, Home, LocateFixed } from 'lucide-react';
import type { AlertLog } from '../types';
import { EVENT_LABEL } from '../lib/engine';
import { isHomeOfficeId } from '../lib/layout';

interface Props {
  pending: AlertLog[];
  history: AlertLog[];
  onAck: (id: string) => void;
  onAckAll?: () => void;
  onLocate: (wsId: string) => void;
}

const hhmmss = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '');

const isHOAlert = (a: AlertLog) => isHomeOfficeId(a.wsId, a.wsCode);

const isIncidentEvent = (t: AlertLog['eventType']) =>
  t === 'no_internet' || t === 'no_power' || t === 'tech_issue';

export default function AlertPanel({ pending, history, onAck, onAckAll, onLocate }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'p' | 'h'>('p');

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="relative flex w-10 shrink-0 flex-col items-center gap-2 border-l border-slate-300 bg-white pt-3 dark:border-slate-700 dark:bg-slate-900"
        title="Abrir alertas"
      >
        <BellRing className={pending.length ? 'text-red-600 animate-bounce' : 'text-slate-500'} size={20} />
        {pending.length > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{pending.length}</span>
        )}
      </button>
    );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b p-2 dark:border-slate-700">
        <div className="flex gap-1 text-xs font-semibold">
          <button
            onClick={() => setTab('p')}
            className={`flex items-center gap-1 rounded px-2 py-1 ${tab === 'p' ? 'bg-red-600 text-white' : ''}`}
          >
            <BellRing size={14} /> Pendentes ({pending.length})
          </button>
          <button
            onClick={() => setTab('h')}
            className={`flex items-center gap-1 rounded px-2 py-1 ${tab === 'h' ? 'bg-navy text-white' : ''}`}
          >
            <History size={14} /> Histórico
          </button>
        </div>
        <button onClick={() => setOpen(false)} title="Recolher">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tab === 'p' && pending.length > 0 && onAckAll && (
          <button
            onClick={onAckAll}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-[0.98] transition"
          >
            <Check size={14} strokeWidth={3} /> Dar OK em Todos ({pending.length})
          </button>
        )}

        {tab === 'p' && pending.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">Nenhum alerta pendente ✔</p>
        )}

        {tab === 'p' &&
          pending.map((a) => {
            const ho = isHOAlert(a);
            return (
              <div key={a.id} className="rounded-lg border-l-4 border-red-600 bg-red-50 p-2.5 dark:bg-red-950/50">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold text-red-700 dark:text-red-300">
                    {EVENT_LABEL[a.eventType]}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-bold ${
                      ho
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {ho ? <Home size={10} /> : <Building2 size={10} />} {ho ? 'HO' : 'PA'}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {a.wsCode} · {a.operatorName || '—'}
                </div>
                <div className="text-[11px] text-slate-500">Horário previsto: {a.scheduledTime}</div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => onAck(a.id)}
                    className="flex flex-1 items-center justify-center gap-1 rounded bg-emerald-600 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
                  >
                    <Check size={13} strokeWidth={3} /> OK
                  </button>
                  <button
                    onClick={() => onLocate(a.wsId)}
                    className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-400 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <LocateFixed size={13} /> Localizar
                  </button>
                </div>
              </div>
            );
          })}

        {tab === 'h' && history.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">Sem confirmações ainda.</p>
        )}

        {tab === 'h' &&
          history.map((a) => {
            const ho = isHOAlert(a);
            const inc = isIncidentEvent(a.eventType);
            const resolved = a.eventType === 'incident_resolved';
            return (
              <div
                key={a.id}
                className={`rounded border p-2 text-xs ${
                  inc
                    ? 'border-l-4 border-orange-500 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/30'
                    : resolved
                      ? 'border-l-4 border-emerald-500 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-bold ${inc ? 'text-orange-800 dark:text-orange-300' : ''}`}>
                    {EVENT_LABEL[a.eventType]}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold ${
                      ho
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {ho ? '🏠 HO' : '🏢 PA'}
                  </span>
                </div>
                <div className="font-medium">
                  {a.wsCode} · {a.operatorName || '—'}
                </div>
                <div className="text-slate-500">
                  {inc || resolved ? `Horário ${a.scheduledTime}` : `Previsto ${a.scheduledTime} · OK às ${hhmmss(a.acknowledgedAt)}`}
                </div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
