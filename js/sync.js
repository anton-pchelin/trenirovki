// Синхронизация между устройствами через скрытый gist на GitHub пользователя.
// Токен хранится только на этом устройстве (localStorage), в данные не попадает.
// Правило простое: чьи данные новее (savedAt), те и побеждают.
import { state, save, replaceState, APP_ID, VERSION } from './store.js';

const FILE = 'trenirovki.json';
const DESC = 'trenirovki-sync';
const LS_TOKEN = 'trenirovki-sync-token';
const LS_GIST = 'trenirovki-sync-gist';
const LS_STATUS = 'trenirovki-sync-status';

let token = localStorage.getItem(LS_TOKEN) || null;
let gistId = localStorage.getItem(LS_GIST) || null;
let syncing = false;

export function syncEnabled() { return !!token; }

export function syncStatus() {
  try { return JSON.parse(localStorage.getItem(LS_STATUS)) || null; } catch { return null; }
}
function setStatus(s) {
  localStorage.setItem(LS_STATUS, JSON.stringify({ ...s, at: Date.now() }));
}

// Проверить токен и запомнить его на этом устройстве
export async function enableSync(t) {
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('Токен не подошёл (код ' + r.status + ')');
  token = t;
  localStorage.setItem(LS_TOKEN, t);
}

export function disableSync() {
  token = null; gistId = null;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_GIST);
  localStorage.removeItem(LS_STATUS);
}

async function api(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error('GitHub ответил ошибкой ' + r.status);
  return r;
}

async function findGist() {
  if (gistId) return gistId;
  const gists = await (await api('/gists?per_page=100')).json();
  const g = Array.isArray(gists) ? gists.find(x => x.files && x.files[FILE]) : null;
  if (g) { gistId = g.id; localStorage.setItem(LS_GIST, gistId); }
  return gistId;
}

// Забрать данные с GitHub, если там новее. true — данные заменены.
export async function pull() {
  if (!token || syncing) return false;
  try {
    const id = await findGist();
    if (!id) { setStatus({ ok: true }); return false; }
    const g = await (await api('/gists/' + id)).json();
    const content = g.files?.[FILE]?.content;
    if (!content) return false;
    let obj;
    try { obj = JSON.parse(content); } catch { return false; }
    if (obj.app !== APP_ID || !obj.data || !Array.isArray(obj.data.workouts)) return false;
    if ((obj.savedAt ?? 0) > (state.changedAt ?? 0)) {
      syncing = true;
      try { await replaceState(obj.data); } finally { syncing = false; }
      setStatus({ ok: true });
      return true;
    }
    setStatus({ ok: true });
    return false;
  } catch (e) {
    console.error(e);
    setStatus({ ok: false, error: e.message });
    return false;
  }
}

let timer = null;
// Отправить изменения на GitHub через 2 с после последнего сохранения
export function schedulePush() {
  if (!token || syncing) return;
  clearTimeout(timer);
  timer = setTimeout(() => { push().catch(console.error); }, 2000);
}

export async function push() {
  if (!token || syncing) return;
  try {
    const body = JSON.stringify({
      description: DESC,
      public: false,
      files: { [FILE]: { content: JSON.stringify({ app: APP_ID, version: VERSION, savedAt: state.changedAt ?? Date.now(), data: state }) } },
    });
    const id = await findGist();
    const g = await (id
      ? await api('/gists/' + id, { method: 'PATCH', body })
      : await api('/gists', { method: 'POST', body })).json();
    if (g.id && g.id !== gistId) { gistId = g.id; localStorage.setItem(LS_GIST, gistId); }
    setStatus({ ok: true });
  } catch (e) {
    console.error(e);
    setStatus({ ok: false, error: e.message });
  }
}

// Забрать свежее, затем отправить своё (кнопка «Синхронизировать сейчас»)
export async function syncNow() {
  const changed = await pull();
  await push();
  return changed;
}
