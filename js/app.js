// Запуск: загрузить данные, открыть нужный экран, запустить общий тик (таймеры) 4 раза в секунду.
import { load, state, save } from './store.js';
import { reset, go, tick, render } from './router.js';
import { checkRest } from './rest.js';
import { unlockAudio } from './signals.js';
import { activeWorkout } from './queries.js';
import './screens.js';
import './item.js';
import './history.js';

document.addEventListener('pointerdown', unlockAudio);

async function boot() {
  try {
    await load();
  } catch (e) {
    document.getElementById('app').textContent = 'Не удалось открыть данные: ' + e.message;
    return;
  }
  reset('calendar');
  const a = activeWorkout();
  if (a) {
    go('workout', { id: a.id });
    const running = a.items.find(it => it.kind === 'wod' && it.timer && !it.timer.stopped);
    if (running) go('item', { wid: a.id, iid: running.id });
  }
  setInterval(() => { checkRest(); tick(); }, 250);
}

boot();

// На своём компьютере (localhost) кэш мешает правкам — включается только с ?sw
const dev = location.hostname === 'localhost' && !location.search.includes('sw');
if ('serviceWorker' in navigator && !dev)
  navigator.serviceWorker.register('sw.js?v=' + window.APP_BUILD).catch(console.error);

window.__dev = { state: () => state, save, render }; // для проверки в браузере
