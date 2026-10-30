// Переходы между экранами: стопка экранов внутри вкладки. Экран — функция, возвращающая
// {title, left?, right?, body, bottom?, tabs?, tick?}; tick вызывается 4 раза в секунду.
import { h } from './dom.js';

const screens = {};
export function register(name, fn) { screens[name] = fn; }

let stack = [{ name: 'calendar', params: {} }];
let current = null;
let scrollKeep = {};

export function go(name, params = {}) {
  remember();
  stack.push({ name, params });
  render();
}
export function back() {
  if (stack.length > 1) stack.pop();
  else stack = [{ name: 'calendar', params: {} }];
  render('back');
}
export function reset(name, params = {}) {
  stack = [{ name, params }];
  render();
}
export function top() { return stack[stack.length - 1]; }

function key(e) { return e.name + JSON.stringify(e.params); }
function remember() {
  const m = document.querySelector('#app main');
  if (m) scrollKeep[key(top())] = m.scrollTop;
}

// keepScroll: true — перерисовать текущий экран, не прыгая наверх; 'back' — вернуть прокрутку после «Назад»
export function render(keepScroll = false) {
  if (keepScroll === true) remember();
  const e = top();
  current = screens[e.name](e.params);
  const app = document.getElementById('app');
  const main = h('main', null, current.body);
  app.replaceChildren(
    h('div', { class: 'top' },
      h('div', { class: 'side' }, current.left ?? h('button', { class: 'link', onclick: back }, '‹ Назад')),
      h('h1', null, current.title ?? ''),
      h('div', { class: 'side r' }, current.right ?? null)),
    main,
    ...[current.bottom && h('div', { class: 'bottom' }, current.bottom), current.tabs].filter(Boolean));
  main.scrollTop = keepScroll ? (scrollKeep[key(e)] ?? 0) : 0;
}

export function tick() { current?.tick?.(); }
