import { memo, type ReactNode } from 'react';
import { LAYOUT } from '../lib/layout';

const W = 152; // largura do card (3 faixas proporcionais ao layout preferido)
const H = 104; // altura do card (24px cabeçalho + 54px corpo + 26px rodapé)
const NAVY = '#1F3864';
const GAP_V = 40; // corredor vertical
const BLOCK_CLS = 'border-[3px] bg-white/40 dark:bg-slate-900/40';
const col = (n: number) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, ${W}px)` } as const);
const MID_LINE = { borderLeft: `4px solid ${NAVY}` };
const MID_TOP = { borderTop: `4px solid ${NAVY}` };
const BORDER_NAVY = { borderColor: NAVY };

function Corridor() {
  return <div style={{ width: GAP_V }} className="shrink-0" />;
}

/** Mapa físico: renderCard(id) devolve o card de cada PA. */
export default memo(function FloorMap({ renderCard }: { renderCard: (id: string) => ReactNode }) {
  const island = (ids: string[], sup: string | null) => (
    <div className={BLOCK_CLS} style={BORDER_NAVY}>
      <div style={col(2)}>
        {ids.map((id, i) => (
          <div key={id} style={i % 2 === 1 ? MID_LINE : undefined}>
            {renderCard(id)}
          </div>
        ))}
      </div>
      {sup && <div style={{ width: W * 2, borderTop: `2px solid ${NAVY}` }}>{renderCard(sup)}</div>}
    </div>
  );

  const hIsland = (sup: string, top: string[], bottom: string[]) => (
    <div className={`${BLOCK_CLS} flex`} style={BORDER_NAVY}>
      <div style={{ width: W, height: H * 2, borderRight: `4px solid ${NAVY}` }}>{renderCard(sup)}</div>
      <div>
        <div style={col(4)}>
          {top.map((id) => (
            <div key={id}>{renderCard(id)}</div>
          ))}
        </div>
        <div style={{ ...col(4), ...MID_TOP }}>
          {bottom.map((id) => (
            <div key={id}>{renderCard(id)}</div>
          ))}
        </div>
      </div>
    </div>
  );

  const single = (ids: string[]) => (
    <div className={BLOCK_CLS} style={BORDER_NAVY}>
      {ids.map((id) => (
        <div key={id}>{renderCard(id)}</div>
      ))}
    </div>
  );

  return (
    <div className="inline-block min-w-max p-6">
      {/* ÁREA SUPERIOR */}
      <div className="flex items-start">
        {single(LAYOUT.b1)}
        <Corridor />
        {island(LAYOUT.b2, LAYOUT.sup1)}
        <Corridor />
        {island(LAYOUT.b3, LAYOUT.sup2)}
        <Corridor />
        <div className="flex flex-col" style={{ marginTop: H * 1.3 }}>
          {hIsland(LAYOUT.sup3, LAYOUT.b4top, LAYOUT.b4bottom)}
          <div style={{ height: H * 1.7 }} />
          {hIsland(LAYOUT.sup4, LAYOUT.b5top, LAYOUT.b5bottom)}
        </div>
      </div>

      {/* CORREDOR HORIZONTAL PRINCIPAL */}
      <div
        className="flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-400"
        style={{ height: H * 1.2 }}
      >
        Corredor principal
      </div>

      {/* ÁREA INFERIOR */}
      <div className="flex items-start">
        {single(LAYOUT.b6)}
        <Corridor />
        {island(LAYOUT.b7, null)}
      </div>
    </div>
  );
});
