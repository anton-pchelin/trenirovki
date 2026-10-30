// Работа без интернета: все файлы приложения лежат в кэше телефона.
// Версия приходит из index.html (APP_BUILD) — новая версия = новый кэш.
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'trenirovki-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/calc.js', 'js/clock.js', 'js/data-exercises.js', 'js/data-wods.js', 'js/dom.js', 'js/export.js',
  'js/history.js', 'js/item.js', 'js/picker.js', 'js/queries.js', 'js/rest.js', 'js/router.js', 'js/screens.js',
  'js/signals.js', 'js/store.js', 'js/workout.js', 'js/xlsx.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(ASSETS.map(a => fetch(a, { cache: 'reload' }).then(r => { if (!r.ok) throw new Error(a); return c.put(a, r); }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('trenirovki-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Страница — сначала из сети (чтобы узнать о новой версии), но не дольше 3 с; иначе из кэша
    e.respondWith(Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(rej, 3000)),
    ]).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
