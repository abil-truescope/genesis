// Общие элементы интерфейса: иконки, уведомления, модальные окна.

import { escapeHtml } from './util.js';

const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5v11h14v-11M10 12.5h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  voice: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  folder: '<path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  why: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8v.2"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  flip: '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 7 4 17h5zM15 7l5 10h-5z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  logout: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10"/>',
  shield: '<path d="M12 3.5 19 6v6c0 4.3-3 7.4-7 8.5-4-1.1-7-4.2-7-8.5V6z"/><path d="m9 12 2.2 2.2L15 10.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
};

export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- уведомления ----------
export function toast(text, kind = 'info', ms = 3200) {
  let root = document.getElementById('toasts');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toasts';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `${icon(kind === 'error' ? 'close' : 'check', 16)}<span>${escapeHtml(text)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- модальные окна ----------
export function modal({ title = '', body = '', actions = [], dismissible = true, wide = false, onMount } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        ${dismissible ? `<button class="icon-btn modal-x" data-act="__close" aria-label="Закрыть">${icon('close')}</button>` : ''}
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-act="${i}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = (val) => {
      wrap.classList.remove('in');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 220);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const a = b.dataset.act;
        if (a === '__close') return close(null);
        const act = actions[+a];
        if (act.validate && !act.validate(wrap)) return;
        return close(act.value ?? +a);
      }
      if (e.target === wrap && dismissible) close(null);
    });
    if (onMount) onMount(wrap, close);
    // фокус на кнопку, только если окно само не поставило его в поле ввода
    setTimeout(() => { if (!wrap.contains(document.activeElement)) wrap.querySelector('.modal-actions .btn.primary, .modal-actions .btn')?.focus(); }, 50);
  });
}

export async function confirmModal(title, text, okLabel = 'Удалить', kind = 'danger') {
  const r = await modal({
    title,
    body: `<p>${escapeHtml(text)}</p>`,
    actions: [{ label: 'Отмена', value: false }, { label: okLabel, kind, value: true }],
  });
  return r === true;
}

// Плавное появление элементов списком
export function stagger(root, sel = '[data-stagger]') {
  root.querySelectorAll(sel).forEach((el, i) => el.style.setProperty('--i', i));
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function longDate(d) {
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
