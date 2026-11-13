// Экраны: календарь (стартовый), упражнения, настройки, тренировка.
import { h, sheet, shareFile } from './dom.js';
import { register, go, reset, render, back } from './router.js';
import { state, save, replaceState, exById, workoutById, APP_ID, VERSION } from './store.js';
import { isoDate, fmtDate, fmtSet, fmtTime, parseTime, parseNum, fmtNum, daysBetween, fmtWodResult } from './calc.js';
import { doneSets, prFlags, wodIsPR, activeWorkout } from './queries.js';
import { pickerView, openPicker } from './picker.js';
import { addEntry, addTask, startWorkout, lastWeek, repeatWorkout, finishWorkout, deleteWorkout, backdatedWorkout, plannedWorkout, startPlanned, saveAsTemplate, deleteTemplate, applyTemplate, toggleRestDay } from './workout.js';
import { formatLine } from './data-wods.js';
import { exportXlsx } from './export.js';
import { applyUi } from './ui.js';
import { syncEnabled, enableSync, disableSync, syncNow, syncStatus } from './sync.js';

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
  if (it.kind === 'task') {
    const name = (it.text ?? '').split('\n')[0].trim() || 'Задание';
    let sum = '';
    if (it.mode === 'time') sum = it.time != null ? fmtTime(it.time) : 'время не записано';
    else if (it.mode === 'sets') {
      const ds = (it.sets ?? []).filter(s => s.done);
      sum = ds.length ? ds.map(fmtSet).join(', ') : 'подходы не отмечены';
    } else if (it.mode === 'times') {
      const ts = (it.times ?? []).filter(t => t != null);
      sum = ts.length ? ts.map(fmtTime).join(', ') : 'интервалы не записаны';
    }
    return { name, sum, pr: false };
  }
  const r = fmtWodResult(it.def.format, it.res, it.rx);
  return { name: it.def.name, sum: r || formatLine(it.def), pr: wodIsPR(w, it) };
}

// ── Календарь ──
let view = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
let selected = isoDate();

register('calendar', () => {
  const today = isoDate();
  const byDate = {}, plannedDates = new Set(), restDays = new Set(state.restDays ?? []);
  for (const w of state.workouts) {
    (byDate[w.date] ??= []).push(w);
    if (w.planned) plannedDates.add(w.date);
  }
  const first = new Date(view.y, view.m, 1), shift = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div', { class: 'wd' }, d));
  for (let i = 0; i < shift; i++) cells.push(h('div'));
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(view.y, view.m, d));
    cells.push(h('button', {
      class: ['d', byDate[iso] && 'has', plannedDates.has(iso) && 'plan', restDays.has(iso) && 'rest',
        iso === today && 'today', iso === selected && 'sel', iso > today && 'future'].filter(Boolean).join(' '),
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
  const future = selected > today;
  const newWorkoutBtn = h('button', {
    class: 'btn', onclick: () => go('workout', { id: (future ? plannedWorkout(selected) : selected === today ? startWorkout() : backdatedWorkout(selected)).id }),
  }, dayW.length ? (future ? '＋ Ещё одна в план' : '＋ Ещё одна тренировка') : future ? `＋ Запланировать на ${fmtDate(selected)}` : selected === today ? '＋ Новая тренировка' : `＋ Тренировка за ${fmtDate(selected)}`);
  const restChip = h('button', {
    class: 'chip' + (restDays.has(selected) ? ' on' : ''),
    onclick: () => { toggleRestDay(selected); render(true); },
  }, restDays.has(selected) ? '😴 День отдыха' : 'Отметить днём отдыха');
  const day = h('div', null,
    h('div', { class: 'section' }, selected === today ? 'Сегодня' : fmtDate(selected)),
    dayW.length ? dayW.map(w => h('button', { class: 'card' + (w.planned ? ' plan' : ''), onclick: () => go('workout', { id: w.id }) },
      h('div', { class: 't' }, w.id === state.activeId ? 'Идёт тренировка' : w.planned ? '📅 План' : 'Тренировка', w.items.some(it => itemSummary(w, it).pr) ? h('span', { class: 'pr' }, ' 🏆') : null),
      w.items.length ? w.items.map(it => h('div', { class: 's' }, itemSummary(w, it).name)) : h('div', { class: 's' }, 'пустая')))
      : h('div', { class: 'muted small', style: 'margin:2px 0 12px' }, future ? 'Планов нет — можно запланировать' : 'В этот день тренировок нет'),
    h('div', null, restChip),
    newWorkoutBtn,
    h('button', { class: 'btn sec', onclick: () => templateSheet(selected) }, '★ Из шаблона'),
    selected === today && !activeWorkout() ? h('button', { class: 'btn sec', onclick: repeatSheet }, '↻ Повторить с прошлой недели') : null);

  return {
    title: 'Тренировки', left: h('span'),
    body: [banner,
      h('div', { class: 'cal-head' }, h('button', { onclick: nav(-1), 'aria-label': 'Прошлый месяц' }, '‹'),
        h('h2', null, `${MONTHS[view.m]} ${view.y}`), h('button', { onclick: nav(1), 'aria-label': 'Следующий месяц' }, '›')),
      h('div', { class: 'cal' }, cells), day],
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

// Развернуть шаблон в выбранный день календаря
function templateSheet(date) {
  const close = sheet('Шаблоны тренировок', (c, redraw) => {
    const list = state.templates ?? [];
    return [
      list.length ? h('div', { class: 'list' }, list.map(t => h('div', null,
        h('button', { onclick: () => { close(); go('workout', { id: applyTemplate(t, date).id }); } },
          h('div', null, h('div', null, t.name),
            h('div', { class: 'muted small' }, t.items.map(it => it.kind === 'task' ? (it.text ?? '').split('\n')[0] || 'Задание' : it.kind === 'ex' ? exById(it.exId)?.name ?? '?' : it.def.name).join(', ')))),
        h('button', { class: 'link', onclick: () => { if (confirm(`Удалить шаблон «${t.name}»?`)) { deleteTemplate(t.id); redraw(); } } }, '✕'))))
        : h('div', { class: 'empty' }, 'Шаблонов пока нет. Откройте тренировку и нажмите «☆ В шаблон».'),
      h('div', { class: 'muted small', style: 'margin-top:8px' }, `Шаблон развернётся на ${fmtDate(date)}`),
    ];
  });
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
  const planned = !!w.planned;
  const today = isoDate();
  const date = h('input', {
    type: 'date', class: 'field', style: 'flex:1;max-width:200px;min-height:44px', value: w.date, max: planned ? null : today,
    onchange: e => { if (e.target.value) { w.date = e.target.value; save(); render(true); } },
  });
  // Карточки пунктов; идущие подряд пункты одного суперсета — общая карточка с буквами А/Б/В
  const itemCard = (it, letter = null) => {
    const s = itemSummary(w, it);
    return h('button', { class: 'card', onclick: () => go('item', { wid: w.id, iid: it.id }) },
      h('div', { class: 't' }, letter ? h('span', { class: 'ssl' }, letter) : null, s.name,
        it.done ? h('span', { style: 'color:var(--accent)' }, ' ✓') : null,
        s.pr ? h('span', { class: 'pr' }, ' 🏆') : null), h('div', { class: 's' }, s.sum));
  };
  const cards = [];
  for (let i = 0; i < w.items.length;) {
    const it = w.items[i];
    if (it.ss && w.items[i + 1]?.ss === it.ss) {
      const group = [it];
      while (w.items[i + group.length]?.ss === it.ss) group.push(w.items[i + group.length]);
      i += group.length;
      cards.push(h('div', { class: 'ss' },
        h('div', { class: 'sst' }, `Суперсет ×${group.length}`),
        ...group.map((g, k) => itemCard(g, String.fromCharCode(1040 + k))))); // А, Б, В…
    } else {
      cards.push(itemCard(it));
      i++;
    }
  }
  const add = () => openPicker(e => { const it = addEntry(w, e); go('item', { wid: w.id, iid: it.id }); });
  const addText = () => { const it = addTask(w); go('item', { wid: w.id, iid: it.id }); };
  const toTemplate = () => {
    const inp = h('input', { class: 'field', placeholder: 'Например: Ноги, Верх + кор', style: 'margin-bottom:10px' });
    const close = sheet('Сохранить шаблон', () => [
      h('div', { class: 'muted small', style: 'margin-bottom:8px' }, 'Текущий состав тренировки сохранится без результатов — потом разворачивайте его в любой день кнопкой «★ Из шаблона» в календаре.'),
      inp,
      h('button', {
        class: 'btn', onclick: () => {
          const name = inp.value.trim();
          if (!name) { inp.classList.add('bad'); inp.focus(); return; }
          saveAsTemplate(w, name);
          close(); alert(`Шаблон «${name}» сохранён`);
        },
      }, 'Сохранить'),
    ]);
    setTimeout(() => inp.focus(), 300);
  };
  return {
    title: active ? 'Тренировка' : planned ? `План на ${fmtDate(w.date)}` : fmtDate(w.date),
    body: [
      h('div', { class: 'toggle', style: 'margin-bottom:12px;gap:12px' }, h('span', { class: 'muted' }, 'Дата'), date),
      planned && w.date <= today ? h('div', { class: 'banner' }, h('span', null, 'Этот день уже наступил'), null) : null,
      cards.length ? cards : h('div', { class: 'empty' }, 'Добавьте первое упражнение, комплекс или задание'),
      w.items.length ? h('button', { class: 'btn sec', style: 'margin-top:4px', onclick: toTemplate }, '☆ В шаблон') : null,
      h('button', {
        class: 'btn danger', style: 'margin-top:20px', onclick: () => {
          if (confirm('Удалить тренировку целиком? Это нельзя отменить.')) { deleteWorkout(w); reset('calendar'); }
        },
      }, planned ? 'Удалить из плана' : 'Удалить тренировку'),
    ],
    bottom: h('div', null,
      h('div', { class: 'row2' },
        h('button', { class: 'btn', onclick: add }, '+ Упражнение'),
        h('button', { class: 'btn', onclick: addText }, '+ Задание')),
      active ? h('button', { class: 'btn sec', onclick: () => { finishWorkout(w); selected = w.date; reset('calendar'); } }, 'Закончить')
        : planned && w.date <= today ? h('button', { class: 'btn sec', onclick: () => { startPlanned(w); render(true); } }, '▶ Начать тренировку')
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

// Блок синхронизации в настройках
function syncBlock() {
  if (!syncEnabled()) {
    const inp = h('input', { class: 'field', placeholder: 'Вставьте токен GitHub', style: 'margin-bottom:8px' });
    return h('div', null,
      h('div', { class: 'muted small', style: 'margin-bottom:8px' },
        'Чтобы тренировки были одинаковыми на телефоне и компьютере: один раз создайте токен на GitHub и вставьте его здесь на каждом устройстве. Данные лежат в вашем скрытом хранилище на GitHub, их видите только вы.'),
      inp,
      h('button', {
        class: 'btn', onclick: async () => {
          const t = inp.value.trim();
          if (!t) { inp.classList.add('bad'); return; }
          try {
            await enableSync(t);
            const changed = await syncNow();
            if (changed) applyUi(state.settings);
            alert('Синхронизация включена');
            render(true);
          } catch (e) { alert(e.message); }
        },
      }, 'Включить синхронизацию'));
  }
  const st = syncStatus();
  return h('div', null,
    h('div', { class: 'muted small', style: 'margin-bottom:8px' },
      st ? (st.ok ? `Синхронизировано: ${new Date(st.at).toLocaleString('ru-RU')}` : `Ошибка: ${st.error}`) : 'Включена'),
    h('div', { class: 'row2' },
      h('button', {
        class: 'btn', onclick: async () => {
          const changed = await syncNow();
          if (changed) { applyUi(state.settings); reset('calendar'); }
          render(true);
        },
      }, 'Синхронизировать'),
      h('button', {
        class: 'btn sec', onclick: () => {
          if (confirm('Отключить синхронизацию на этом устройстве? Записи останутся.')) { disableSync(); render(true); }
        },
      }, 'Отключить')));
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

  // Оформление: выбор применяется сразу
  const seg = (options, get, set) => h('div', { class: 'tabs2' }, Object.entries(options).map(([k, v]) =>
    h('button', { class: get() === k ? 'on' : '', onclick: () => { set(k); save(); applyUi(s); render(true); } }, v)));
  const ACCENTS = { blue: ['Синий', '#0A84FF'], green: ['Зелёный', '#30A24B'], orange: ['Оранжевый', '#E8760A'], pink: ['Розовый', '#E0335F'], purple: ['Фиолетовый', '#9E4EDD'], graphite: ['Графит', '#6E6E73'] };
  return {
    title: 'Настройки', left: h('span'),
    body: [
      h('div', { class: 'section' }, 'Интерфейс'),
      h('label', { class: 'f' }, 'Тема'),
      seg({ auto: 'Как в телефоне', light: 'Светлая', dark: 'Тёмная' }, () => s.theme, v => { s.theme = v; }),
      h('label', { class: 'f' }, 'Цвет'),
      h('div', null, Object.entries(ACCENTS).map(([k, [name, color]]) =>
        h('button', { class: 'chip' + (s.accent === k ? ' on' : ''), onclick: () => { s.accent = k; save(); applyUi(s); render(true); } },
          h('span', { class: 'dot', style: `background:${color}` }), name))),
      h('label', { class: 'f' }, 'Размер шрифта'),
      seg({ s: 'Мелкий', m: 'Обычный', l: 'Крупный' }, () => s.font, v => { s.font = v; }),
      h('label', { class: 'f' }, 'Плотность'),
      seg({ normal: 'Обычная', compact: 'Компактная' }, () => s.density, v => { s.density = v; }),
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
      h('div', { class: 'section' }, 'Синхронизация'),
      syncBlock(),
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
