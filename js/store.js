// Хранение: всё состояние одной записью в IndexedDB телефона. Сохраняется после каждого изменения.
import { EXERCISES } from './data-exercises.js';
import { WODS } from './data-wods.js';
import { isoDate } from './calc.js';

const DB = 'trenirovki', STORE = 'kv', KEY = 'state';
export const APP_ID = 'trenirovki';
export const VERSION = 1;

export const DEFAULT_SETTINGS = {
  restOn: false, restSec: 120, bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export function emptyState() {
  return {
    version: VERSION,
    workouts: [],          // {id, date, created, finished, items:[...]}
    customExercises: [],   // {id, name, cat, type}
    customWods: [],        // как в data-wods.js
    favorites: [], recent: [],
    settings: { ...DEFAULT_SETTINGS },
    oneRM: {},             // exId → ручной 1ПМ
    lastBackup: null,
    activeId: null,
  };
}

export let state = emptyState();

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbp;
function db() { return (dbp ??= openDb()); }

export async function load() {
  const d = await db();
  const v = await new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  state = v ? { ...emptyState(), ...v, settings: { ...DEFAULT_SETTINGS, ...v.settings } } : emptyState();
  navigator.storage?.persist?.();
  return state;
}

let saving = Promise.resolve();
export function save() {
  const snapshot = JSON.parse(JSON.stringify(state));
  saving = saving.then(async () => {
    const d = await db();
    await new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(snapshot, KEY);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }).catch(e => { console.error(e); alert('Не удалось сохранить данные: ' + e.message); });
  return saving;
}

export function replaceState(next) {
  state = { ...emptyState(), ...next, settings: { ...DEFAULT_SETTINGS, ...next.settings } };
  return save();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Справочники
export function allExercises() { return [...EXERCISES, ...state.customExercises]; }
export function allWods() { return [...WODS, ...state.customWods]; }
export function exById(id) { return allExercises().find(e => e.id === id); }
export function wodById(id) { return allWods().find(w => w.id === id); }

export function workoutById(id) { return state.workouts.find(w => w.id === id); }

// Тренировки по порядку: дата, затем время создания
export function sortedWorkouts() {
  return [...state.workouts].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
}

export function before(w, other) {
  return other.date < w.date || (other.date === w.date && other.created < w.created);
}

export function newWorkout(date = isoDate()) {
  const w = { id: uid(), date, created: Date.now(), finished: false, items: [] };
  state.workouts.push(w);
  return w;
}

export function touchRecent(id) {
  state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 8);
}
