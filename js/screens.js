// Экраны: календарь (стартовый), упражнения, настройки, тренировка.
import { h, sheet, shareFile } from './dom.js';
import { register, go, reset, render, back } from './router.js';
import { state, save, replaceState, exById, workoutById, APP_ID, VERSION } from './store.js';
import { isoDate, fmtDate, fmtSet, fmtTime, parseTime, parseNum, fmtNum, daysBetween, fmtWodResult } from './calc.js';
import { doneSets, prFlags, wodIsPR, activeWorkout } from './queries.js';
import { pickerView, openPicker } from './picker.js';
import { addEntry, startWorkout, lastWeek, repeatWorkout, finishWorkout, deleteWorkout, backdatedWorkout } from './workout.js';
import { formatLine } from './data-wods.js';
import { exportXlsx } from './export.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function tabs(on) {
  const t = (name, ic, label) => h('button', { class: on === name ? 'on' : '', onclick: () => reset(name) }, h('span', { class: 'ic' }, ic), label);
  const a = activeWorkout();
  return h('div', null,
    a ? h('button', { class: 'activebar', onclick: () => go('workout', { id: a.id }) },
      h('span', null, '● Идёт тренировка'), h('span', null, `${a.items.length} упр. ›`)) : null,
    h('nav', { class: 'tabs' }, t('calendar', '▦', 'Календарь'), t('exercises', '☰', 'Упражнения'), t('settings', '⚙', 'Настройки')));
}

export function itemSummary(w, it) {
  if (it.kind === 'ex') {
    const ds = doneSets(it);
    const pr = prFlags(w, it).some(Boolean);
    return { name: exById(it.exId)?.name ?? 'Удалённое упражнение', sum: ds.length ? ds.map(fmtSet).join(', ') : 'нет отмеченных подходов', pr };
  }
  const r = fmtWodResult(it.def.format, it.res, it.rx);
  return { name: it.def.name, sum: r || formatLine(it.def), pr: wodIsPR(w, it) };
}

// ── Календарь ──
let view = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let selected = isoDate();

register('calendar', () => {
  const today = isoDate();
  const byDate = {};
  for (const w of state.workouts) (byDate[w.date] ??= []).push(w);
  const first = new Date(view.y, view.m, 1), shift = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div', { class: 'wd' }, d));
  for (let i = 0; i < shift; i++) cells.push(h('div'));
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(view.y, view.m, d));
    cells.push(h('button', {
      class: ['d', byDate[iso] && 'has', iso === today && 'today', iso === selected && 'sel', iso > today && 'future'].filter(Boolean).join(' '),
      onclick: () => { selected = iso; render(true); },
    }, d));
  }
  const nav = dm => () => { const d = new Date(view.y, view.m + dm, 1); view = { y: d.getFullYear(), m: d.getMonth() }; render(true); };

  const ago = state.lastBackup ? daysBetween(state.lastBackup.slice(0, 10), today) : null;
  const banner = state.workouts.length && (ago === null || ago > 7)
    ? h('div', { class: 'banner' }, h('span', null, ago === null ? 'Копии данных ещё не было' : `Копия была ${ago} дн. назад`),
      h('button', { class: 'link', onclick: backup }, 'Сохранить'))
    : null;

  const dayW = (byDate[selected] ?? []).sort((a, b) => a.created - b.created);
  const day = h('div', null,
    h('div', { class: 'section' }, selected === today ? 'Сегодня' : fmtDate(selected)),
    dayW.length ? dayW.map(w => h('button', { class: 'card', onclick: () => go('workout', { id: w.id }) },
      h('div', { class: 't' }, w.id === state.activeId ? 'Идёт тренировка' : 'Тренировка', w.items.some(it => itemSummary(w, it).pr) ? h('span', { class: 'pr' }, ' 🏆') : null),
      w.items.length ? w.items.map(it => h('div', { class: 's' }, itemSummary(w, it).name)) : h('div', { class: 's' }, 'пустая')))
      : selected < today ? h('button', { class: 'btn sec', onclick: () => go('workout', { id: backdatedWorkout(selected).id }) }, `Записать тренировку за ${fmtDate(selected)}`)
      : h('div', { class: 'muted small' }, selected === today ? 'Сегодня тренировок ещё нет' : ''));

  const a = activeWorkout();
  return {
    title: 'Тренировки', left: h('span'),
    body: [banner,
      h('div', { class: 'cal-head' }, h('button', { onclick: nav(-1), 'aria-label': 'Прошлый месяц' }, '‹'),
        h('h2', null, `${MONTHS[view.m]} ${view.y}`), h('button', { onclick: nav(1), 'aria-label': 'Следующий месяц' }, '›')),
      h('div', { class: 'cal' }, cells), day],
    bottom: [
      h('button', { class: 'btn', onclick: () => go('workout', { id: startWorkout().id }) }, a ? '▶ Продолжить тренировку' : '▶ Начать тренировку'),
      a ? null : h('button', { class: 'btn sec', onclick: repeatSheet }, '↻ Повторить с прошлой недели')],
    tabs: tabs('calendar'),
  };
});

function repeatSheet() {
  const list = lastWeek();
  const close = sheet('Повторить', () => list.length
    ? h('div', { class: 'list' }, list.map(w => h('button', { onclick: () => { close(); go('workout', { id: repeatWorkout(w).id }); } },
      h('div', null, h('div', null, fmtDate(w.date)), h('div', { class: 'muted small' }, w.items.map(it => itemSummary(w, it).name).join(', '))), '›')))
    : h('div', { class: 'empty' }, 'За последние 7 дней тренировок нет'));
}

// ── Упражнения (вся база, история любого упражнения) ──
register('exercises', () => ({
  title: 'Упражнения', left: h('span'),
  body: pickerView(e => go('history', e)),
  tabs: tabs('exercises'),
}));

// ── Тренировка ──
register('workout', ({ id }) => {
  const w = workoutById(id);
  if (!w) { setTimeout(() => reset('calendar')); return { title: '', body: [] }; }
  const active = w.id === state.activeId;
  const date = h('input', {
    type: 'date', class: 'field', style: 'flex:1;max-width:200px;min-height:44px', value: w.date, max: isoDate(),
    onchange: e => { if (e.target.value) { w.date = e.target.value; save(); } },
  });
  const cards = w.items.map(it => {
    const s = itemSummary(w, it);
    return h('button', { class: 'card', onclick: () => go('item', { wid: w.id, iid: it.id }) },
      h('div', { class: 't' }, s.name, s.pr ? h('span', { class: 'pr' }, ' 🏆') : null), h('div', { class: 's' }, s.sum));
  });
  const add = () => openPicker(e => { const it = addEntry(w, e); go('item', { wid: w.id, iid: it.id }); });
  return {
    title: active ? 'Тренировка' : fmtDate(w.date),
    body: [
      h('div', { class: 'toggle', style: 'margin-bottom:12px;gap:12px' }, h('span', { class: 'muted' }, 'Дата'), date),
      cards.length ? cards : h('div', { class: 'empty' }, 'Добавьте первое упражнение или комплекс'),
      h('button', {
        class: 'btn danger', style: 'margin-top:20px', onclick: () => {
          if (confirm('Удалить тренировку целиком? Это нельзя отменить.')) { deleteWorkout(w); reset('calendar'); }
        },
      }, 'Удалить тренировку'),
    ],
    bottom: h('div', { class: 'row2' },
      h('button', { class: 'btn', onclick: add }, '+ Упражнение'),
      active ? h('button', { class: 'btn sec', onclick: () => { finishWorkout(w); selected = w.date; reset('calendar'); } }, 'Закончить')
        : h('button', { class: 'btn sec', onclick: () => back() }, 'Готово')),
  };
});

// ── Настройки ──
async function backup() {
  const data = JSON.stringify({ app: APP_ID, version: VERSION, savedAt: new Date().toISOString(), data: state });
  const ok = await shareFile(new Blob([data], { type: 'application/json' }), `тренировки_${isoDate()}.json`);
  if (ok) { state.lastBackup = new Date().toISOString(); save(); render(true); }
}

function restore() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  input.onchange = async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { obj = null; }
    if (!obj || obj.app !== APP_ID || !obj.data || !Array.isArray(obj.data.workouts)) {
      alert('Этот файл не похож на копию тренировок. Текущие данные не тронуты.');
      return;
    }
    const when = obj.savedAt ? fmtDate(obj.savedAt.slice(0, 10)) : '?';
    if (!confirm(`В копии ${obj.data.workouts.length} трен. от ${when}.\nТекущие данные будут заменены. Продолжить?`)) return;
    await replaceState({ ...obj.data, rest: null });
    reset('calendar');
    alert('Данные восстановлены');
  };
  document.body.append(input);
  input.click();
}

async function excel() {
  if (!state.workouts.length) { alert('Пока нечего выгружать'); return; }
  await shareFile(exportXlsx(), `тренировки_${isoDate()}.xlsx`);
}

register('settings', () => {
  const s = state.settings;
  const restIn = h('input', {
    class: 'field', style: 'width:110px;text-align:center', inputMode: 'numeric', value: fmtTime(s.restSec),
    onchange: e => { const v = parseTime(e.target.value); if (v) { s.restSec = v; save(); } e.target.value = fmtTime(s.restSec); },
  });
  const barIn = h('input', {
    class: 'field', style: 'width:110px;text-align:center', inputMode: 'decimal', value: fmtNum(s.bar),
    onchange: e => { const v = parseNum(e.target.value); if (v !== null) { s.bar = v; save(); } e.target.value = fmtNum(s.bar); },
  });
  const ALL = [50, 25, 20, 15, 10, 5, 2.5, 2, 1.5, 1.25, 1, 0.5];
  return {
    title: 'Настройки', left: h('span'),
    body: [
      h('div', { class: 'section' }, 'Таймер отдыха'),
      h('div', { class: 'list' },
        h('label', null, 'Запускать после ✓', h('input', { type: 'checkbox', checked: s.restOn, style: 'width:24px;height:24px', onchange: e => { s.restOn = e.target.checked; save(); } })),
        h('label', null, 'Время отдыха (мин:сек)', restIn)),
      h('div', { class: 'section' }, 'Гриф и блины'),
      h('div', { class: 'list' }, h('label', null, 'Вес грифа, кг', barIn)),
      h('div', { class: 'muted small', style: 'margin:8px 0 4px' }, 'Блины в зале, кг (нажмите, чтобы убрать или добавить):'),
      h('div', null, ALL.map(p => h('button', {
        class: 'chip' + (s.plates.includes(p) ? ' on' : ''),
        onclick: () => { s.plates = s.plates.includes(p) ? s.plates.filter(x => x !== p) : [...s.plates, p].sort((a, b) => b - a); save(); render(true); },
      }, fmtNum(p)))),
      h('div', { class: 'section' }, 'Данные'),
      h('div', { class: 'muted small', style: 'margin-bottom:8px' },
        'Все записи хранятся только в этом телефоне. Если удалить значок или очистить данные Safari — они пропадут. Раз в неделю сохраняйте копию в «Файлы» или iCloud.'),
      h('button', { class: 'btn', onclick: backup }, 'Сохранить копию'),
      h('button', { class: 'btn sec', onclick: restore }, 'Восстановить из копии'),
      h('div', { class: 'muted small center', style: 'margin:6px 0 0' }, state.lastBackup ? `Последняя копия: ${fmtDate(state.lastBackup.slice(0, 10))}` : 'Копии ещё не было'),
      h('button', { class: 'btn sec', style: 'margin-top:16px', onclick: excel }, 'Выгрузить в Excel'),
      h('div', { class: 'muted small center', style: 'margin-top:24px' }, `Тренировки · версия ${window.APP_BUILD ?? ''}`),
    ],
    tabs: tabs('settings'),
  };
});
