// История упражнения или комплекса: список по датам, график, рекорды.
import { h } from './dom.js';
import { register, render } from './router.js';
import { exById, wodById } from './store.js';
import { fmtSet, fmtDate, fmtNum, fmtTime, bestSets, repMaxes, oneRM, fmtWodResult } from './calc.js';
import { entries, doneSets, prFlags, wodEntries, wodBest, wodIsPR } from './queries.js';
import { formatLine } from './data-wods.js';

let tab = 'list';
let lastKey = '';

register('history', ({ kind, id }) => {
  const key = kind + id;
  if (key !== lastKey) { tab = 'list'; lastKey = key; }
  const switcher = names => h('div', { class: 'tabs2' }, Object.entries(names).map(([k, v]) =>
    h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; render(true); } }, v)));
  return kind === 'ex' ? exHistory(id, switcher) : wodHistory(id, switcher);
});

function dateOf(set, list) {
  return list.find(e => e.item.sets.includes(set))?.workout.date;
}

function exHistory(id, switcher) {
  const ex = exById(id) ?? { name: 'Упражнение' };
  const list = entries(id).filter(e => doneSets(e.item).length);
  const all = list.flatMap(e => doneSets(e.item));
  const hasW = all.some(s => s.w != null);
  const tabs = hasW ? { list: 'Список', chart: 'График', rec: 'Рекорды' } : { list: 'Список', chart: 'График' };
  if (!tabs[tab]) tab = 'list';
  if (!list.length) return { title: ex.name, body: h('div', { class: 'empty' }, 'Пока нет ни одного отмеченного подхода') };

  let body;
  if (tab === 'list') {
    const best = bestSets(all);
    body = [
      h('div', { class: 'card' }, h('div', { class: 's' }, 'Рекорд'),
        best.map(b => h('div', { class: 't' }, '🏆 ', fmtSet(b), h('span', { class: 'muted small' }, `  ${fmtDate(dateOf(b, list))}`)))),
      h('div', { class: 'list' }, [...list].reverse().map(e => h('div', null,
        h('div', null, h('div', { class: 'muted small' }, fmtDate(e.workout.date)),
          h('div', null, doneSets(e.item).map(fmtSet).join(', ')),
          e.item.note ? h('div', { class: 'muted small' }, e.item.note) : null),
        prFlags(e.workout, e.item).some(Boolean) ? h('span', { class: 'pr' }, '🏆') : null))),
    ];
  } else if (tab === 'chart') {
    let pts, label, fmt = fmtNum, lowerBetter = false;
    if (hasW) { label = 'Максимальный вес за тренировку, кг'; pts = list.map(e => [e.workout.date, Math.max(...doneSets(e.item).map(s => s.w ?? 0))]); }
    else if (all.some(s => s.d != null && s.t != null)) {
      const counts = {};
      for (const s of all) if (s.d != null) counts[s.d] = (counts[s.d] ?? 0) + 1;
      const dist = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      label = `Лучшее время на ${fmtNum(dist)} м`; fmt = fmtTime; lowerBetter = true;
      pts = list.map(e => [e.workout.date, Math.min(...doneSets(e.item).filter(s => s.d === dist && s.t != null).map(s => s.t))]).filter(p => Number.isFinite(p[1]));
    } else if (all.some(s => s.t != null)) { label = 'Лучшее время'; fmt = fmtTime; pts = list.map(e => [e.workout.date, Math.max(...doneSets(e.item).map(s => s.t ?? 0))]); }
    else { label = 'Максимум повторов в подходе'; pts = list.map(e => [e.workout.date, Math.max(...doneSets(e.item).map(s => s.r ?? 0))]); }
    body = [h('div', { class: 'muted small' }, label + (lowerBetter ? ' (ниже — лучше)' : '')), chart(pts, fmt)];
  } else {
    const rm = oneRM(all);
    body = [
      h('div', { class: 'list' }, repMaxes(all).map(({ n, set }) => h('div', null,
        h('span', null, `${n} ${n === 1 ? 'повтор' : n < 5 ? 'повтора' : 'повторов'}`),
        set ? h('span', null, h('b', null, `${fmtNum(set.w)} кг`), h('span', { class: 'muted small' }, `  ${fmtDate(dateOf(set, list))}`)) : h('span', { class: 'muted' }, '—')))),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, 'Лучший вес, поднятый на столько или больше повторов.'),
      rm ? h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 's' }, '1ПМ по формуле'), h('div', { class: 't' }, `${fmtNum(rm.value)} кг`), h('div', { class: 's' }, `из ${fmtSet(rm.from)}`)) : null,
    ];
  }
  return { title: ex.name, body: [switcher(tabs), body] };
}

function wodHistory(id, switcher) {
  const list = wodEntries(id);
  const def = list[list.length - 1]?.item.def ?? wodById(id);
  const title = def?.name ?? 'Комплекс';
  if (!list.length) return { title, body: [h('div', { class: 'muted' }, def ? formatLine(def) : ''), h('div', { class: 'empty' }, 'Пока нет результатов')] };
  const f = def.format;
  const canChart = f !== 'emom';
  if (!canChart) tab = 'list';
  let body;
  if (tab === 'list') {
    const best = [wodBest(id, true), wodBest(id, false)].filter(Boolean);
    body = [
      best.length ? h('div', { class: 'card' }, h('div', { class: 's' }, 'Рекорд'),
        best.map(b => h('div', { class: 't' }, '🏆 ', fmtWodResult(f, b.item.res, b.item.rx), h('span', { class: 'muted small' }, `  ${fmtDate(b.workout.date)}`)))) : null,
      h('div', { class: 'list' }, [...list].reverse().map(e => h('div', null,
        h('div', null, h('div', { class: 'muted small' }, fmtDate(e.workout.date)),
          h('div', null, fmtWodResult(f, e.item.res, e.item.rx), e.item.weight ? h('span', { class: 'muted' }, ` · ${fmtNum(e.item.weight)} кг`) : null),
          e.item.note ? h('div', { class: 'muted small' }, e.item.note) : null),
        wodIsPR(e.workout, e.item) ? h('span', { class: 'pr' }, '🏆') : null))),
    ];
  } else {
    const pts = list.filter(e => !e.item.res.capped).map(e => [e.workout.date,
      f === 'time' ? e.item.res.time : f === 'amrap' ? e.item.res.rounds + (e.item.res.reps ?? 0) / 100 : e.item.res.total]);
    body = [h('div', { class: 'muted small' }, f === 'time' ? 'Время (ниже — лучше)' : f === 'amrap' ? 'Раунды' : 'Сумма повторов'),
      chart(pts, f === 'time' ? fmtTime : v => fmtNum(Math.floor(v)))];
  }
  return { title, body: [h('div', { class: 'muted', style: 'margin-bottom:8px' }, formatLine(def)), canChart ? switcher({ list: 'Список', chart: 'График' }) : null, body] };
}

// Простой линейный график: даты по горизонтали
function chart(pts, fmt) {
  if (pts.length < 2) return h('div', { class: 'empty' }, pts.length ? `Одна тренировка: ${fmt(pts[0][1])}. График появится со второй.` : 'Пока нет данных');
  const W = 340, H = 200, L = 44, R = 10, T = 12, B = 26;
  const ys = pts.map(p => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => L + (i * (W - L - R)) / (pts.length - 1);
  const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, a, txt) => { const el = document.createElementNS(NS, tag); for (const k in a) el.setAttribute(k, a[k]); if (txt != null) el.textContent = txt; return el; };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  for (const v of [lo, (lo + hi) / 2, hi]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--line)' }));
    svg.append(s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmt(v)));
  }
  svg.append(s('polyline', { points: pts.map((p, i) => `${x(i)},${y(p[1])}`).join(' '), fill: 'none', stroke: 'var(--accent-strong)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  pts.forEach((p, i) => svg.append(s('circle', { cx: x(i), cy: y(p[1]), r: 3.5, fill: 'var(--accent-strong)' })));
  const d = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);
  svg.append(s('text', { x: L, y: H - 6 }, d(pts[0][0])));
  svg.append(s('text', { x: W - R, y: H - 6, 'text-anchor': 'end' }, d(pts[pts.length - 1][0])));
  return svg;
}
