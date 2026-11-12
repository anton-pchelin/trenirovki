// Оформление: применяет настройки интерфейса (тема, цвет, шрифт, плотность) к странице.
export function applyUi(s) {
  const r = document.documentElement;
  r.dataset.theme = s.theme ?? 'auto';
  r.dataset.accent = s.accent ?? 'blue';
  r.dataset.font = s.font ?? 'm';
  r.dataset.density = s.density ?? 'normal';
}
