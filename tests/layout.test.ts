import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT, defaultWorkstations, ensureRequiredWorkstations, isHomeOfficeWs } from '../src/lib/layout';

test('LAYOUT.b7 inclui PA-73 abaixo de PA-57 (72) e PA-74 abaixo de PA-58 (75)', () => {
  assert.equal(LAYOUT.b7.length, 10);
  assert.equal(LAYOUT.b7[6], 'PA-57');
  assert.equal(LAYOUT.b7[7], 'PA-58');
  assert.equal(LAYOUT.b7[8], 'PA-73');
  assert.equal(LAYOUT.b7[9], 'PA-74');
});

test('defaultWorkstations gera 64 PAs presenciais (incluindo PA-73 e PA-74) e 24 Home Office', () => {
  const all = defaultWorkstations();
  const physical = all.filter((w) => !isHomeOfficeWs(w));
  const ho = all.filter((w) => isHomeOfficeWs(w));

  assert.equal(physical.length, 64);
  assert.equal(ho.length, 24);
  assert.equal(all.length, 88);

  const pa73 = all.find((w) => w.id === 'PA-73');
  const pa74 = all.find((w) => w.id === 'PA-74');
  assert.deepEqual(
    { id: pa73?.id, code: pa73?.code, label: pa73?.label, blockName: pa73?.blockName, gridPosition: pa73?.gridPosition },
    { id: 'PA-73', code: 'PA-73', label: 'PA-73', blockName: 'Bloco 7', gridPosition: 'r5c1' },
  );
  assert.deepEqual(
    { id: pa74?.id, code: pa74?.code, label: pa74?.label, blockName: pa74?.blockName, gridPosition: 'r5c2' },
    { id: 'PA-74', code: 'PA-74', label: 'PA-74', blockName: 'Bloco 7', gridPosition: 'r5c2' },
  );
});

test('ensureRequiredWorkstations adiciona PA-73 e PA-74 preservando códigos renomeados e é idempotente', () => {
  const legacy = defaultWorkstations()
    .filter((w) => w.id !== 'PA-73' && w.id !== 'PA-74')
    .map((w) => {
      if (w.id === 'PA-57') return { ...w, code: 'PA-72', label: 'PA-72' };
      if (w.id === 'PA-58') return { ...w, code: 'PA-75', label: 'PA-75' };
      return w;
    });

  const updated = ensureRequiredWorkstations(legacy, 24);
  assert.equal(updated.length, 88);
  assert.equal(updated.find((w) => w.id === 'PA-57')?.code, 'PA-72');
  assert.equal(updated.find((w) => w.id === 'PA-58')?.code, 'PA-75');
  assert.equal(updated.find((w) => w.id === 'PA-73')?.code, 'PA-73');
  assert.equal(updated.find((w) => w.id === 'PA-74')?.code, 'PA-74');

  const secondPass = ensureRequiredWorkstations(updated, 24);
  assert.equal(secondPass.length, 88);
});
