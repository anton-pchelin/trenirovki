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

// Свободное задание текстом: заметка + по желанию время, подходы (вес×повторы) или интервалы времени
export function addTask(workout) {
  const item = { id: uid(), kind: 'task', text: '', mode: 'none', time: null, sets: [], times: [] };
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

// Копия пунктов без результатов: для «повторить», шаблонов и планов. Суперсеты сохраняются (новые id групп).
export function planItems(items) {
  const out = [], ssMap = {};
  for (const it of items) {
    const ss = it.ss ? (ssMap[it.ss] ??= uid()) : null;
    let n = null;
    if (it.kind === 'ex' && exById(it.exId)) {
      const cnt = Math.max(1, it.sets.filter(s => s.done).length);
      n = { id: uid(), kind: 'ex', exId: it.exId, fields: [...it.fields], sets: Array.from({ length: cnt }, () => ({ done: false })), note: '' };
    } else if (it.kind === 'wod') {
      n = { id: uid(), kind: 'wod', wodId: it.wodId, def: JSON.parse(JSON.stringify(it.def)), res: {}, weight: it.weight, rx: it.rx, note: '', timer: null };
    } else if (it.kind === 'task') {
      n = { id: uid(), kind: 'task', text: it.text ?? '', mode: it.mode ?? 'none', time: null, sets: (it.sets ?? []).map(() => ({ done: false })), times: [] };
    }
    if (n) { if (ss) n.ss = ss; out.push(n); }
  }
  return out;
}

// Новая тренировка с теми же упражнениями; веса — только подсказкой «прошлый раз»
export function repeatWorkout(src) {
  const w = startWorkout();
  w.items = planItems(src.items);
  save();
  return w;
}

// ── Планирование ──

// Тренировка на конкретную дату (в т.ч. будущую). Будущая — «план»: не активна и не закончена.
export function plannedWorkout(date) {
  const w = newWorkout(date);
  w.planned = true;
  save();
  return w;
}

// Начать запланированную: сегодня — как обычную, задним числом — как запись факта
export function startPlanned(w) {
  delete w.planned;
  const today = isoDate();
  if (w.date === today) {
    const cur = state.activeId && workoutById(state.activeId);
    if (cur && cur.id !== w.id) return cur; // уже идёт другая
    w.finished = false;
    state.activeId = w.id;
  } else {
    w.finished = true;
  }
  save();
  return w;
}

// Отметка «день отдыха» на дату
export function toggleRestDay(date) {
  state.restDays ??= [];
  if (state.restDays.includes(date)) state.restDays = state.restDays.filter(d => d !== date);
  else state.restDays.push(date);
  save();
}

// ── Шаблоны тренировок ──

export function saveAsTemplate(w, name) {
  state.templates ??= [];
  const t = { id: uid(), name: name.trim(), items: planItems(w.items) };
  state.templates.push(t);
  save();
  return t;
}

export function deleteTemplate(id) {
  state.templates = (state.templates ?? []).filter(t => t.id !== id);
  save();
}

// Развернуть шаблон в день: будущий день — план, сегодня — обычная (или активная), прошлый — задним числом
export function applyTemplate(t, date) {
  const today = isoDate();
  const w = date > today ? plannedWorkout(date) : date === today ? startWorkout() : backdatedWorkout(date);
  w.items = planItems(t.items);
  save();
  return w;
}

// ── Суперсеты ──
// it.ss — id группы; идущие подряд пункты с одним ss — один суперсет (A, B, C…)

// Объединить пункт с предыдущим в суперсет
export function joinSuperset(w, it) {
  const i = w.items.findIndex(x => x.id === it.id);
  if (i < 1) return;
  const prev = w.items[i - 1];
  if (prev.ss && prev.ss === it.ss) return;
  const id = it.ss ?? prev.ss ?? uid();
  prev.ss = id;
  it.ss = id;
  save();
}

// Убрать пункт из суперсета; если в группе остался один — снимаем группу совсем
export function leaveSuperset(w, it) {
  const id = it.ss;
  if (!id) return;
  it.ss = null; delete it.ss;
  const rest = w.items.filter(x => x.ss === id);
  if (rest.length === 1) { rest[0].ss = null; delete rest[0].ss; }
  save();
}

const emptySet = s => !s.done && s.w == null && s.r == null && s.d == null && s.t == null;

export function finishWorkout(w) {
  for (const it of w.items) if (it.kind === 'ex' || it.kind === 'task') it.sets = it.sets.filter(s => !emptySet(s));
  w.finished = true;
  delete w.planned;
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
