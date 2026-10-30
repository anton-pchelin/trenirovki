// Таймер отдыха: запускается после ✓, если включён в настройках. Конец хранится как время по часам.
import { h } from './dom.js';
import { state, save } from './store.js';
import { fmtTime } from './calc.js';
import { beep, keepAwake } from './signals.js';

export function startRest() {
  if (!state.settings.restOn) return;
  state.rest = { end: Date.now() + state.settings.restSec * 1000 };
  keepAwake(true);
  save();
}

export function stopRest() {
  state.rest = null;
  keepAwake(false);
  save();
}

// Вызывается каждые 250 мс из общего тика
export function checkRest() {
  if (state.rest && Date.now() >= state.rest.end) {
    const late = Date.now() - state.rest.end;
    stopRest();
    if (late < 3000) beep(3);
  }
}

// Плашка «Отдых 1:42»; update() обновляет цифры без перерисовки экрана
export function restBar(onChange) {
  const big = h('div', { class: 'big' });
  const el = h('div', { class: 'restbar' },
    h('span', null, 'Отдых'), big,
    h('button', { onclick: () => { state.rest.end += 30000; save(); update(); } }, '+30 с'),
    h('button', { onclick: () => { stopRest(); onChange?.(); } }, 'Пропустить'));
  function update() {
    if (!state.rest) { el.style.display = 'none'; return; }
    el.style.display = '';
    big.textContent = fmtTime(Math.max(0, (state.rest.end - Date.now()) / 1000));
  }
  update();
  return { el, update };
}
