import { memo } from 'react';
import { Search } from 'lucide-react';
import type { StatusFilter, SummaryStats } from './SummaryBar';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  statusF: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  teamF: string;
  onTeamChange: (value: string) => void;
  teams: string[];
  summary: SummaryStats;
  msg: string;
  error: string | null;
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${c}`} />
      {t}
    </span>
  );
}

export default memo(function FilterBar({
  search,
  onSearchChange,
  statusF,
  onStatusChange,
  teamF,
  onTeamChange,
  teams,
  summary,
  msg,
  error,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="relative">
        <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
        <input
          className="input !w-64 !pl-7"
          placeholder="Buscar nome ou código da PA"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <select
        className="input !w-48 font-medium"
        value={statusF}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
      >
        <option value="all">Status: Todos</option>
        <option value="alert">Em Alerta ({summary.alert.total})</option>
        <option value="logged">Logados ({summary.logged.total})</option>
        <option value="break">Em Pausa ({summary.break.total})</option>
        <option value="incident">🟠 Ocorrências HO ({summary.incident.total})</option>
        <option value="falta">🚫 Faltas ({summary.falta.total})</option>
        <option value="atestado">📋 Atestados ({summary.atestado.total})</option>
        <option value="dsr">🏖️ DSR ({summary.dsr.total})</option>
        <option value="ferias">✈️ Férias ({summary.ferias.total})</option>
        <option value="maint">🔧 Manutenção ({summary.maint.total})</option>
        <option value="free">Livres ({summary.free.total})</option>
      </select>
      <select className="input !w-44" value={teamF} onChange={(e) => onTeamChange(e.target.value)}>
        <option value="">Equipe: Todas</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="ml-1 flex flex-wrap items-center gap-2.5 text-[11px]">
        <Legend c="bg-[#C6EFCE] border-slate-500" t="Logado" />
        <Legend c="bg-[#FFEB9C] border-amber-500" t="Pausa" />
        <Legend c="bg-[#FED7AA] border-orange-500" t="Ocorrência HO" />
        <Legend c="bg-[#FFC7CE] border-rose-500" t="Falta" />
        <Legend c="bg-[#B7DEE8] border-cyan-500" t="Atestado" />
        <Legend c="bg-[#E4DFEC] border-purple-500" t="DSR" />
        <Legend c="bg-[#E0E7FF] border-indigo-400" t="Férias" />
        <Legend c="bg-[#F2F2F2] border-slate-400" t="Livre" />
        <Legend c="bg-[#FFE699] border-amber-400" t="Supervisor" />
        <Legend c="bg-red-500 border-red-700" t="Alerta" />
      </div>
      {msg && <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">{msg}</span>}
      {error && <span className="ml-auto text-xs font-semibold text-red-600">⚠ {error}</span>}
    </div>
  );
});
