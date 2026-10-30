// Чистые расчёты: разбор чисел, время, рекорды, 1ПМ, блины. Без обращения к экрану — проверяются тестами.

export const FIELDS = {
  w: { label: 'Кг', unit: 'кг', mode: 'decimal' },
  r: { label: 'Повт.', unit: '', mode: 'numeric' },
  d: { label: 'М', unit: 'м', mode: 'numeric' },
  t: { label: 'Время', unit: '', mode: 'numeric' },
};

export const TYPE_FIELDS = { w: ['w', 'r'], bw: ['r'], c: ['d', 't'] };
export const TYPE_NAMES = { w: 'вес', bw: 'свой вес', c: 'кардио' };

// "102,5" → 102.5; пусто или мусор → null
export function parseNum(s) {
  if (s === null || s === undefined) return null;
  const v = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// "1:45", "1.45", "1,45" → 105 с; "145" → 1:45; "45" → 45 с; "4532" → 45:32
export function parseTime(s) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!str) return null;
  const m = str.match(/^(\d+)[:.,](\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  if (!/^\d+$/.test(str)) return null;
  if (str.length <= 2) return +str;
  return +str.slice(0, -2) * 60 + +str.slice(-2);
}

export function fmtTime(sec) {
  if (sec === null || sec === undefined) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtNum(v) {
  if (v === null || v === undefined) return '';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

// Подход одной строкой: "100×5", "10", "500 м — 1:45"
export function fmtSet(s) {
  const parts = [];
  if (s.w != null && s.r != null) parts.push(`${fmtNum(s.w)}×${s.r}`);
  else if (s.w != null) parts.push(`${fmtNum(s.w)} кг`);
  else if (s.r != null) parts.push(String(s.r));
  if (s.d != null) parts.push(`${fmtNum(s.d)} м`);
  if (s.t != null) parts.push(fmtTime(s.t));
  return parts.join(' — ');
}

// Сравнение подходов одного упражнения: >0 — a лучше b.
// Вес: больше вес, при равном — больше повторов. Без веса: больше повторов.
// Кардио: меньшее время на той же дистанции (разные дистанции не сравниваются → 0).
export function compareSets(a, b) {
  if (a.d != null || b.d != null) {
    if (a.d == null || b.d == null || a.d !== b.d || a.t == null || b.t == null) return 0;
    return b.t - a.t;
  }
  const aw = a.w ?? 0, bw = b.w ?? 0;
  if (aw !== bw) return aw - bw;
  return (a.r ?? 0) - (b.r ?? 0);
}

export function isComparable(s) {
  return s.d != null ? s.t != null : s.w != null || s.r != null;
}

// Лучший подход из списка (для кардио — по каждой дистанции отдельно)
export function bestSets(sets) {
  const byKey = new Map();
  for (const s of sets) {
    if (!isComparable(s)) continue;
    const key = s.d != null ? 'd' + s.d : 'x';
    const cur = byKey.get(key);
    if (!cur || compareSets(s, cur) > 0) byKey.set(key, s);
  }
  return [...byKey.values()];
}

// Рекорд у подхода: строго лучше всего, что было раньше (и раньше вообще что-то было)
export function isPR(set, earlier) {
  if (!isComparable(set)) return false;
  let had = false;
  for (const e of earlier) {
    if (!isComparable(e)) continue;
    if (set.d != null && (e.d == null || e.d !== set.d)) continue;
    if (set.d == null && e.d != null) continue;
    had = true;
    if (compareSets(set, e) <= 0) return false;
  }
  return had;
}

// 1ПМ по формуле: вес × (1 + повторы/30); 1 повтор — сам вес. Подходы до 10 повторов.
export function epley(w, r) {
  return r === 1 ? w : w * (1 + r / 30);
}

export function oneRM(sets) {
  let best = null, from = null;
  for (const s of sets) {
    if (s.w == null || s.r == null || s.w <= 0 || s.r < 1 || s.r > 10) continue;
    const v = epley(s.w, s.r);
    if (best === null || v > best) { best = v; from = s; }
  }
  return best === null ? null : { value: Math.round(best * 2) / 2, from };
}

export function roundTo(v, step) {
  return Math.round(v / step) * step;
}

export function percentTable(base, list = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95]) {
  return list.map(p => ({ p, w: roundTo(base * p / 100, 2.5) }));
}

// Блины на каждую сторону, от крупных к мелким, каждого веса сколько нужно
export function plates(target, bar, available) {
  if (target < bar) return { ok: false, tooLight: true, perSide: [], total: bar };
  let rest = Math.round(((target - bar) / 2) * 1000) / 1000;
  const perSide = [];
  for (const p of [...available].sort((a, b) => b - a)) {
    while (rest + 1e-9 >= p) { perSide.push(p); rest = Math.round((rest - p) * 1000) / 1000; }
  }
  const total = bar + 2 * perSide.reduce((a, b) => a + b, 0);
  return { ok: rest < 1e-9, tooLight: false, perSide, total };
}

// Лучший вес на N и более повторов
export function repMaxes(sets, ns = [1, 3, 5, 10]) {
  return ns.map(n => {
    let best = null;
    for (const s of sets) {
      if (s.w == null || s.r == null || s.r < n) continue;
      if (!best || s.w > best.w) best = s;
    }
    return { n, set: best };
  });
}

// Результат комплекса: >0 — a лучше b; null — не сравнивается
export function compareWod(format, a, b) {
  if (format === 'time') {
    if (a.capped || b.capped || a.time == null || b.time == null) return null;
    return b.time - a.time;
  }
  if (format === 'amrap') {
    if (a.rounds == null || b.rounds == null) return null;
    return (a.rounds - b.rounds) || ((a.reps ?? 0) - (b.reps ?? 0));
  }
  if (format === 'int') {
    if (a.total == null || b.total == null) return null;
    return a.total - b.total;
  }
  return null;
}

export function wodHasResult(format, res) {
  if (!res) return false;
  if (format === 'time') return res.time != null;
  if (format === 'amrap') return res.rounds != null;
  if (format === 'int') return res.total != null;
  return !!res.done;
}

export function fmtWodResult(format, res, rx) {
  if (!wodHasResult(format, res)) return '';
  let s;
  if (format === 'time') s = res.capped ? `не уложился, ${res.reps ?? 0} повт.` : fmtTime(res.time);
  else if (format === 'amrap') s = `${res.rounds} + ${res.reps ?? 0}`;
  else if (format === 'int') s = `${res.total} повт.`;
  else s = 'сделано';
  return rx ? s + ' RX' : s;
}

// Даты в виде "2026-10-30" (по местному времени)
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function normalize(s) {
  return s.toLowerCase().replace(/ё/g, 'е');
}
