import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../js/calc.js';

test('разбор чисел и времени', () => {
  assert.equal(c.parseNum('102,5'), 102.5);
  assert.equal(c.parseNum('102.5'), 102.5);
  assert.equal(c.parseNum(''), null);
  assert.equal(c.parseNum('abc'), null);
  assert.equal(c.parseTime('1:45'), 105);
  assert.equal(c.parseTime('145'), 105);
  assert.equal(c.parseTime('4,32'), 272);
  assert.equal(c.parseTime('45'), 45);
  assert.equal(c.parseTime('4532'), 45 * 60 + 32);
  assert.equal(c.fmtTime(272), '4:32');
  assert.equal(c.fmtTime(3725), '1:02:05');
});

test('типовая тренировка: рекорд у 4-го подхода приседа', () => {
  const sets = [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }, { w: 105, r: 4 }];
  const prs = sets.map((s, i) => c.isPR(s, sets.slice(0, i)));
  assert.deepEqual(prs, [false, false, false, true]);
  assert.deepEqual(c.bestSets(sets), [{ w: 105, r: 4 }]);
  assert.equal(sets.map(c.fmtSet).join(', '), '100×5, 100×5, 100×5, 105×4');
});

test('свой вес и кардио', () => {
  assert.equal(c.fmtSet({ r: 10 }), '10');
  assert.equal(c.fmtSet({ d: 500, t: 105 }), '500 м — 1:45');
  assert.ok(c.isPR({ d: 500, t: 100 }, [{ d: 500, t: 105 }]));
  assert.ok(!c.isPR({ d: 1000, t: 100 }, [{ d: 500, t: 105 }]), 'другая дистанция — не рекорд');
  assert.equal(c.bestSets([{ d: 500, t: 105 }, { d: 500, t: 110 }, { d: 1000, t: 230 }]).length, 2);
});

test('1ПМ и проценты из интервью', () => {
  const rm = c.oneRM([{ w: 100, r: 5 }, { w: 105, r: 4 }]);
  assert.equal(rm.value, 119);
  const t = Object.fromEntries(c.percentTable(119).map(x => [x.p, x.w]));
  assert.equal(t[60], 72.5);
  assert.equal(t[70], 82.5);
  assert.equal(t[80], 95);
  assert.equal(t[90], 107.5);
  assert.equal(c.oneRM([{ w: 60, r: 12 }]), null, 'больше 10 повторов не считаем');
  assert.equal(c.oneRM([{ w: 140, r: 1 }]).value, 140);
});

test('блины', () => {
  const p = c.plates(105, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
  assert.deepEqual(p.perSide, [25, 15, 2.5]);
  assert.ok(p.ok);
  const q = c.plates(104, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
  assert.equal(q.ok, false);
  assert.equal(q.total, 102.5);
  assert.ok(c.plates(15, 20, [25]).tooLight);
});

test('рекорды на 1/3/5/10', () => {
  const r = c.repMaxes([{ w: 100, r: 5 }, { w: 105, r: 4 }]);
  assert.deepEqual(r.map(x => x.set?.w ?? null), [105, 105, 100, null]);
});

test('комплексы', () => {
  assert.ok(c.compareWod('time', { time: 272 }, { time: 291 }) > 0);
  assert.equal(c.compareWod('time', { time: 272, capped: true }, { time: 291 }), null);
  assert.ok(c.compareWod('amrap', { rounds: 7, reps: 12 }, { rounds: 7, reps: 3 }) > 0);
  assert.equal(c.fmtWodResult('time', { time: 272 }, true), '4:32 RX');
  assert.equal(c.fmtWodResult('amrap', { rounds: 3, reps: 5 }, false), '3 + 5');
});
