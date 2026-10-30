// Экран упражнения (подходы) и экран комплекса (таймер и итог).
import { h, sheet } from './dom.js';
import { register, go, back, render } from './router.js';
import { state, save, exById, workoutById } from './store.js';
import { FIELDS, parseNum, parseTime, fmtNum, fmtTime, fmtSet, oneRM, percentTable, plates, wodHasResult, fmtWodResult } from './calc.js';
import { lastTime, prFlags, allDoneSets, wodIsPR, lastWod } from './queries.js';
import { startRest, restBar } from './rest.js';
import { beep, unlockAudio, keepAwake } from './signals.js';
import { wodClock, COUNTDOWN } from './clock.js';
import { formatLine } from './data-wods.js';

register('item', ({ wid, iid }) => {
  const w = workoutById(wid), it = w?.items.find(i => i.id === iid);
  if (!it) { setTimeout(back); return { title: '', body: [] }; }
  return it.kind === 'ex' ? exerciseScreen(w, it) : wodScreen(w, it);
});

const fmtField = (f, v) => v == null ? '' : f === 't' ? fmtTime(v) : fmtNum(v);
const parseField = (f, s) => f === 't' ? parseTime(s) : f === 'r' || f === 'd' ? (v => v == null ? null : Math.round(v))(parseNum(s)) : parseNum(s);

function removeItem(w, it) {
  if (!confirm('Убрать из тренировки?')) return;
  w.items = w.items.filter(x => x.id !== it.id);
  save(); back();
}

// ── Упражнение ──
function exerciseScreen(w, it) {
  const ex = exById(it.exId) ?? { name: 'Удалённое упражнение', id: it.exId };
  const prev = lastTime(it.exId, w);
  const prs = prFlags(w, it);
  const rb = restBar(() => render(true));
  const hint = (i, f) => (prev[i] ?? prev[prev.length - 1])?.[f] ?? null;

  const rows = it.sets.map((s, i) => {
    const inputs = it.fields.map(f => h('td', null, h('input', {
      inputMode: FIELDS[f].mode === 'decimal' ? 'decimal' : 'numeric',
      value: fmtField(f, s[f]), placeholder: fmtField(f, hint(i, f)), 'aria-label': FIELDS[f].label,
      oninput: e => { s[f] = parseField(f, e.target.value); e.target.classList.remove('bad'); save(); },
      onchange: e => { if (f === 't') e.target.value = fmtField(f, s[f]); },
    })));
    const tick = () => {
      if (s.done) { s.done = false; save(); render(true); return; }
      let bad = false;
      it.fields.forEach((f, k) => {
        if (s[f] == null) s[f] = hint(i, f);
        if (s[f] == null) { bad = true; inputs[k].firstChild.classList.add('bad'); }
      });
      if (bad) return;
      s.done = true;
      save(); startRest(); render(true);
    };
    return h('tr', { class: s.done ? 'done' : '' },
      h('td', { class: 'n', onclick: () => { if (confirm(`Удалить подход ${i + 1}?`)) { it.sets.splice(i, 1); save(); render(true); } } },
        i + 1, prs[i] ? h('div', { class: 'pr' }, '🏆') : null),
      inputs,
      h('td', { style: 'width:50px' }, h('button', { class: 'ok' + (s.done ? ' on' : ''), onclick: tick, 'aria-label': 'Подход сделан' }, '✓')));
  });

  const addSet = () => {
    const last = it.sets[it.sets.length - 1];
    const copy = { done: false };
    if (last) for (const f of it.fields) copy[f] = last[f] ?? hint(it.sets.length - 1, f);
    it.sets.push(copy); save(); render(true);
  };

  const hasW = it.fields.includes('w');
  return {
    title: ex.name,
    right: h('button', { class: 'link', onclick: () => go('history', { kind: 'ex', id: it.exId }) }, 'История'),
    body: [
      w.id === state.activeId ? rb.el : null,
      h('div', { class: 'prev' }, prev.length ? 'Прошлый раз: ' + prev.map(fmtSet).join(', ') : 'Первый раз — удачи!'),
      h('table', { class: 'sets' },
        h('thead', null, h('tr', null, h('th', { class: 'n' }, '№'), it.fields.map(f => h('th', null, FIELDS[f].label)), h('th'))),
        h('tbody', null, rows)),
      it.sets.length ? null : h('div', { class: 'empty' }, 'Подходов нет'),
      h('div', { class: 'row2', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: addSet }, '+ Подход'),
        h('button', { class: 'btn sec', onclick: () => fieldsSheet(it) }, '+ Поле')),
      hasW ? h('div', { class: 'row2', style: 'margin-top:8px' },
        h('button', { class: 'btn sec', onclick: () => percentSheet(it.exId) }, '% от 1ПМ'),
        h('button', { class: 'btn sec', onclick: () => platesSheet(it) }, 'Блины')) : null,
      h('label', { class: 'f' }, 'Заметка'),
      h('textarea', { value: it.note ?? '', oninput: e => { it.note = e.target.value; save(); } }),
      h('div', { class: 'muted small', style: 'margin-top:8px' }, 'Пустой подход с серыми цифрами: ✓ возьмёт прошлые значения. Нажмите на номер подхода, чтобы удалить его.'),
      h('button', { class: 'btn danger', style: 'margin-top:12px', onclick: () => removeItem(w, it) }, 'Убрать из тренировки'),
    ],
    tick: rb.update,
  };
}

function fieldsSheet(it) {
  const names = { w: 'Вес, кг', r: 'Повторы', d: 'Дистанция, м', t: 'Время' };
  sheet('Поля подхода', (close, redraw) => [
    h('div', { class: 'list' }, Object.keys(names).map(f => h('label', null, names[f],
      h('input', {
        type: 'checkbox', checked: it.fields.includes(f), style: 'width:24px;height:24px',
        onchange: e => {
          if (!e.target.checked && it.fields.length === 1) { e.target.checked = true; return; }
          it.fields = e.target.checked ? ['w', 'r', 'd', 't'].filter(x => x === f || it.fields.includes(x)) : it.fields.filter(x => x !== f);
          save(); render(true); redraw();
        },
      })))),
    h('div', { class: 'muted small', style: 'margin-top:8px' }, 'Например, подтягивания с отягощением — включите «Вес».'),
  ]);
}

function percentSheet(exId) {
  const auto = oneRM(allDoneSets(exId));
  sheet('Проценты от 1ПМ', (close, redraw) => {
    const manual = state.oneRM[exId];
    const base = manual ?? auto?.value ?? null;
    const input = h('input', {
      class: 'field', inputMode: 'decimal', style: 'width:110px;text-align:center;font-size:20px', value: fmtNum(base), placeholder: 'кг',
      onchange: e => {
        const v = parseNum(e.target.value);
        if (v) state.oneRM[exId] = v; else delete state.oneRM[exId];
        save(); redraw();
      },
    });
    return [
      h('div', { class: 'toggle' }, h('span', { style: 'font-size:18px' }, '1ПМ, кг'), input),
      h('div', { class: 'muted small', style: 'margin:6px 0 12px' },
        manual != null ? 'Задано вручную' : auto ? `По формуле из ${fmtSet(auto.from)}` : 'Истории ещё нет — впишите свой максимум'),
      manual != null && auto ? h('button', { class: 'btn sec', onclick: () => { delete state.oneRM[exId]; save(); redraw(); } }, `Вернуть по формуле (${fmtNum(auto.value)})`) : null,
      base ? h('div', { class: 'list', style: 'margin-top:12px' }, percentTable(base).map(r =>
        h('div', null, h('span', null, `${r.p}%`), h('b', null, `${fmtNum(r.w)} кг`)))) : null,
      base ? h('div', { class: 'muted small center', style: 'margin-top:6px' }, 'Округлено до 2,5 кг') : null,
    ];
  });
}

function platesSheet(it) {
  const lastW = [...it.sets].reverse().find(s => s.w != null)?.w;
  let target = lastW ?? state.settings.bar;
  sheet('Блины', (close, redraw) => {
    const p = plates(target, state.settings.bar, state.settings.plates);
    return [
      h('div', { class: 'toggle' }, h('span', { style: 'font-size:18px' }, 'Вес на штанге, кг'),
        h('input', {
          class: 'field', inputMode: 'decimal', style: 'width:110px;text-align:center;font-size:20px', value: fmtNum(target),
          onchange: e => { const v = parseNum(e.target.value); if (v) { target = v; redraw(); } },
        })),
      h('div', { style: 'margin:16px 0 8px;font-size:17px' }, `Гриф ${fmtNum(state.settings.bar)} кг + на каждую сторону:`),
      p.tooLight ? h('div', { class: 'muted' }, 'Меньше веса грифа') :
        p.perSide.length ? h('div', null, p.perSide.map(x => h('span', { class: 'chip on', style: 'font-size:20px;padding:10px 16px' }, fmtNum(x)))) :
          h('div', { class: 'muted' }, 'Только гриф'),
      !p.ok && !p.tooLight ? h('div', { class: 'muted', style: 'margin-top:8px' }, `Точно не набрать — ближайший меньший: ${fmtNum(p.total)} кг`) : null,
      h('div', { class: 'muted small', style: 'margin-top:12px' }, 'Гриф и набор блинов меняются в Настройках.'),
    ];
  });
}

// ── Комплекс ──
let lastMark = null;

function wodScreen(w, it) {
  const d = it.def, r = (it.res ??= {});
  const running = it.timer && !it.timer.stopped;
  const prev = lastWod(it.wodId, w);
  const pr = wodIsPR(w, it);

  const start = () => {
    if (wodHasResult(d.format, r) && !confirm('Сбросить результат и запустить таймер заново?')) return;
    unlockAudio();
    it.res = {};
    it.timer = { start: Date.now() + COUNTDOWN * 1000 };
    lastMark = null;
    keepAwake(true); save(); render(true);
  };

  const body = [
    h('div', { class: 'muted' }, formatLine(d)),
    h('div', { class: 'wodlines' }, d.lines.map(l => h('div', null, l))),
    prev ? h('div', { class: 'prev' }, `Прошлый раз (${prev.workout.date.split('-').reverse().join('.')}): ${fmtWodResult(d.format, prev.item.res, prev.item.rx)}`) : null,
    h('button', { class: 'btn', style: 'margin:12px 0', onclick: start }, '▶ Старт'),
    h('div', { class: 'section' }, 'Итог', pr ? h('span', { class: 'pr' }, ' 🏆 рекорд') : null),
    resultForm(d, it),
    h('div', { class: 'toggle', style: 'margin-top:10px' }, h('span', null, 'Вес, кг'),
      h('input', { class: 'field', style: 'width:110px;text-align:center', inputMode: 'decimal', value: fmtNum(it.weight), oninput: e => { it.weight = parseNum(e.target.value); save(); } })),
    h('label', { class: 'toggle', style: 'margin-top:10px' }, h('span', null, 'RX (как в оригинале)'),
      h('input', { type: 'checkbox', checked: !!it.rx, style: 'width:24px;height:24px', onchange: e => { it.rx = e.target.checked; save(); render(true); } })),
    h('label', { class: 'f' }, 'Заметка'),
    h('textarea', { value: it.note ?? '', oninput: e => { it.note = e.target.value; save(); } }),
    h('button', { class: 'btn danger', style: 'margin-top:12px', onclick: () => removeItem(w, it) }, 'Убрать из тренировки'),
  ];

  let tick;
  if (running) {
    const big = h('div', { class: 'clock huge' }), phase = h('div', { class: 'phase' });
    const rounds = h('div', { class: 'phase', style: 'font-size:22px;color:var(--text)' });
    const showRounds = () => { rounds.textContent = d.format === 'amrap' ? `Раунды: ${r.rounds ?? 0}` : ''; };
    showRounds();
    const stop = (finishTime) => {
      const c = wodClock(d, it.timer.start, Date.now());
      if (finishTime) { r.time = Math.round(c.elapsed); r.capped = false; }
      it.timer.stopped = true;
      keepAwake(false); save(); render(true);
    };
    const controls = d.format === 'time'
      ? h('button', { class: 'btn roundbtn', onclick: () => stop(true) }, '■ Финиш')
      : d.format === 'amrap'
        ? h('div', null, h('button', { class: 'btn roundbtn', onclick: () => { r.rounds = (r.rounds ?? 0) + 1; save(); showRounds(); } }, '+ Раунд'),
          h('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => { r.rounds = Math.max(0, (r.rounds ?? 0) - 1); save(); showRounds(); } }, '− Раунд'))
        : null;
    body.push(h('div', { class: 'timer-screen' },
      h('div', { class: 'center', style: 'font-size:20px;font-weight:600' }, d.name),
      h('div', { class: 'mid' }, big, phase, rounds),
      controls,
      h('button', { class: 'btn danger', style: 'margin-top:12px', onclick: () => { if (confirm('Остановить таймер?')) { it.timer = null; keepAwake(false); save(); render(true); } } }, 'Стоп')));
    tick = () => {
      const c = wodClock(d, it.timer.start, Date.now());
      big.textContent = c.big;
      phase.textContent = c.phase;
      if (lastMark !== null && c.mark !== lastMark) {
        if (c.mark?.startsWith('cd')) beep(1, 660, 120);
        else if (c.mark === 'end') beep(3, 990, 300);
        else if (c.mark?.startsWith('r')) beep(2, 520, 200);
        else beep(1, 990, 450);
      }
      lastMark = c.mark;
      if (c.ended) {
        if (d.format === 'time') { r.time = c.elapsed; r.capped = true; r.reps ??= 0; }
        if (d.format === 'amrap') r.rounds ??= 0;
        if (d.format === 'emom') r.done = true;
        it.timer.stopped = true;
        keepAwake(false); save(); render(true);
      }
    };
    lastMark = null;
    keepAwake(true);
  }
  return {
    title: d.name,
    right: h('button', { class: 'link', onclick: () => go('history', { kind: 'wod', id: it.wodId }) }, 'История'),
    body, tick,
  };
}

function resultForm(d, it) {
  const r = it.res;
  const num = (val, set, ph, mode = 'numeric') => h('input', { class: 'field', style: 'text-align:center', inputMode: mode, value: val ?? '', placeholder: ph, oninput: e => { set(e.target.value); save(); } });
  const intVal = s => (v => v == null ? null : Math.round(v))(parseNum(s));
  if (d.format === 'time') {
    const t = h('input', {
      class: 'field', style: 'text-align:center;font-size:22px', inputMode: 'numeric', value: r.capped ? '' : fmtTime(r.time), placeholder: 'мин:сек, например 432',
      oninput: e => { r.time = parseTime(e.target.value); r.capped = false; save(); },
      onchange: e => { e.target.value = fmtTime(r.time); },
    });
    return h('div', null,
      r.capped ? null : t,
      d.min ? h('label', { class: 'toggle', style: 'margin-top:10px' }, h('span', null, `Не уложился в лимит ${d.min} мин`),
        h('input', { type: 'checkbox', checked: !!r.capped, style: 'width:24px;height:24px', onchange: e => { r.capped = e.target.checked; if (r.capped) { r.time = d.min * 60; r.reps ??= 0; } else r.time = null; save(); render(true); } })) : null,
      r.capped ? h('div', null, h('label', { class: 'f' }, 'Сколько повторов успел'), num(r.reps, v => { r.reps = intVal(v); })) : null);
  }
  if (d.format === 'amrap') return h('div', { class: 'row2' },
    h('div', null, h('label', { class: 'f' }, 'Раунды'), num(r.rounds, v => { r.rounds = intVal(v); })),
    h('div', null, h('label', { class: 'f' }, '+ повторы'), num(r.reps, v => { r.reps = intVal(v); })));
  if (d.format === 'emom') return h('label', { class: 'toggle' }, h('span', null, 'Сделано'),
    h('input', { type: 'checkbox', checked: !!r.done, style: 'width:24px;height:24px', onchange: e => { r.done = e.target.checked; save(); } }));
  r.intervals ??= [];
  const total = h('b');
  const sum = () => { const v = r.intervals.filter(x => x != null); r.total = v.length ? v.reduce((a, b) => a + b, 0) : null; total.textContent = r.total ?? '—'; };
  sum();
  return h('div', null,
    h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px' },
      Array.from({ length: d.rounds }, (_, i) => num(r.intervals[i], v => { r.intervals[i] = intVal(v); sum(); }, `${i + 1}`))),
    h('div', { style: 'margin-top:8px' }, 'Сумма повторов: ', total));
}
