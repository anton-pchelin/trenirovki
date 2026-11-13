// Планы, шаблоны и суперсеты: копия пунктов без результатов, новые id групп, планы не попадают в Excel
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.indexedDB = undefined;
const store = await import('../js/store.js');
const { planItems } = await import('../js/workout.js');
const { exportRows } = await import('../js/export.js');
const { EXERCISES } = await import('../js/data-exercises.js');

const exId = name => EXERCISES.find(e => e.name === name).id;

test('planItems: результаты сброшены, число подходов — по отмеченным, суперсет сохранён с новым id', () => {
  const items = [
    { id: 'a', kind: 'ex', exId: exId('Присед со штангой'), fields: ['w', 'r'], sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 105, r: 4, done: false }], note: 'тяжело', ss: 'g1' },
    { id: 'b', kind: 'ex', exId: exId('Подтягивания'), fields: ['r'], sets: [{ r: 10, done: true }], note: '', ss: 'g1' },
    { id: 'c', kind: 'task', text: 'Планка', mode: 'time', time: 90, sets: [], times: [] },
  ];
  const out = planItems(items);
  assert.equal(out.length, 3);
  // подходы — только по отмеченным, все done сброшены
  assert.equal(out[0].sets.length, 2);
  assert.ok(out[0].sets.every(s => !s.done && s.w == null));
  // суперсет: общий НОВЫЙ id у первых двух, у задания — нет
  assert.ok(out[0].ss && out[0].ss === out[1].ss && out[0].ss !== 'g1');
  assert.equal(out[2].ss ?? null, null);
  // текст задания сохраняется, результат — нет
  assert.equal(out[2].text, 'Планка');
  assert.equal(out[2].time, null);
});

test('Excel: тренировка-план в выгрузку не попадает', () => {
  store.state.workouts = [];
  const w = store.newWorkout('2026-10-30');
  w.items.push({ id: 'a', kind: 'ex', exId: exId('Присед со штангой'), fields: ['w', 'r'], sets: [{ w: 100, r: 5, done: true }], note: '' });
  const p = store.newWorkout('2026-11-01');
  p.planned = true;
  p.items.push({ id: 'b', kind: 'ex', exId: exId('Присед со штангой'), fields: ['w', 'r'], sets: [{ w: 200, r: 5, done: true }], note: '' });
  const rows = exportRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0].date, '2026-10-30');
  store.state.workouts = [];
});
