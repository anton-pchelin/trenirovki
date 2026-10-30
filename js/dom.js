// Построение элементов: h('div', {class:'x', onclick}, 'текст', ребёнок...)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}

// Нижний лист поверх экрана. Возвращает функцию закрытия.
export function sheet(title, build, { onClose } = {}) {
  let bg;
  const close = () => { bg.remove(); onClose?.(); };
  const body = h('main');
  bg = h('div', { class: 'sheet-bg', onclick: e => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'top' }, h('div', { class: 'side' }), h('h1', null, title),
        h('div', { class: 'side r' }, h('button', { class: 'link', onclick: close }, 'Закрыть'))),
      body));
  const fill = () => { body.replaceChildren(h('div', null, build(close, fill))); };
  fill();
  document.body.append(bg);
  return close;
}

// Поделиться файлом (на айфоне — «Сохранить в Файлы», почта и т.п.), иначе — скачать
export async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  return true;
}
