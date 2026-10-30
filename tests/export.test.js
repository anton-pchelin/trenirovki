// Типовая тренировка из интервью → 12 строк в Excel; файл открывается (проверка через Python/openpyxl — в tests/check_xlsx.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

globalThis.indexedDB = undefined; // store.js обращается к базе только при load/save
const store = await import('../js/store.js');
const { exportRows, exportXlsx } = await import('../js/export.js');
const { EXERCISES } = await import('../js/data-exercises.js');
const { WODS } = await import('../js/data-wods.js');

const exId = name => EXERCISES.find(e => e.name === name).id;
const sets = (arr) => arr.map(s => ({ ...s, done: true }));

export function typicalWorkout() {
  const w = store.newWorkout('2026-10-30');
  w.items.push(
    { id: 'a', kind: 'ex', exId: exId('Присед со штангой'), fields: ['w', 'r'], sets: sets([{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 105, r: 4 }]), note: '' },
    { id: 'b', kind: 'ex', exId: exId('Швунг толчковый'), fields: ['w', 'r'], sets: sets([{ w: 60, r: 3 }, { w: 60, r: 3 }, { w: 60, r: 3 }]), note: '' },
    { id: 'c', kind: 'ex', exId: exId('Подтягивания'), fields: ['r'], sets: sets([{ r: 10 }, { r: 8 }, { r: 8 }]), note: '' },
    { id: 'd', kind: 'ex', exId: exId('Гребля'), fields: ['d', 't'], sets: sets([{ d: 500, t: 105 }]), note: '' },
    { id: 'e', kind: 'wod', wodId: 'wod-fran', def: WODS.find(x => x.id === 'wod-fran'), res: { time: 272 }, weight: 43, rx: true, note: '' },
  );
  return w;
}

test('Excel: типовая тренировка — 12 строк, рекорд у 105×4', () => {
  typicalWorkout();
  const rows = exportRows();
  assert.equal(rows.length, 12);
  const squat = rows.filter(r => r[1] === 'Присед со штангой');
  assert.deepEqual(squat.map(r => r[10]), [null, null, null, 'да']);
  const fran = rows.find(r => r[1] === 'Фран');
  assert.deepEqual(fran[7], { time: 272 });
  assert.equal(fran[9], 'да');
  return exportXlsx().arrayBuffer().then(b => writeFileSync(new URL('./out.xlsx', import.meta.url), Buffer.from(b)));
});
