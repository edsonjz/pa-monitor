import { useState } from 'react';
import { Check, ChevronRight, History, LocateFixed, BellRing } from 'lucide-react';
import type { AlertLog } from '../types';
import { EVENT_LABEL } from '../lib/engine';

interface Props {
  pending: AlertLog[];
  history: AlertLog[];
  onAck: (id: string) => void;
  onLocate: (wsId: string) => void;
}

const hhmmss = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '');

export default function AlertPanel({ pending, history, onAck, onLocate }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'p' | 'h'>('p');

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="relative flex w-10 shrink-0 flex-col items-center gap-2 border-l border-slate-300 bg-white pt-3 dark:border-slate-700 dark:bg-slate-900" title="Abrir alertas">
        <BellRing className={pending.length ? 'text-red-600' : 'text-slate-500'} size={20} />
        {pending.length > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{pending.length}</span>}
      </button>
    );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b p-2 dark:border-slate-700">
        <div className="flex gap-1 text-xs font-semibold">
          <button onClick={() => setTab('p')} className={`flex items-center gap-1 rounded px-2 py-1 ${tab === 'p' ? 'bg-red-600 text-white' : ''}`}><BellRing size={14} /> Pendentes ({pending.length})</button>
          <button onClick={() => setTab('h')} className={`flex items-center gap-1 rounded px-2 py-1 ${tab === 'h' ? 'bg-navy text-white' : ''}`}><History size={14} /> Histórico</button>
        </div>
        <button onClick={() => setOpen(false)} title="Recolher"><ChevronRight size={18} /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tab === 'p' && pending.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhum alerta pendente ✔</p>}
        {tab === 'p' && pending.map((a) => (
          <div key={a.id} className="rounded-lg border-l-4 border-red-600 bg-red-50 p-2 dark:bg-red-950/50">
            <div className="text-xs font-extrabold text-red-700 dark:text-red-300">{EVENT_LABEL[a.eventType]}</div>
            <div className="text-sm font-semibold">{a.wsCode} · {a.operatorName || '—'}</div>
            <div className="text-[11px] text-slate-500">Previsto {a.scheduledTime}</div>
            <div className="mt-1 flex gap-1">
              <button onClick={() => onAck(a.id)} className="flex flex-1 items-center justify-center gap-1 rounded bg-red-600 py-1 text-xs font-bold text-white"><Check size={13} /> OK</button>
              <button onClick={() => onLocate(a.wsId)} className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-400 py-1 text-xs font-semibold"><LocateFixed size={13} /> Localizar</button>
            </div>
          </div>
        ))}
        {tab === 'h' && history.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Sem confirmações ainda.</p>}
        {tab === 'h' && history.map((a) => (
          <div key={a.id} className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="font-bold">{EVENT_LABEL[a.eventType]}</div>
            <div>{a.wsCode} · {a.operatorName || '—'}</div>
            <div className="text-slate-500">Previsto {a.scheduledTime} · OK às {hhmmss(a.acknowledgedAt)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
