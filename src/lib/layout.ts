import type { Workstation } from '../types';

const p2 = (n: number) => String(n).padStart(2, '0');
export const paId = (n: number) => `PA-${p2(n)}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => paId(a + i));

/** Disposição física (ids fixos dos slots; o código exibido pode ser renomeado). */
export const LAYOUT = {
  b1: range(1, 6), // 1 col x 6 linhas
  b2: range(7, 18), // 2 col x 6 linhas
  sup1: 'SUP-01',
  b3: range(19, 30),
  sup2: 'SUP-02',
  sup3: 'SUP-03',
  b4top: range(31, 34),
  b4bottom: range(35, 38),
  sup4: 'SUP-04',
  b5top: range(39, 42),
  b5bottom: range(43, 46),
  b6: range(47, 50), // 1 col x 4 linhas
  b7: range(51, 58), // 2 col x 4 linhas
};

export function defaultWorkstations(): Workstation[] {
  const now = new Date().toISOString();
  const out: Workstation[] = [];
  const add = (id: string, type: 'operator' | 'supervisor', block: string, pos: string) =>
    out.push({ id, code: id, label: id, type, blockName: block, gridPosition: pos, status: 'active', updatedAt: now });
  LAYOUT.b1.forEach((id, i) => add(id, 'operator', 'Bloco 1', `r${i + 1}c1`));
  LAYOUT.b2.forEach((id, i) => add(id, 'operator', 'Bloco 2', `r${Math.floor(i / 2) + 1}c${(i % 2) + 1}`));
  add(LAYOUT.sup1, 'supervisor', 'Bloco 2', 'r7c1-2');
  LAYOUT.b3.forEach((id, i) => add(id, 'operator', 'Bloco 3', `r${Math.floor(i / 2) + 1}c${(i % 2) + 1}`));
  add(LAYOUT.sup2, 'supervisor', 'Bloco 3', 'r7c1-2');
  add(LAYOUT.sup3, 'supervisor', 'Bloco 4', 'r1-2c1');
  LAYOUT.b4top.forEach((id, i) => add(id, 'operator', 'Bloco 4', `r1c${i + 2}`));
  LAYOUT.b4bottom.forEach((id, i) => add(id, 'operator', 'Bloco 4', `r2c${i + 2}`));
  add(LAYOUT.sup4, 'supervisor', 'Bloco 5', 'r1-2c1');
  LAYOUT.b5top.forEach((id, i) => add(id, 'operator', 'Bloco 5', `r1c${i + 2}`));
  LAYOUT.b5bottom.forEach((id, i) => add(id, 'operator', 'Bloco 5', `r2c${i + 2}`));
  LAYOUT.b6.forEach((id, i) => add(id, 'operator', 'Bloco 6', `r${i + 1}c1`));
  LAYOUT.b7.forEach((id, i) => add(id, 'operator', 'Bloco 7', `r${Math.floor(i / 2) + 1}c${(i % 2) + 1}`));
  return out;
}
