// Строки для Excel: одна строка на подход с ✓, комплекс — одна строка на результат.
import { sortedWorkouts, exById } from './store.js';
import { doneSets, prFlags, wodIsPR } from './queries.js';
import { TYPE_NAMES, wodHasResult, fmtTime } from './calc.js';
import { FORMAT_NAMES } from './data-wods.js';
import { makeXlsx } from './xlsx.js';

export const HEADER = ['Дата', 'Упражнение', 'Тип', '№', 'Вес, кг', 'Повторы', 'Дистанция, м', 'Время', 'Раунды + повт.', 'RX', 'Рекорд', 'Заметка'];

export function exportRows() {
  const rows = [];
  for (const w of sortedWorkouts()) {
    if (w.planned) continue; // планы на будущее в отчёт не идут
    for (const it of w.items) {
      if (it.kind === 'ex') {
        const ex = exById(it.exId);
        const prs = prFlags(w, it);
        let n = 0;
        it.sets.forEach((s, i) => {
          if (!s.done) return;
          rows.push([{ date: w.date }, ex?.name ?? '?', TYPE_NAMES[ex?.type] ?? '', ++n, s.w ?? null, s.r ?? null, s.d ?? null,
            s.t != null ? { time: s.t } : null, null, null, prs[i] ? 'да' : null, n === 1 && it.note ? it.note : null]);
        });
        if (n === 0 && it.note) rows.push([{ date: w.date }, ex?.name ?? '?', TYPE_NAMES[ex?.type] ?? '', null, null, null, null, null, null, null, null, it.note]);
      } else if (it.kind === 'task') {
        const name = (it.text ?? '').split('\n')[0].slice(0, 60) || 'Задание';
        if (it.mode === 'sets') {
          let n = 0;
          for (const s of it.sets ?? []) {
            if (!s.done) continue;
            rows.push([{ date: w.date }, name, 'задание', ++n, s.w ?? null, s.r ?? null, null, null, null, null, null, n === 1 && it.text ? it.text : null]);
          }
          if (n === 0) rows.push([{ date: w.date }, name, 'задание', null, null, null, null, null, null, null, null, it.text || null]);
        } else if (it.mode === 'time') {
          rows.push([{ date: w.date }, name, 'задание', null, null, null, null, it.time != null ? { time: it.time } : null, null, null, null, it.text || null]);
        } else if (it.mode === 'times') {
          const ts = (it.times ?? []).filter(t => t != null);
          const note = [it.text, ts.length ? 'интервалы: ' + ts.map(fmtTime).join(', ') : ''].filter(Boolean).join(' — ');
          rows.push([{ date: w.date }, name, 'задание', null, null, null, null, null, null, null, null, note || null]);
        } else {
          rows.push([{ date: w.date }, name, 'задание', null, null, null, null, null, null, null, null, it.text || null]);
        }
      } else {
        const f = it.def.format, r = it.res || {};
        if (!wodHasResult(f, r)) continue;
        const note = [f === 'emom' ? 'сделано' : '', f === 'time' && r.capped ? 'не уложился в лимит' : '', it.note].filter(Boolean).join('; ');
        rows.push([{ date: w.date }, it.def.name, FORMAT_NAMES[f], 1, it.weight ?? null,
          f === 'int' ? r.total : f === 'time' && r.capped ? r.reps ?? null : null, null,
          f === 'time' && !r.capped ? { time: r.time } : null,
          f === 'amrap' ? `${r.rounds} + ${r.reps ?? 0}` : null,
          it.rx ? 'да' : null, wodIsPR(w, it) ? 'да' : null, note || null]);
      }
    }
  }
  return rows;
}

export function exportXlsx() {
  return makeXlsx(HEADER, exportRows());
}
