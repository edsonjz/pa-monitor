import type { ReactNode } from 'react';
import { Home, Plus } from 'lucide-react';
import type { Workstation } from '../types';
import type { WsView } from '../lib/engine';
import { hoId, hoNumber } from '../lib/layout';

interface Props {
  hoWorkstations: Workstation[];
  views: Map<string, WsView>;
  renderCard: (id: string) => ReactNode;
  onAddSlot: () => void;
}

export default function HomeOfficeGrid({ hoWorkstations, views, renderCard, onAddSlot }: Props) {
  const occupied = hoWorkstations.filter((w) => {
    const v = views.get(w.id);
    return v && v.shift && v.shift.operatorName.trim();
  }).length;
  const incidents = hoWorkstations.filter((w) => views.get(w.id)?.category === 'incident').length;
  const free = hoWorkstations.length - occupied;

  const maxNum = hoWorkstations.reduce((m, w) => Math.max(m, hoNumber(w.id)), 0);
  const nextCode = hoId((Number.isFinite(maxNum) ? maxNum : hoWorkstations.length) + 1);

  return (
    <section className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Home size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-indigo-950 dark:text-indigo-100">
              Operação Home Office ({hoWorkstations.length} posições)
            </h2>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Ocupadas: <b>{occupied}</b> · Livres: <b>{free}</b>
              {incidents > 0 && (
                <>
                  {' '}· <span className="font-bold text-orange-600 dark:text-orange-400">Ocorrências: {incidents}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={onAddSlot}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 active:scale-95 transition"
        >
          <Plus size={15} /> Nova PA Home Office ({nextCode})
        </button>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(152px, max-content))' }}
      >
        {hoWorkstations.map((w) => (
          <div key={w.id} className="rounded-sm border-2 border-indigo-900/70 bg-white/40 dark:border-indigo-500/60 dark:bg-slate-900/40">
            {renderCard(w.id)}
          </div>
        ))}
      </div>
    </section>
  );
}
