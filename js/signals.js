// Сигналы таймеров: звук, вспышка экрана, «экран не гаснет». Вибрации у веб-приложений на айфоне нет.

let ctx;
// Звук на айфоне разрешён только после касания — «будим» его на первом нажатии
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* без звука останется вспышка */ }
}

export function beep(times = 1, freq = 880, ms = 180) {
  flash();
  if (!ctx) return;
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const t0 = ctx.currentTime + i * (ms + 120) / 1000;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + ms / 1000 + 0.02);
  }
}

export function flash() {
  const el = document.getElementById('flash');
  if (!el) return;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

let lock = null, wanted = false;
export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && !lock && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}
// После сворачивания айфон снимает блокировку — возвращаем
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) keepAwake(true);
});
