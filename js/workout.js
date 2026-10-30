// Действия с тренировкой: добавить упражнение/комплекс, повторить прошлую, закончить, удалить.
import { state, save, uid, exById, wodById, newWorkout, touchRecent, workoutById } from './store.js';
import { TYPE_FIELDS, isoDate, daysBetween } from './calc.js';
import { lastTime } from './queries.js';

export function addEntry(workout, entry) {
  touchRecent(entry.id);
  let item;
  if (entry.kind === 'ex') {
    const ex = exById(entry.id);
    const prev = lastTime(ex.id, workout);
    item = {
      id: uid(), kind: 'ex', exId: ex.id, fields: [...(ex.fields ?? TYPE_FIELDS[ex.type])],
      sets: Array.from({ length: Math.max(1, prev.length) }, () => ({ done: false })), note: '',
    };
  } else {
    const w = wodById(entry.id);
    item = { id: uid(), kind: 'wod', wodId: w.id, def: JSON.parse(JSON.stringify(w)), res: {}, weight: w.rx ?? null, rx: false, note: '', timer: null };
  }
  workout.items.push(item);
  save();
  return item;
}

export function startWorkout() {
  if (state.activeId && workoutById(state.activeId)) return workoutById(state.activeId);
  const w = newWorkout();
  state.activeId = w.id;
  save();
  return w;
}

// Тренировки за последние 7 дней (кроме идущей), новые сверху
export function lastWeek() {
  const today = isoDate();
  return state.workouts
    .filter(w => w.id !== state.activeId && w.items.length && daysBetween(w.date, today) <= 7 && daysBetween(w.date, today) >= 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

// Новая тренировка с теми же упражнениями; веса — только подсказкой «прошлый раз»
export function repeatWorkout(src) {
  const w = startWorkout();
  for (const it of src.items) {
    if (it.kind === 'ex' && exById(it.exId)) {
      const n = Math.max(1, it.sets.filter(s => s.done).length);
      w.items.push({ id: uid(), kind: 'ex', exId: it.exId, fields: [...it.fields], sets: Array.from({ length: n }, () => ({ done: false })), note: '' });
    } else if (it.kind === 'wod') {
      w.items.push({ id: uid(), kind: 'wod', wodId: it.wodId, def: JSON.parse(JSON.stringify(it.def)), res: {}, weight: it.weight, rx: it.rx, note: '', timer: null });
    }
  }
  save();
  return w;
}

const emptySet = s => !s.done && s.w == null && s.r == null && s.d == null && s.t == null;

export function finishWorkout(w) {
  for (const it of w.items) if (it.kind === 'ex') it.sets = it.sets.filter(s => !emptySet(s));
  w.finished = true;
  if (state.activeId === w.id) state.activeId = null;
  save();
}

export function deleteWorkout(w) {
  state.workouts = state.workouts.filter(x => x.id !== w.id);
  if (state.activeId === w.id) state.activeId = null;
  save();
}

// Запись задним числом: сразу «законченная», открывается для правки
export function backdatedWorkout(date) {
  const w = newWorkout(date);
  w.finished = true;
  save();
  return w;
}
