import test from 'node:test';
import assert from 'node:assert/strict';
import { wodClock } from '../js/clock.js';

const S = 1_000_000;
test('отсчёт перед стартом и For Time', () => {
  const d = { format: 'time' };
  assert.equal(wodClock(d, S, S - 2500).big, '3');
  assert.equal(wodClock(d, S, S - 2500).mark, 'cd3');
  assert.equal(wodClock(d, S, S + 272000).big, '4:32');
  assert.equal(wodClock(d, S, S + 272000).ended, false);
});

test('AMRAP и EMOM', () => {
  assert.equal(wodClock({ format: 'amrap', min: 2 }, S, S + 30000).big, '1:30');
  assert.ok(wodClock({ format: 'amrap', min: 2 }, S, S + 120000).ended);
  const e = wodClock({ format: 'emom', min: 3 }, S, S + 61000);
  assert.equal(e.phase, 'минута 2 из 3');
  assert.equal(e.mark, 'm1');
});

test('Табата 20/10 × 8', () => {
  const d = { format: 'int', work: 20, rest: 10, rounds: 8 };
  assert.equal(wodClock(d, S, S + 5000).phase, 'РАБОТА · интервал 1 из 8');
  assert.equal(wodClock(d, S, S + 25000).phase, 'отдых · интервал 1 из 8');
  assert.equal(wodClock(d, S, S + 31000).interval, 1);
  assert.ok(wodClock(d, S, S + 240000).ended);
});
