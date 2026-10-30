// Выбор упражнения или комплекса: поиск, недавние, избранное, категории, «своё».
import { h, sheet } from './dom.js';
import { state, save, uid, allExercises, allWods, exById, wodById } from './store.js';
import { CATEGORIES } from './data-exercises.js';
import { WOD_CATEGORIES, FORMAT_NAMES, formatLine } from './data-wods.js';
import { TYPE_NAMES, normalize, parseNum } from './calc.js';

// entry: {kind:'ex'|'wod', id}
const entryOf = x => ({ kind: x.format ? 'wod' : 'ex', id: x.id });
const byKey = k => k.startsWith('wod-') || k.startsWith('mywod-') ? wodById(k) : exById(k);

export function pickerView(onPick) {
  let q = '', cat = null;
  const list = h('div');
  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'Поиск: присед, фран…', autocomplete: 'off',
    oninput: e => { q = e.target.value; draw(); },
  });

  function row(x) {
    const fav = state.favorites.includes(x.id);
    return h('div', null,
      h('button', { style: 'flex:1;text-align:left', onclick: () => onPick(entryOf(x)) },
        h('div', null, x.name),
        h('div', { class: 'muted small' }, x.format ? `${x.cat} · ${formatLine(x)}` : `${x.cat} · ${TYPE_NAMES[x.type]}`)),
      h('button', {
        'aria-label': fav ? 'Убрать из избранного' : 'В избранное', style: 'font-size:22px;padding:0 4px',
        class: fav ? 'pr' : 'muted',
        onclick: () => {
          state.favorites = fav ? state.favorites.filter(i => i !== x.id) : [...state.favorites, x.id];
          save(); draw();
        },
      }, fav ? '★' : '☆'));
  }
  const block = (title, items) => items.length ? [h('div', { class: 'section' }, title), h('div', { class: 'list' }, items.map(row))] : [];

  function draw() {
    const nq = normalize(q.trim());
    let content;
    if (nq) {
      const words = nq.split(/\s+/);
      const found = [...allExercises(), ...allWods()].filter(x => words.every(w => normalize(x.name).includes(w)))
        .sort((a, b) => (normalize(b.name).startsWith(nq) - normalize(a.name).startsWith(nq)) || a.name.length - b.name.length);
      content = found.length ? block('Найдено', found.slice(0, 60)) : [h('div', { class: 'empty' }, 'Ничего не нашлось — создайте своё ниже')];
    } else {
      const cats = [...CATEGORIES, 'Свои упражнения', 'Комплексы'];
      content = [
        ...block('Недавние', state.recent.map(byKey).filter(Boolean)),
        ...block('Избранное ★', state.favorites.map(byKey).filter(Boolean)),
        h('div', { class: 'section' }, 'Категории'),
        h('div', null, cats.map(c => h('button', { class: 'chip' + (cat === c ? ' on' : ''), onclick: () => { cat = cat === c ? null : c; draw(); } }, c))),
      ];
      if (cat === 'Комплексы') for (const wc of [...WOD_CATEGORIES, 'Свои']) content.push(...block(wc, allWods().filter(w => w.cat === wc)));
      else if (cat === 'Свои упражнения') content.push(...block(cat, state.customExercises));
      else if (cat) content.push(...block(cat, allExercises().filter(e => e.cat === cat)));
    }
    list.replaceChildren(...content,
      h('div', { style: 'margin-top:16px' },
        h('button', { class: 'btn sec', onclick: () => customExercise(q, onPick) }, '+ Своё упражнение'),
        h('button', { class: 'btn sec', onclick: () => customWod(q, onPick) }, '+ Свой комплекс')));
  }
  draw();
  return [search, list];
}

export function openPicker(onPick) {
  const close = sheet('Добавить', () => pickerView(e => { close(); onPick(e); }));
}

function chips(options, get, set) {
  const box = h('div');
  const draw = () => box.replaceChildren(...Object.entries(options).map(([k, v]) =>
    h('button', { class: 'chip' + (get() === k ? ' on' : ''), onclick: () => { set(k); draw(); } }, v)));
  draw();
  return box;
}

function customExercise(name, onPick) {
  let type = 'w';
  const nameIn = h('input', { class: 'field', value: name, placeholder: 'Например: Тяга санок' });
  const catSel = h('select', { class: 'field' }, [...CATEGORIES].map(c => h('option', { value: c }, c)));
  const close = sheet('Своё упражнение', () => [
    h('label', { class: 'f' }, 'Название'), nameIn,
    h('label', { class: 'f' }, 'Что записывать'),
    chips({ w: 'Вес и повторы', bw: 'Повторы', c: 'Дистанция и время' }, () => type, v => { type = v; }),
    h('label', { class: 'f' }, 'Категория'), catSel,
    h('div', { style: 'margin-top:16px' }, h('button', {
      class: 'btn', onclick: () => {
        const n = nameIn.value.trim();
        if (!n) { nameIn.classList.add('bad'); nameIn.focus(); return; }
        const ex = { id: 'my-' + uid(), name: n, cat: catSel.value, type };
        state.customExercises.push(ex);
        save(); close(); onPick({ kind: 'ex', id: ex.id });
      },
    }, 'Сохранить')),
  ]);
}

function customWod(name, onPick) {
  const d = { format: 'time', min: '', work: 20, rest: 10, rounds: 8 };
  const nameIn = h('input', { class: 'field', value: name, placeholder: 'Например: Пятничный' });
  const lines = h('textarea', { placeholder: '21-15-9\nТрастеры 43 кг\nПодтягивания', style: 'min-height:110px' });
  const rx = h('input', { class: 'field', inputMode: 'decimal', placeholder: 'кг, если есть' });
  const params = h('div');
  const num = (k, label) => [h('label', { class: 'f' }, label),
    h('input', { class: 'field', inputMode: 'numeric', value: d[k], oninput: e => { d[k] = e.target.value; } })];
  const drawParams = () => params.replaceChildren(...(
    d.format === 'time' ? num('min', 'Лимит, мин (можно пусто)') :
    d.format === 'int' ? [...num('work', 'Работа, с'), ...num('rest', 'Отдых, с'), ...num('rounds', 'Интервалов')] :
    num('min', 'Минут')));
  drawParams();
  const close = sheet('Свой комплекс', () => [
    h('label', { class: 'f' }, 'Название'), nameIn,
    h('label', { class: 'f' }, 'Формат'),
    chips(FORMAT_NAMES, () => d.format, v => { d.format = v; drawParams(); }),
    params,
    h('label', { class: 'f' }, 'Движения (каждое с новой строки)'), lines,
    h('label', { class: 'f' }, 'Вес RX'), rx,
    h('div', { style: 'margin-top:16px' }, h('button', {
      class: 'btn', onclick: () => {
        const n = nameIn.value.trim();
        if (!n) { nameIn.classList.add('bad'); nameIn.focus(); return; }
        const w = { id: 'mywod-' + uid(), name: n, cat: 'Свои', format: d.format, lines: lines.value.split('\n').map(s => s.trim()).filter(Boolean) };
        const int = v => Math.max(1, Math.round(parseNum(v) ?? 0));
        if (d.format === 'int') Object.assign(w, { work: int(d.work), rest: Math.round(parseNum(d.rest) ?? 0), rounds: int(d.rounds) });
        else if (d.format !== 'time' || parseNum(d.min)) w.min = int(d.min || 20);
        const rxv = parseNum(rx.value);
        if (rxv) w.rx = rxv;
        state.customWods.push(w);
        save(); close(); onPick({ kind: 'wod', id: w.id });
      },
    }, 'Сохранить')),
  ]);
}
