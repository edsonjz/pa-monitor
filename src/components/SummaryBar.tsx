import { memo } from 'react';
import { Check, Wifi, WifiOff, X } from 'lucide-react';
import type { RealtimeStatus } from '../services/storageService';

export type StatusFilter =
  | 'all'
  | 'alert'
  | 'logged'
  | 'break'
  | 'incident'
  | 'falta'
  | 'atestado'
  | 'dsr'
  | 'ferias'
  | 'maint'
  | 'free';

export interface StatusBucket {
  total: number;
  pres: number;
  ho: number;
}

export type SummaryStats = Record<StatusFilter, StatusBucket>;

interface Props {
  summary: SummaryStats;
  statusF: StatusFilter;
  onSelectStatus: (next: StatusFilter) => void;
  onClearStatus: () => void;
  scheduledCount: number;
  overdueCount: number;
  onConfirmScheduled: () => void;
  onConfirmOverdue: () => void;
  online: boolean;
  realtimeStatus: RealtimeStatus;
}

export default memo(function SummaryBar({
  summary,
  statusF,
  onSelectStatus,
  onClearStatus,
  scheduledCount,
  overdueCount,
  onConfirmScheduled,
  onConfirmOverdue,
  online,
  realtimeStatus,
}: Props) {
  const summaryCards: {
    key: StatusFilter;
    label: string;
    stat: StatusBucket;
    cls: string;
    valCls: string;
  }[] = [
    { key: 'all', label: 'Todos', stat: summary.all, cls: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: 'text-slate-800 dark:text-slate-100' },
    { key: 'logged', label: 'Logados', stat: summary.logged, cls: 'bg-[#C6EFCE]/60 border-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-700', valCls: 'text-emerald-800 dark:text-emerald-300' },
    { key: 'break', label: 'Em Pausa', stat: summary.break, cls: 'bg-[#FFEB9C]/60 border-amber-400 dark:bg-amber-950/60 dark:border-amber-700', valCls: 'text-amber-800 dark:text-amber-300' },
    { key: 'alert', label: 'Em Alerta', stat: summary.alert, cls: summary.alert.total > 0 ? 'animate-pulse bg-red-100 border-red-500 dark:bg-red-950/80 dark:border-red-600' : 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: summary.alert.total > 0 ? 'text-red-600 dark:text-red-300' : 'text-slate-500' },
    { key: 'incident', label: 'Ocorrências HO', stat: summary.incident, cls: summary.incident.total > 0 ? 'bg-orange-100 border-orange-500 dark:bg-orange-950/70 dark:border-orange-600' : 'bg-orange-50/50 border-orange-200 dark:bg-slate-800 dark:border-slate-700', valCls: summary.incident.total > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-slate-500' },
    { key: 'atestado', label: 'Atestado', stat: summary.atestado, cls: 'bg-[#B7DEE8]/60 border-cyan-400 dark:bg-cyan-950/50 dark:border-cyan-700', valCls: 'text-cyan-800 dark:text-cyan-300' },
    { key: 'dsr', label: 'DSR', stat: summary.dsr, cls: 'bg-[#E4DFEC]/70 border-purple-400 dark:bg-purple-950/50 dark:border-purple-700', valCls: 'text-purple-800 dark:text-purple-300' },
    { key: 'falta', label: 'Faltas', stat: summary.falta, cls: 'bg-[#FFC7CE]/60 border-rose-400 dark:bg-rose-950/50 dark:border-rose-700', valCls: 'text-rose-700 dark:text-rose-300' },
    { key: 'ferias', label: 'Férias', stat: summary.ferias, cls: 'bg-[#E0E7FF]/70 border-indigo-400 dark:bg-indigo-950/50 dark:border-indigo-700', valCls: 'text-indigo-700 dark:text-indigo-300' },
    { key: 'maint', label: 'Manutenção', stat: summary.maint, cls: 'bg-slate-200/80 border-slate-400 dark:bg-slate-800 dark:border-slate-600', valCls: 'text-slate-700 dark:text-slate-300' },
    { key: 'free', label: 'Livres', stat: summary.free, cls: 'bg-[#F2F2F2] border-slate-300 dark:bg-slate-800 dark:border-slate-700', valCls: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      {summaryCards.map((c) => {
        const active = statusF === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelectStatus(active ? 'all' : c.key)}
            title={`Filtrar por ${c.label}`}
            className={`flex flex-col items-start rounded-lg border px-2.5 py-1 text-left transition hover:shadow-sm active:scale-[0.98] ${c.cls} ${
              active ? 'ring-2 ring-navy ring-offset-1 dark:ring-sky-400' : ''
            }`}
          >
            <div className="flex w-full items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{c.label}</span>
              <span className={`text-base font-black tabular-nums leading-none ${c.valCls}`}>{c.stat.total}</span>
            </div>
            <span className="mt-0.5 text-[9.5px] font-medium text-slate-500 dark:text-slate-400">
              Pres: {c.stat.pres} · HO: {c.stat.ho}
            </span>
          </button>
        );
      })}

      {statusF !== 'all' && (
        <button
          type="button"
          onClick={onClearStatus}
          className="flex items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-xs font-bold text-white shadow hover:bg-navy/90 active:scale-95"
        >
          <X size={13} /> Mostrar Todos
        </button>
      )}

      {scheduledCount > 0 && (
        <button
          onClick={onConfirmScheduled}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 active:scale-95 transition"
        >
          <Check size={14} strokeWidth={3} /> Dar OK nos {scheduledCount} do Horário
        </button>
      )}

      {overdueCount > 0 && (
        <button
          onClick={onConfirmOverdue}
          className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-700 active:scale-95 transition"
        >
          <Check size={14} strokeWidth={3} /> Confirmar Logout dos {overdueCount} Vencidos
        </button>
      )}

      <span
        className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
          !online
            ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            : realtimeStatus === 'connected'
              ? 'bg-emerald-100 text-emerald-800'
              : realtimeStatus === 'error'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
        }`}
      >
        {!online || realtimeStatus === 'error' ? <WifiOff size={14} /> : <Wifi size={14} />}{' '}
        {!online
          ? 'Modo Local (Testes)'
          : realtimeStatus === 'connected'
            ? 'Supabase Online'
            : realtimeStatus === 'error'
              ? 'Realtime Offline'
              : 'Conectando…'}
      </span>
    </div>
  );
});
