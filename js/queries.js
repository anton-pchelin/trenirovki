// Выборки по истории: прошлый раз, рекорды у подходов, история упражнения и комплекса.
import { state, sortedWorkouts, before } from './store.js';
import { isPR, compareWod, wodHasResult } from './calc.js';

export const doneSets = item => item.sets.filter(s => s.done);

// [{workout, item}] по всем тренировкам, от старых к новым
export function entries(id, kind = 'ex') {
  const out = [];
  for (const w of sortedWorkouts())
    for (const it of w.items)
      if (it.kind === kind && (kind === 'ex' ? it.exId : it.wodId) === id) out.push({ workout: w, item: it });
  return out;
}

export function allDoneSets(exId) {
  return entries(exId).flatMap(e => doneSets(e.item));
}

// Подходы с ✓ из последней тренировки до этой, где было упражнение
export function lastTime(exId, workout) {
  const list = entries(exId).filter(e => e.workout.id !== workout.id && before(workout, e.workout) && doneSets(e.item).length);
  const last = list[list.length - 1];
  return last ? doneSets(last.item) : [];
}

// 🏆 у каждого подхода: лучше всего, что было раньше
export function prFlags(workout, item) {
  const earlier = [];
  for (const e of entries(item.exId)) {
    if (e.workout.id === workout.id) {
      if (e.item.id === item.id) break;
      earlier.push(...doneSets(e.item));
    } else if (before(workout, e.workout)) earlier.push(...doneSets(e.item));
  }
  return item.sets.map(s => {
    if (!s.done) return false;
    const pr = isPR(s, earlier);
    earlier.push(s);
    return pr;
  });
}

export function wodEntries(wodId) {
  return entries(wodId, 'wod').filter(e => wodHasResult(e.item.def.format, e.item.res));
}

// Рекорд комплекса — отдельно для RX и без RX
export function wodBest(wodId, rx) {
  let best = null;
  for (const e of wodEntries(wodId)) {
    if (!!e.item.rx !== !!rx) continue;
    const fmt = e.item.def.format;
    if (compareWod(fmt, e.item.res, e.item.res) === null) continue;
    if (!best || compareWod(fmt, e.item.res, best.item.res) > 0) best = e;
  }
  return best;
}

export function wodIsPR(workout, item) {
  const fmt = item.def.format;
  if (!wodHasResult(fmt, item.res)) return false;
  let had = false;
  for (const e of wodEntries(item.wodId)) {
    if (e.item.id === item.id || !!e.item.rx !== !!item.rx || !before(workout, e.workout)) continue;
    const c = compareWod(fmt, item.res, e.item.res);
    if (c === null) continue;
    had = true;
    if (c <= 0) return false;
  }
  return had;
}

export function lastWod(wodId, workout) {
  const list = wodEntries(wodId).filter(e => e.workout.id !== workout.id && before(workout, e.workout));
  return list[list.length - 1] || null;
}

export function activeWorkout() {
  return state.activeId ? state.workouts.find(w => w.id === state.activeId) : null;
}
