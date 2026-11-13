// Экран упражнения (подходы) и экран комплекса (таймер и итог).
import { h, sheet } from './dom.js';
import { register, go, back, render } from './router.js';
import { state, save, exById, workoutById } from './store.js';
import { FIELDS, parseNum, parseTime, fmtNum, fmtTime, fmtSet, oneRM, percentTable, plates, wodHasResult, fmtWodResult, weightForReps, repsForWeight } from './calc.js';
import { lastTime, prFlags, allDoneSets, wodIsPR, lastWod } from './queries.js';
import { startRest, restBar } from './rest.js';
import { beep, unlockAudio, keepAwake } from './signals.js';
import { wodClock, COUNTDOWN } from './clock.js';
import { formatLine } from './data-wods.js';
import { joinSuperset, leaveSuperset } from './workout.js';

// Строка управления суперсетом: объединить с предыдущим пунктом или выйти из группы
function ssRow(w, it) {
  if (it.ss) return h('div', { style: 'margin:-2px 0 10px' },
    h('button', { class: 'link', onclick: () => { leaveSuperset(w, it); render(true); } }, '⛓ Убрать из суперсета'));
  const i = w.items.findIndex(x => x.id === it.id);
  if (i < 1) return null;
  return h('div', { style: 'margin:-2px 0 10px' },
    h('button', { class: 'link', onclick: () => { joinSuperset(w, it); render(true); } }, '🔗 Объединить с предыдущим в суперсет'));
}

register('item', ({ wid, iid }) => {
  const w = workoutById(wid), it = w?.items.find(i => i.id === iid);
  if (!it) { setTimeout(back); return { title: '', body: [] }; }
  if (it.kind === 'ex') return exerciseScreen(w, it);
  if (it.kind === 'task') return taskScreen(w, it);
  return wodScreen(w, it);
});

const fmtField = (f, v) => v == null ? '' : f === 't' ? fmtTime(v) : fmtNum(v);
const parseField = (f, s) => f === 't' ? parseTime(s) : f === 'r' || f === 'd' ? (v => v == null ? null : Math.round(v))(parseNum(s)) : parseNum(s);

function removeItem(w, it) {
  if (!confirm('Убрать из тренировки?')) return;
  const ss = it.ss;
  w.items = w.items.filter(x => x.id !== it.id);
  if (ss) { // в суперсете не должно остаться одного пункта
    const rest = w.items.filter(x => x.ss === ss);
    if (rest.length === 1) { rest[0].ss = null; delete rest[0].ss; }
  }
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
      h('label', { class: 'toggle', style: 'margin-bottom:10px' }, h('span', null, 'Выполнено'),
        h('input', { type: 'checkbox', checked: !!it.done, style: 'width:24px;height:24px', onchange: e => { it.done = e.target.checked; save(); } })),
      ssRow(w, it),
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
      hasW ? h('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => suggestSheet(it.exId, it) }, '🎯 Подбор веса и повторов') : null,
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

// Живой подбор: вводите повторы — считается вес; вводите вес — считаются повторы (от 1ПМ)
function suggestSheet(exId, it) {
  const auto = oneRM(allDoneSets(exId));
  let base = state.oneRM[exId] ?? auto?.value ?? null;
  let reps = 5, wg = base ? weightForReps(base, reps) : null;
  sheet('Подбор веса и повторов', (close) => {
    const result = h('div', { class: 'clock', style: 'font-size:44px;margin:8px 0' });
    const apply = h('button', { class: 'btn' });
    const wIn = h('input', { class: 'field', inputMode: 'decimal', style: 'width:120px;text-align:center;font-size:20px', value: wg ? fmtNum(wg) : '', placeholder: 'кг' });
    const rIn = h('input', { class: 'field', inputMode: 'numeric', style: 'width:120px;text-align:center;font-size:20px', value: reps });
    const update = () => {
      const ok = base && wg && reps;
      result.textContent = ok ? `${fmtNum(wg)} кг × ${reps}` : '—';
      apply.textContent = ok ? `Вписать подход ${fmtNum(wg)}×${reps}` : 'Вписать подход';
      apply.style.opacity = ok ? 1 : 0.4;
    };
    rIn.oninput = e => {
      const v = parseNum(e.target.value);
      if (v && v >= 1 && v <= 30) {
        reps = Math.round(v);
        if (base) { wg = weightForReps(base, reps); wIn.value = fmtNum(wg); }
      }
      update();
    };
    wIn.oninput = e => {
      const v = parseNum(e.target.value);
      wg = v;
      if (base && v) { const r = repsForWeight(base, v); if (r) { reps = r; rIn.value = r; } }
      update();
    };
    apply.onclick = () => { if (base && wg && reps) { it.sets.push({ w: wg, r: reps, done: false }); save(); close(); render(true); } };
    update();
    const rmIn = h('input', {
      class: 'field', inputMode: 'decimal', style: 'width:120px;text-align:center', placeholder: 'кг',
      oninput: e => {
        const v = parseNum(e.target.value);
        if (v) { state.oneRM[exId] = v; base = v; save(); wg = weightForReps(base, reps); wIn.value = fmtNum(wg); update(); }
      },
    });
    return [
      h('div', { class: 'toggle' },
        h('div', null, h('label', { class: 'f', style: 'margin-top:0' }, 'Повторы'), rIn),
        h('div', { style: 'font-size:24px;color:var(--muted);padding-top:22px' }, '×'),
        h('div', null, h('label', { class: 'f', style: 'margin-top:0' }, 'Вес, кг'), wIn)),
      base ? h('div', { class: 'muted small', style: 'margin:8px 0' },
        `От 1ПМ ${fmtNum(base)} кг (${state.oneRM[exId] != null ? 'задан вручную' : 'по формуле из ' + fmtSet(auto.from)})`)
        : h('div', null,
          h('div', { class: 'muted', style: 'margin:8px 0 4px' }, 'Пока не от чего считать. Впишите свой 1ПМ (максимум на 1 повтор) — дальше всё посчитается само:'),
          h('div', { class: 'toggle' }, h('span', null, 'Ваш 1ПМ'), rmIn)),
      result,
      apply,
      h('div', { class: 'muted small center', style: 'margin-top:8px' }, 'Подход вписывается как черновик — поправьте цифры на фактические и отметьте ✓'),
    ];
  });
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
    h('label', { class: 'toggle', style: 'margin-bottom:10px' }, h('span', null, 'Выполнено'),
      h('input', { type: 'checkbox', checked: !!it.done, style: 'width:24px;height:24px', onchange: e => { it.done = e.target.checked; save(); } })),
    ssRow(w, it),
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

// ── Свободное задание текстом ──
// {kind:'task', text, mode:'none'|'time'|'sets'|'times', time, sets:[{w,r,done}], times:[сек]}
const TASK_MODES = { none: 'Только текст', time: 'Время', sets: 'Подходы', times: 'Интервалы' };

function taskScreen(w, it) {
  it.mode ??= 'none'; it.sets ??= []; it.times ??= [];
  let editor = null;
  if (it.mode === 'time') {
    editor = h('div', { class: 'toggle', style: 'margin-top:10px' }, h('span', null, 'Время (мин:сек)'),
      h('input', {
        class: 'field', style: 'width:110px;text-align:center', inputMode: 'numeric', value: fmtTime(it.time), placeholder: '0:00',
        oninput: e => { it.time = parseTime(e.target.value); save(); },
        onchange: e => { e.target.value = fmtTime(it.time); },
      }));
  } else if (it.mode === 'sets') {
    const rows = it.sets.map((s, i) => h('tr', { class: s.done ? 'done' : '' },
      h('td', { class: 'n', onclick: () => { if (confirm(`Удалить подход ${i + 1}?`)) { it.sets.splice(i, 1); save(); render(true); } } }, i + 1),
      h('td', null, h('input', { inputMode: 'decimal', value: fmtNum(s.w), placeholder: 'кг', 'aria-label': 'Кг', oninput: e => { s.w = parseNum(e.target.value); save(); } })),
      h('td', null, h('input', { inputMode: 'numeric', value: s.r ?? '', placeholder: 'повт.', 'aria-label': 'Повт.', oninput: e => { const v = parseNum(e.target.value); s.r = v == null ? null : Math.round(v); save(); } })),
      h('td', { style: 'width:50px' }, h('button', {
        class: 'ok' + (s.done ? ' on' : ''), 'aria-label': 'Подход сделан',
        onclick: () => { s.done = !s.done; save(); if (s.done) startRest(); render(true); },
      }, '✓'))));
    editor = h('div', null,
      it.sets.length ? h('table', { class: 'sets' },
        h('thead', null, h('tr', null, h('th', { class: 'n' }, '№'), h('th', null, 'Кг'), h('th', null, 'Повт.'), h('th'))),
        h('tbody', null, rows)) : h('div', { class: 'empty' }, 'Подходов нет'),
      h('button', { class: 'btn sec', style: 'margin-top:10px', onclick: () => { it.sets.push({ done: false }); save(); render(true); } }, '+ Подход'));
  } else if (it.mode === 'times') {
    editor = h('div', null,
      it.times.map((t, i) => h('div', { class: 'toggle', style: 'margin-top:8px;gap:10px' },
        h('span', { class: 'muted' }, `${i + 1}`),
        h('input', {
          class: 'field', style: 'flex:1;text-align:center', inputMode: 'numeric', value: fmtTime(t), placeholder: 'мин:сек',
          oninput: e => { it.times[i] = parseTime(e.target.value); save(); },
          onchange: e => { e.target.value = fmtTime(it.times[i]); },
        }),
        h('button', { class: 'link', onclick: () => { it.times.splice(i, 1); save(); render(true); } }, '✕'))),
      h('button', { class: 'btn sec', style: 'margin-top:10px', onclick: () => { it.times.push(null); save(); render(true); } }, '+ Интервал'));
  }
  const rb = restBar(() => render(true));
  return {
    title: 'Задание',
    body: [
      w.id === state.activeId ? rb.el : null,
      h('label', { class: 'toggle', style: 'margin-bottom:10px' }, h('span', null, 'Выполнено'),
        h('input', { type: 'checkbox', checked: !!it.done, style: 'width:24px;height:24px', onchange: e => { it.done = e.target.checked; save(); } })),
      ssRow(w, it),
      h('label', { class: 'f' }, 'Текст задания'),
      h('textarea', {
        value: it.text ?? '', style: 'min-height:110px', placeholder: 'Например: 3 раунда — 10 бёрпи, 15 махов гирей…',
        oninput: e => { it.text = e.target.value; save(); },
      }),
      h('label', { class: 'f' }, 'Что записать'),
      h('div', null, Object.entries(TASK_MODES).map(([k, v]) =>
        h('button', { class: 'chip' + (it.mode === k ? ' on' : ''), onclick: () => { it.mode = k; save(); render(true); } }, v))),
      editor,
      h('button', { class: 'btn danger', style: 'margin-top:16px', onclick: () => removeItem(w, it) }, 'Убрать из тренировки'),
    ],
    tick: rb.update,
  };
}
