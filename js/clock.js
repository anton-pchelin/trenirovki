// Что показывает таймер комплекса в момент now. Время считается от часов (start), а не тиками —
// поэтому после сворачивания приложения всё верно. Чистая функция, проверяется тестами.
import { fmtTime } from './calc.js';

export const COUNTDOWN = 10;

export function totalSec(def) {
  if (def.format === 'amrap' || def.format === 'emom') return def.min * 60;
  if (def.format === 'int') return def.rounds * (def.work + def.rest);
  return def.min ? def.min * 60 : Infinity;
}

// → {big, phase, ended, mark}; mark — метка события для сигнала (меняется — пищим)
export function wodClock(def, start, now) {
  const el = (now - start) / 1000;
  if (el < 0) {
    const left = Math.ceil(-el);
    return { big: String(left), phase: 'Приготовьтесь', ended: false, mark: left <= 3 ? 'cd' + left : null, elapsed: 0 };
  }
  const total = totalSec(def);
  if (el >= total) return { big: fmtTime(total), phase: 'Время вышло', ended: true, mark: 'end', elapsed: total };
  if (def.format === 'time')
    return { big: fmtTime(el), phase: def.min ? `лимит ${def.min} мин` : 'на время', ended: false, mark: 'go', elapsed: el };
  if (def.format === 'amrap')
    return { big: fmtTime(total - el), phase: 'осталось', ended: false, mark: 'go', elapsed: el };
  if (def.format === 'emom') {
    const m = Math.floor(el / 60);
    return { big: fmtTime(60 - (el % 60)), phase: `минута ${m + 1} из ${def.min}`, ended: false, mark: 'm' + m, elapsed: el };
  }
  const cyc = def.work + def.rest, i = Math.floor(el / cyc), inCyc = el % cyc, work = inCyc < def.work;
  return {
    big: fmtTime(work ? def.work - inCyc : cyc - inCyc),
    phase: `${work ? 'РАБОТА' : 'отдых'} · интервал ${i + 1} из ${def.rounds}`,
    ended: false, mark: (work ? 'w' : 'r') + i, elapsed: el, interval: i, work,
  };
}
