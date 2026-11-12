// Запуск: загрузить данные, открыть нужный экран, запустить общий тик (таймеры) 4 раза в секунду.
import { load, state, save, onSave } from './store.js';
import { reset, go, tick, render } from './router.js';
import { checkRest } from './rest.js';
import { unlockAudio } from './signals.js';
import { activeWorkout } from './queries.js';
import { applyUi } from './ui.js';
import { syncEnabled, pull, schedulePush } from './sync.js';
import './screens.js';
import './item.js';
import './history.js';

// Айфон разрешает звук только из касания; на разных версиях iOS срабатывает разное событие
for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, unlockAudio);

async function boot() {
  try {
    await load();
  } catch (e) {
    document.getElementById('app').textContent = 'Не удалось открыть данные: ' + e.message;
    return;
  }
  applyUi(state.settings);
  if (syncEnabled()) {
    const changed = await pull(); // забрать свежие данные с других устройств
    if (changed) applyUi(state.settings);
  }
  onSave(schedulePush); // без токена ничего не делает
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

// Вернулись в приложение — проверить, не пришли ли свежие данные с другого устройства
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncEnabled())
    pull().then(changed => { if (changed) { applyUi(state.settings); render(true); } });
});

// На своём компьютере (localhost) кэш мешает правкам — включается только с ?sw
const dev = location.hostname === 'localhost' && !location.search.includes('sw');
if ('serviceWorker' in navigator && !dev)
  navigator.serviceWorker.register('sw.js?v=' + window.APP_BUILD).catch(console.error);

window.__dev = { state: () => state, save, render }; // для проверки в браузере
