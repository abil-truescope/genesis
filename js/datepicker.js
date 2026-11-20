// Календарь в стиле дневника вместо системного <input type="date">.
// Быстрые кнопки «Сегодня / Вчера / Позавчера», сетка месяца с точками на
// уже записанных днях, будущие даты недоступны, управление с клавиатуры.

import { icon } from './ui.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WD_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };

export function humanDate(s) {
  const d = parse(s);
  const today = iso(new Date());
  const rel = s === today ? 'Сегодня' : s === addDays(today, -1) ? 'Вчера' : s === addDays(today, -2) ? 'Позавчера' : '';
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  const main = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${y}`;
  return { rel, main, wd: WD_LONG[d.getDay()] };
}

/**
 * mount — элемент-контейнер; opts: { value, max, marked: Set<string>, onChange(iso) }
 */
export function datePicker(mount, { value, max, marked = new Set(), onChange = () => {} }) {
  let val = value;
  let view = parse(val); view.setDate(1);
  const today = iso(new Date());
  max = max || today;

  mount.classList.add('dp');
  mount.innerHTML = `
    <div class="dp-quick" role="group" aria-label="Быстрый выбор даты"></div>
    <button type="button" class="dp-field" aria-haspopup="dialog" aria-expanded="false">
      <span class="dp-ic">${icon('calendar', 18)}</span>
      <span class="dp-text"></span>
      <span class="dp-caret">${icon('right', 15)}</span>
    </button>
    <div class="dp-pop" role="dialog" aria-label="Выбор даты" hidden>
      <div class="dp-head">
        <button type="button" class="icon-btn sm dp-prev" aria-label="Предыдущий месяц">${icon('left', 16)}</button>
        <div class="dp-title"><select class="dp-m" aria-label="Месяц"></select><select class="dp-y" aria-label="Год"></select></div>
        <button type="button" class="icon-btn sm dp-next" aria-label="Следующий месяц">${icon('right', 16)}</button>
      </div>
      <div class="dp-wd">${WD.map((w, i) => `<span class="${i > 4 ? 'we' : ''}">${w}</span>`).join('')}</div>
      <div class="dp-grid" role="grid"></div>
      <div class="dp-foot"><span class="dp-legend"><i></i>уже записан</span><button type="button" class="btn sm dp-today">Сегодня</button></div>
    </div>`;

  const field = mount.querySelector('.dp-field');
  const pop = mount.querySelector('.dp-pop');
  const grid = mount.querySelector('.dp-grid');
  const selM = mount.querySelector('.dp-m');
  const selY = mount.querySelector('.dp-y');
  const quick = mount.querySelector('.dp-quick');
  const maxD = parse(max);

  const years = [];
  for (let y = maxD.getFullYear(); y >= maxD.getFullYear() - 15; y--) years.push(y);
  selY.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');

  const set = (s, close = true) => {
    if (s > max) return;
    val = s;
    view = parse(s); view.setDate(1);
    paint();
    onChange(s);
    if (close) toggle(false);
  };

  function paintField() {
    const h = humanDate(val);
    mount.querySelector('.dp-text').innerHTML = `${h.rel ? `<b>${h.rel}</b><span class="dp-sep">·</span>` : ''}<span>${h.main}</span><small>${h.wd}</small>`;
    const qs = [[today, 'Сегодня'], [addDays(today, -1), 'Вчера'], [addDays(today, -2), 'Позавчера']];
    quick.innerHTML = qs.map(([d, l]) => `<button type="button" class="chip ${d === val ? 'on' : ''}" data-d="${d}">${l}${marked.has(d) ? '<i class="dp-dot"></i>' : ''}</button>`).join('')
      + `<button type="button" class="chip dp-other ${qs.some(([d]) => d === val) ? '' : 'on'}">Другой день…</button>`;
  }

  function paintGrid() {
    const y = view.getFullYear(), m = view.getMonth();
    selM.innerHTML = MONTHS.map((n, i) => `<option value="${i}" ${i === m ? 'selected' : ''} ${y === maxD.getFullYear() && i > maxD.getMonth() ? 'disabled' : ''}>${n}</option>`).join('');
    selY.value = y;
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const s = `${y}-${pad(m + 1)}-${pad(d)}`;
      const wd = (first + d - 1) % 7;
      const cls = [s === val && 'sel', s === today && 'now', marked.has(s) && 'has', wd > 4 && 'we'].filter(Boolean).join(' ');
      html += `<button type="button" role="gridcell" data-d="${s}" class="${cls}" ${s > max ? 'disabled' : ''} tabindex="${s === val ? 0 : -1}" aria-selected="${s === val}" aria-label="${d} ${MONTHS_GEN[m]}${marked.has(s) ? ', уже записан' : ''}">${d}</button>`;
    }
    grid.innerHTML = html;
    const next = new Date(y, m + 1, 1);
    mount.querySelector('.dp-next').disabled = next > maxD;
  }

  function paint() { paintField(); paintGrid(); }

  function toggle(open = pop.hidden) {
    pop.hidden = !open;
    field.setAttribute('aria-expanded', open);
    mount.classList.toggle('open', open);
    if (open) {
      view = parse(val); view.setDate(1); paintGrid();
      setTimeout(() => grid.querySelector('.sel, [tabindex="0"]')?.focus(), 30);
      document.addEventListener('pointerdown', outside, true);
    } else {
      document.removeEventListener('pointerdown', outside, true);
    }
  }
  const outside = (e) => { if (!mount.contains(e.target)) toggle(false); };

  field.onclick = () => toggle();
  quick.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('dp-other')) return toggle(true);
    set(b.dataset.d);
  };
  grid.onclick = (e) => { const b = e.target.closest('[data-d]'); if (b && !b.disabled) set(b.dataset.d); };
  mount.querySelector('.dp-prev').onclick = () => { view.setMonth(view.getMonth() - 1); paintGrid(); };
  mount.querySelector('.dp-next').onclick = () => { view.setMonth(view.getMonth() + 1); paintGrid(); };
  mount.querySelector('.dp-today').onclick = () => set(today);
  selM.onchange = () => { view.setMonth(+selM.value); paintGrid(); };
  selY.onchange = () => {
    view.setFullYear(+selY.value);
    if (view > maxD) view = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
    paintGrid();
  };
  // клавиатура: стрелки по дням, PageUp/PageDown по месяцам, Esc закрыть
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); toggle(false); field.focus(); return; }
    const cur = document.activeElement?.dataset?.d;
    if (!cur) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let n = null;
    if (step) n = addDays(cur, step);
    if (e.key === 'PageUp' || e.key === 'PageDown') { const d = parse(cur); d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1)); n = iso(d); }
    if (!n) return;
    e.preventDefault();
    if (n > max) n = max;
    const nd = parse(n);
    if (nd.getMonth() !== view.getMonth() || nd.getFullYear() !== view.getFullYear()) { view = new Date(nd.getFullYear(), nd.getMonth(), 1); paintGrid(); }
    const b = grid.querySelector(`[data-d="${n}"]`);
    grid.querySelectorAll('[tabindex="0"]').forEach((x) => (x.tabIndex = -1));
    if (b) { b.tabIndex = 0; b.focus(); }
  });

  paint();
  return { get value() { return val; }, set: (s) => set(s, false), mark: (m) => { marked = m; paint(); } };
}
