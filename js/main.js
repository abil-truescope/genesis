// Интерфейс дневника: главная, новый день (мастер), архив (лента/календарь), папка дня,
// настройки, политика. Маршруты — простые хэши: #home, #new, #archive, #day-<id>, #settings, #privacy, #terms.

import { createDay } from './pipeline.js';
import {
  listDays, getDay, deleteDay, deleteAllDays, saveDay, storageMode,
  useDatabase, listDaysFrom, clearDatabase,
} from './db.js';
import { MemoryRenderer, CW, CH } from './render/renderer.js';
import { STYLES, FILM } from './system/mapping.js';
import { GENRE_LIST, parseSongLink } from './analyze/audio.js';
import { analyzeText } from './analyze/text.js';
import { analyzeImages } from './analyze/image.js';
import { getLlmSettings, setLlmSettings } from './analyze/llm.js';
import { speak, stopSpeaking, voiceAvailable, isSpeaking } from './voice.js';
import { recordVideo, dayFolderZip, download, safeName, makeZip } from './export.js';
import { DEMO_DAYS, buildDemoInput } from './demo.js';
import { currentUser, onAuthChange, renderGoogleButton, signOut, googleConfigured, databaseFor } from './auth.js';
import { PRIVACY_HTML, TERMS_HTML } from './privacy.js';
import { POLICY_VERSION } from './config.js';
import { icon, toast, modal, confirmModal, stagger, greeting, longDate } from './ui.js';
import { escapeHtml, loadImageFromBlob, toHex, rgbStr, formatDateRu } from './util.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
let active = null;
let urls = [];
const objUrl = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };

const STYLE_SHORT = { monet: 'Моне', minimal: 'Ма', matisse: 'Матисс', kandinsky: 'Кандинский' };
const DEFAULT_PALETTE = [[226, 150, 84], [190, 82, 58], [88, 108, 168], [238, 206, 148], [120, 150, 120]];
const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plural = (n, a, b, c) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
  return c;
};
const paletteGradient = (pal, dir = '135deg') =>
  `linear-gradient(${dir}, ${(pal || DEFAULT_PALETTE).slice(0, 4).map((c) => rgbStr(c)).join(', ')})`;

function cleanup() {
  if (active) {
    active.renderer?.stop();
    active.audio?.pause();
    active.audioCtx?.close?.();
    active.off?.();
    stopSpeaking();
    active = null;
  }
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

// ================= Каркас =================
function setNav(name) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
}

function renderUserSlot() {
  const slot = $('#user-slot');
  const u = currentUser();
  if (!u) {
    slot.innerHTML = `<button class="btn ghost sm" id="btn-login">${icon('user', 16)}<span>Войти</span></button>`;
    $('#btn-login').onclick = openLogin;
    return;
  }
  const initials = (u.name || u.email || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  slot.innerHTML = `
    <div class="user-menu">
      <button class="avatar" id="btn-user" aria-haspopup="true" aria-expanded="false" title="${escapeHtml(u.name)}">
        ${u.picture ? `<img src="${escapeHtml(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initials)}</span>`}
      </button>
      <div class="menu" id="user-dd" hidden>
        <div class="menu-head"><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)}</small></div>
        <a href="#settings" class="menu-item">${icon('settings', 16)}Настройки</a>
        <a href="#privacy" class="menu-item">${icon('shield', 16)}Конфиденциальность</a>
        <button class="menu-item" id="btn-logout">${icon('logout', 16)}Выйти</button>
      </div>
    </div>`;
  const dd = $('#user-dd'), btn = $('#btn-user');
  btn.onclick = (e) => {
    e.stopPropagation();
    dd.hidden = !dd.hidden;
    btn.setAttribute('aria-expanded', String(!dd.hidden));
    if (!dd.hidden) requestAnimationFrame(() => dd.classList.add('in'));
    else dd.classList.remove('in');
  };
  document.addEventListener('click', () => { dd.hidden = true; dd.classList.remove('in'); }, { once: true });
  $('#btn-logout').onclick = async () => {
    signOut();
    toast('Вы вышли. Открыт гостевой дневник');
  };
}

function applyUser() {
  useDatabase(databaseFor(currentUser()));
  renderUserSlot();
}

async function openLogin() {
  const configured = googleConfigured();
  let off = null;
  await modal({
    title: 'Вход в дневник',
    body: `
      <p class="muted">Аккаунт нужен, чтобы у каждого был свой дневник на этом устройстве. Записи по-прежнему хранятся только у вас в браузере — на сервер они не уходят.</p>
      <div class="gbtn-wrap" id="gbtn">${configured ? '<div class="spinner"></div>' : ''}</div>
      ${configured ? '' : `<div class="notice">${icon('shield', 16)}<span>Вход через Google ещё не подключён: владельцу сайта нужно указать Client ID (см. <code>docs/GOOGLE_SIGNIN.md</code>). Пока можно пользоваться дневником как гость.</span></div>`}
      <p class="fine">Продолжая, вы соглашаетесь с <a href="#privacy">политикой конфиденциальности</a> и <a href="#terms">условиями</a>.</p>`,
    actions: [{ label: 'Продолжить как гость', value: 'guest' }],
    onMount: async (wrap, close) => {
      off = onAuthChange((u) => { if (u) close('ok'); });
      wrap.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => close(null)));
      if (configured) {
        try { await renderGoogleButton(wrap.querySelector('#gbtn')); wrap.querySelector('.spinner')?.remove(); }
        catch (e) { wrap.querySelector('#gbtn').innerHTML = `<p class="err">${escapeHtml(e.message)}</p>`; }
      }
    },
  });
  off && off();
}

async function offerMigration() {
  const u = currentUser();
  if (!u) return;
  const guest = await listDaysFrom('artech-diary');
  if (!guest.length) return;
  const ok = await modal({
    title: 'Перенести гостевые записи?',
    body: `<p>В гостевом дневнике на этом устройстве ${guest.length} ${plural(guest.length, 'день', 'дня', 'дней')}. Перенести их в дневник аккаунта ${escapeHtml(u.email)}?</p>`,
    actions: [{ label: 'Оставить в гостевом', value: false }, { label: 'Перенести', kind: 'primary', value: true }],
  });
  if (!ok) return;
  for (const d of guest) await saveDay(d);
  await clearDatabase('artech-diary');
  toast(`Перенесено: ${guest.length}`);
}

async function ensureConsent() {
  let stored = null;
  try { stored = localStorage.getItem('artech-consent'); } catch (e) { /* storage недоступен */ }
  if (stored === POLICY_VERSION) return;
  await modal({
    title: 'Дневник атмосферы',
    dismissible: false,
    wide: true,
    body: `
      <p class="lead-sm">Пишете, как прошёл день, добавляете фото и песню — дневник превращает это в живую страницу, которая передаёт, <i>как день ощущался</i>.</p>
      <ul class="consent-list">
        <li>${icon('shield', 18)}<span><b>Всё хранится у вас.</b> Записи, фото и настройки остаются в этом браузере. Сервера с вашими данными нет.</span></li>
        <li>${icon('music', 18)}<span><b>Музыка — по ссылке.</b> Чужие песни не сохраняются: файл только анализируется, а играет официальный плеер сервиса.</span></li>
        <li>${icon('sparkle', 18)}<span><b>Не диагностика.</b> Оценки настроения нужны, чтобы оформить страницу, а не чтобы оценивать вас.</span></li>
      </ul>
      <details class="policy-peek"><summary>Прочитать политику конфиденциальности</summary><div class="doc">${PRIVACY_HTML}</div></details>
      <label class="check"><input type="checkbox" id="consent-box"><span>Я прочитал(а) политику конфиденциальности и согласен(на) с ней</span></label>`,
    actions: [{
      label: 'Начать',
      kind: 'primary',
      value: true,
      validate: (wrap) => {
        const box = wrap.querySelector('#consent-box');
        if (!box.checked) { box.closest('.check').classList.add('shake'); setTimeout(() => box.closest('.check').classList.remove('shake'), 500); return false; }
        return true;
      },
    }],
  });
  try { localStorage.setItem('artech-consent', POLICY_VERSION); } catch (e) { /* ignore */ }
}

async function route() {
  cleanup();
  const h = location.hash || '#home';
  window.scrollTo({ top: 0 });
  app.classList.remove('view-enter');
  void app.offsetWidth;
  app.classList.add('view-enter');
  if (h.startsWith('#new')) return viewNew();
  if (h.startsWith('#archive')) return viewArchive();
  if (h.startsWith('#day-')) return viewDay(decodeURIComponent(h.slice(5)));
  if (h.startsWith('#settings')) return viewSettings();
  if (h.startsWith('#privacy')) return viewDoc('privacy');
  if (h.startsWith('#terms')) return viewDoc('terms');
  return viewHome();
}

// ================= Главная =================
async function viewHome() {
  setNav('home');
  const days = await listDays();
  const u = currentUser();
  const today = localISO();
  const todayEntry = days.find((d) => d.date === today);
  const pal = days[0]?.params.palette || DEFAULT_PALETTE;
  const byDate = new Map();
  days.forEach((d) => { if (!byDate.has(d.date)) byDate.set(d.date, d); });

  // серия дней подряд
  let streak = 0;
  const cur = new Date();
  if (!byDate.has(localISO(cur))) cur.setDate(cur.getDate() - 1);
  while (byDate.has(localISO(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  const counts = {};
  days.forEach((d) => { counts[d.params.style] = (counts[d.params.style] || 0) + 1; });
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // «В этот день»: тот же день месяца раньше
  const now = new Date();
  const onThisDay = days.find((d) => {
    const dd = new Date(d.date);
    return d.date !== today && dd.getDate() === now.getDate() && dd < now;
  });

  const strip = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = localISO(d);
    strip.push({ iso, d, e: byDate.get(iso) });
  }

  const name = u?.givenName || u?.name?.split(' ')[0] || '';
  app.innerHTML = `
  <section class="home">
    <div class="hero" data-stagger>
      <div class="hero-text">
        <p class="eyebrow">${escapeHtml(longDate(now))}</p>
        <h1>${greeting(now)}${name ? `, ${escapeHtml(name)}` : ''}.</h1>
        <p class="lead">${todayEntry ? `Сегодняшний день уже в дневнике — «${escapeHtml(todayEntry.title)}».` : 'Как прошёл сегодня? Пара строк, фото и песня — и день останется таким, каким вы его почувствовали.'}</p>
        <div class="hero-actions">
          ${todayEntry
            ? `<a class="btn primary lg" href="#day-${encodeURIComponent(todayEntry.id)}">${icon('play', 16)}Открыть сегодня</a><a class="btn lg" href="#new">${icon('plus', 16)}Ещё запись</a>`
            : `<a class="btn primary lg" href="#new">${icon('pen', 16)}Записать сегодня</a><a class="btn lg" href="#archive">${icon('archive', 16)}Архив</a>`}
        </div>
      </div>
      <div class="orb" aria-hidden="true" style="--c1:${rgbStr(pal[0])};--c2:${rgbStr(pal[1] || pal[0])};--c3:${rgbStr(pal[2] || pal[0])};--c4:${rgbStr(pal[3] || pal[0])}">
        <span></span><span></span><span></span><span></span><i></i>
      </div>
    </div>

    ${days.length ? `
    <div class="stats" data-stagger>
      <div class="stat"><b>${days.length}</b><span>${plural(days.length, 'день', 'дня', 'дней')} в дневнике</span></div>
      <div class="stat"><b>${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')} подряд</span></div>
      <div class="stat"><b>${fav ? STYLE_SHORT[fav] : '—'}</b><span>частый приём</span></div>
    </div>

    <div class="block" data-stagger>
      <div class="block-head"><h2>Последние две недели</h2><a href="#archive" class="link">Весь архив ${icon('right', 14)}</a></div>
      <div class="strip">
        ${strip.map(({ iso, d, e }) => e
          ? `<a class="cell has" href="#day-${encodeURIComponent(e.id)}" style="background:${paletteGradient(e.params.palette)}" title="${escapeHtml(e.title)}"><span>${d.getDate()}</span></a>`
          : `<a class="cell ${iso === today ? 'today' : ''}" href="#new" data-date="${iso}" title="${iso === today ? 'Записать сегодня' : 'Записать этот день'}"><span>${d.getDate()}</span></a>`).join('')}
      </div>
    </div>

    ${onThisDay ? `
    <a class="memory-card" data-stagger href="#day-${encodeURIComponent(onThisDay.id)}">
      <img src="${onThisDay.thumb ? objUrl(onThisDay.thumb) : ''}" alt="">
      <div><p class="eyebrow">В этот день · ${escapeHtml(formatDateRu(new Date(onThisDay.date)))}</p><h3>${escapeHtml(onThisDay.title)}</h3><p class="muted">${escapeHtml(onThisDay.caption || '')}</p></div>
      ${icon('right', 20)}
    </a>` : ''}

    <div class="block" data-stagger>
      <div class="block-head"><h2>Недавние страницы</h2></div>
      <div class="grid recent">${days.slice(0, 3).map((d, i) => cardHtml(d, i)).join('')}</div>
    </div>` : `
    <div class="empty-hero" data-stagger>
      <div class="empty-art" aria-hidden="true">${['monet', 'minimal', 'matisse', 'kandinsky'].map((s, i) => `<span class="page p${i}"></span>`).join('')}</div>
      <div>
        <h2>Начните с любимого дня</h2>
        <p class="muted">Выберите один из самых тёплых дней своей жизни и опишите его как другу: погода, свет, запахи, люди рядом, мелочи.</p>
        <ul class="tips"><li>${icon('pen', 16)}Пишите конкретно</li><li>${icon('photo', 16)}Настоящие фото того дня</li><li>${icon('music', 16)}Та самая песня</li></ul>
        <div class="hero-actions"><a class="btn primary" href="#new">${icon('pen', 16)}Записать день</a><button class="btn" id="btn-demo">${icon('sparkle', 16)}Показать на 5 демо-днях</button></div>
        <p class="status-line" id="demo-status"></p>
      </div>
    </div>`}
  </section>`;
  stagger(app);
  $$('.strip .cell[data-date]').forEach((c) => c.addEventListener('click', () => { draft = null; pendingDate = c.dataset.date; }));
  const demoBtn = $('#btn-demo');
  if (demoBtn) demoBtn.onclick = () => addDemoDays(demoBtn, $('#demo-status'));
}

function cardHtml(d, i = 0) {
  return `
    <a class="card" href="#day-${encodeURIComponent(d.id)}" style="--i:${i}">
      <div class="card-img"><img src="${d.thumb ? objUrl(d.thumb) : ''}" alt="" loading="lazy"><span class="chip on-img">${STYLE_SHORT[d.params.style]}${d.params.film ? ' + плёнка' : ''}</span></div>
      <div class="meta"><span class="folder">${icon('folder', 15)} ${escapeHtml(d.title)}</span>
      <span class="sub">${escapeHtml(formatDateRu(new Date(d.date)))} · ${d.params.bpm} bpm</span></div>
    </a>`;
}

async function addDemoDays(btn, st) {
  btn.disabled = true;
  try {
    for (let k = 0; k < DEMO_DAYS.length; k++) {
      st.textContent = `Демо-день ${k + 1} из ${DEMO_DAYS.length}: синтезирую фото и музыку…`;
      const input = await buildDemoInput(DEMO_DAYS[k], k);
      await createDay(input, (s) => (st.textContent = `Демо-день ${k + 1}/${DEMO_DAYS.length}: ${s}`));
    }
    toast('Добавлено 5 демо-дней');
    route();
  } catch (err) {
    console.error(err);
    st.textContent = 'Ошибка: ' + err.message;
    btn.disabled = false;
  }
}

// ================= Новый день (мастер) =================
let draft = null;
let pendingDate = null;

function newDraft() {
  return {
    step: 1,
    date: pendingDate || localISO(),
    text: '',
    photos: [],
    palette: null,
    song: { tab: 'link', url: '', file: null, ownAudio: false, artist: '', title: '', genre: '', year: '', mood: '' },
  };
}

function viewNew() {
  setNav('new');
  if (!draft) draft = newDraft();
  pendingDate = null;
  const st = draft;
  const steps = [['pen', 'Запись'], ['photo', 'Фото'], ['music', 'Песня']];
  app.innerHTML = `
  <section class="wizard">
    <div class="wizard-head">
      <h1>Новый день</h1>
      <ol class="stepper">${steps.map(([ic, l], i) => `<li class="${st.step === i + 1 ? 'on' : st.step > i + 1 ? 'done' : ''}"><button data-goto="${i + 1}" ${st.step > i ? '' : 'disabled'}><span class="dot">${st.step > i + 1 ? icon('check', 14) : icon(ic, 14)}</span>${l}</button></li>`).join('')}</ol>
      <div class="progress"><i style="width:${((st.step - 1) / 2) * 100}%"></i></div>
    </div>
    <div class="wizard-body" id="wz"></div>
    <div class="wizard-foot">
      <button class="btn ghost" id="wz-back" ${st.step === 1 ? 'hidden' : ''}>${icon('left', 16)}Назад</button>
      <span class="spacer"></span>
      <span class="hint" id="wz-hint"></span>
      <button class="btn primary" id="wz-next">${st.step === 3 ? `${icon('sparkle', 16)}Собрать воспоминание` : `Далее${icon('right', 16)}`}</button>
    </div>
  </section>`;
  $$('[data-goto]').forEach((b) => (b.onclick = () => { st.step = +b.dataset.goto; viewNew(); }));
  $('#wz-back').onclick = () => { st.step--; viewNew(); };
  const body = $('#wz');
  const next = $('#wz-next');
  const hint = $('#wz-hint');
  const setValid = (ok, msg = '') => { next.disabled = !ok; hint.textContent = ok ? '' : msg; };

  if (st.step === 1) {
    body.innerHTML = `
      <div class="two-col">
        <div>
          <label class="field"><span>Дата</span><input type="date" id="f-date" value="${st.date}" max="${localISO()}"></label>
          <label class="field"><span>Как прошёл день?</span>
            <textarea id="f-text" rows="8" placeholder="Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали…">${escapeHtml(st.text)}</textarea>
          </label>
          <div class="prompts">${['Какая была погода?', 'Какой был свет?', 'Чем пахло?', 'Кто был рядом?', 'Что запомнилось?'].map((p) => `<button type="button" class="chip" data-p="${p}">${p}</button>`).join('')}</div>
        </div>
        <aside class="live" aria-live="polite">
          <p class="eyebrow">${icon('sparkle', 14)} Дневник слышит</p>
          <div class="live-title"><small>Папка будет называться</small><b id="lv-title">…</b></div>
          <div class="bars" id="lv-bars"></div>
          <p class="fine">Оценки обновляются по мере письма. Это художественный инструмент, а не диагностика.</p>
        </aside>
      </div>`;
    const ta = $('#f-text');
    const upd = () => {
      st.text = ta.value; st.date = $('#f-date').value || localISO();
      const ok = st.text.trim().length >= 10;
      setValid(ok, 'Напишите хотя бы одно предложение');
      const a = analyzeText(st.text || ' ', st.date);
      $('#lv-title').textContent = st.text.trim().length > 3 ? a.title : '…';
      const ax = a.axes;
      $('#lv-bars').innerHTML = [['настроение', ax.valence], ['энергия', ax.energy], ['теплота', ax.warmth], ['напряжение', ax.tension], ['ностальгия', ax.nostalgia]]
        .map(([n, v]) => `<div class="bar"><span>${n}</span><i style="--v:${st.text.trim() ? v : 0}"></i></div>`).join('');
    };
    let t;
    ta.oninput = () => { clearTimeout(t); t = setTimeout(upd, 180); st.text = ta.value; setValid(ta.value.trim().length >= 10, 'Напишите хотя бы одно предложение'); };
    $('#f-date').onchange = upd;
    $$('.prompts .chip').forEach((c) => (c.onclick = () => {
      ta.focus();
      ta.placeholder = c.dataset.p;
      c.classList.add('used');
    }));
    upd();
    setTimeout(() => ta.focus(), 50);
    next.onclick = () => { st.step = 2; viewNew(); };
  }

  if (st.step === 2) {
    body.innerHTML = `
      <label class="drop" id="f-drop" tabindex="0">
        <input type="file" id="f-photos" accept="image/*" multiple hidden>
        <span class="drop-ic">${icon('upload', 26)}</span>
        <b>Перетащите фото или нажмите, чтобы выбрать</b>
        <small>Одно или несколько. Цвета карточки возьмутся из них.</small>
      </label>
      <div class="previews" id="f-prev"></div>
      <div class="palette-live" id="f-pal" hidden><span class="eyebrow">Палитра дня</span><div class="palette"></div></div>`;
    const prev = $('#f-prev');
    const renderPrev = async () => {
      prev.innerHTML = st.photos.map((p, k) => `<figure class="pv" style="--i:${k}"><img src="${objUrl(p)}" alt=""><button class="icon-btn" data-k="${k}" aria-label="Убрать фото">${icon('close', 14)}</button></figure>`).join('');
      setValid(st.photos.length > 0, 'Добавьте минимум одно фото');
      const box = $('#f-pal');
      if (!st.photos.length) { box.hidden = true; return; }
      const imgs = await Promise.all(st.photos.map(loadImageFromBlob));
      const a = await analyzeImages(imgs);
      st.palette = a.palette;
      box.hidden = false;
      box.querySelector('.palette').innerHTML = a.palette.map((c, i) => `<span style="background:${toHex(c)};--i:${i}" title="${toHex(c)}"></span>`).join('');
    };
    const add = (files) => { st.photos = st.photos.concat([...files].filter((f) => f.type.startsWith('image/'))); renderPrev(); };
    $('#f-photos').onchange = (e) => add(e.target.files);
    prev.onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { st.photos.splice(+b.dataset.k, 1); renderPrev(); } };
    const drop = $('#f-drop');
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#f-photos').click(); } };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); };
    renderPrev();
    next.onclick = () => { st.step = 3; viewNew(); };
  }

  if (st.step === 3) {
    const s = st.song;
    body.innerHTML = `
      <div class="seg" role="tablist">
        <button class="${s.tab === 'link' ? 'on' : ''}" data-tab="link" role="tab">${icon('link', 15)}Ссылка</button>
        <button class="${s.tab === 'file' ? 'on' : ''}" data-tab="file" role="tab">${icon('music', 15)}Аудиофайл</button>
      </div>
      <div data-pane="link" ${s.tab === 'link' ? '' : 'hidden'}>
        <label class="field"><span>Ссылка на песню</span><input id="f-url" value="${escapeHtml(s.url)}" placeholder="Spotify, YouTube, Яндекс Музыка, Apple Music, SoundCloud"></label>
        <p class="hint" id="f-url-hint"></p>
      </div>
      <div data-pane="file" ${s.tab === 'file' ? '' : 'hidden'}>
        <label class="file-pick"><input type="file" id="f-audio" accept="audio/*" hidden>${icon('upload', 18)}<span id="f-audio-name">${s.file ? escapeHtml(s.file.name) : 'Выбрать аудиофайл'}</span></label>
        <label class="check"><input type="checkbox" id="f-own" ${s.ownAudio ? 'checked' : ''}><span>Это моя запись или трек со свободной лицензией — можно сохранить в дневнике</span></label>
        <p class="notice soft" id="f-own-note">${icon('shield', 16)}<span>Чужие песни мы не храним: файл только проанализируем (темп, лад, энергию). Чтобы песня звучала при просмотре, добавьте ниже ещё и ссылку.</span></p>
        <label class="field"><span>Ссылка для прослушивания (по желанию)</span><input id="f-url2" value="${escapeHtml(s.url)}" placeholder="https://…"></label>
      </div>
      <div class="row3">
        <label class="field"><span>Исполнитель</span><input id="f-artist" value="${escapeHtml(s.artist)}"></label>
        <label class="field"><span>Название</span><input id="f-title" value="${escapeHtml(s.title)}"></label>
      </div>
      <div class="row3">
        <label class="field"><span>Жанр</span><select id="f-genre"><option value="">не знаю</option>${GENRE_LIST.map(([k, l]) => `<option value="${k}" ${s.genre === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Год</span><input id="f-year" type="number" min="1900" max="2100" value="${escapeHtml(s.year)}"></label>
        <label class="field"><span>Характер</span><select id="f-mood">${[['', 'определить'], ['calm', 'спокойная'], ['drive', 'драйвовая'], ['sad', 'грустная'], ['happy', 'радостная']].map(([k, l]) => `<option value="${k}" ${s.mood === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>`;
    const sync = () => {
      s.artist = $('#f-artist').value.trim(); s.title = $('#f-title').value.trim();
      s.genre = $('#f-genre').value; s.year = $('#f-year').value; s.mood = $('#f-mood').value;
      s.url = (s.tab === 'link' ? $('#f-url').value : $('#f-url2').value).trim();
      s.ownAudio = $('#f-own').checked;
      $('#f-own-note').hidden = s.ownAudio;
      const l = parseSongLink(s.url);
      $('#f-url-hint').innerHTML = l ? `${icon('check', 14)} ${escapeHtml(l.service)}${l.embed ? ' — будет играть при просмотре записи' : ' — откроется по ссылке'}` : '';
      const ok = Boolean(s.url || (s.tab === 'file' && s.file) || s.artist || s.title);
      setValid(ok, 'Добавьте ссылку, файл или хотя бы исполнителя');
    };
    $$('.seg button').forEach((b) => (b.onclick = () => {
      s.tab = b.dataset.tab;
      $$('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== s.tab));
      $('#f-url').value = $('#f-url2').value = s.url;
      sync();
    }));
    $$('#wz input, #wz select').forEach((el) => el.addEventListener('input', sync));
    $('#f-audio').onchange = (e) => {
      s.file = e.target.files[0] || null;
      $('#f-audio-name').textContent = s.file ? s.file.name : 'Выбрать аудиофайл';
      if (s.file && !$('#f-title').value) $('#f-title').value = s.file.name.replace(/\.[^.]+$/, '');
      sync();
    };
    sync();
    next.onclick = () => buildDay();
  }
}

async function buildDay() {
  const st = draft;
  const s = st.song;
  const input = {
    date: st.date,
    text: st.text.trim(),
    photos: st.photos,
    song: {
      url: s.url,
      blob: s.tab === 'file' ? s.file : null,
      ownAudio: s.tab === 'file' && s.ownAudio,
      fileName: s.tab === 'file' && s.file ? s.file.name : null,
      artist: s.artist, title: s.title, genre: s.genre, year: s.year, mood: s.mood,
    },
  };
  const stages = ['Готовлю фотографии', 'Читаю текст дня', 'Извлекаю палитру из фото', 'Слушаю песню', 'Применяю правила визуальной системы', 'Собираю воспоминание', 'Сохраняю папку дня'];
  const wz = $('.wizard');
  wz.insertAdjacentHTML('beforeend', `
    <div class="building" role="status">
      <div class="build-card">
        <div class="build-orb" id="b-orb"></div>
        <p class="eyebrow">Собираю воспоминание</p>
        <h2 id="b-title">&nbsp;</h2>
        <div class="palette build-pal" id="b-pal"></div>
        <ol class="build-steps">${stages.map((x, i) => `<li data-i="${i}"><span class="tick"></span>${x}</li>`).join('')}</ol>
        <p class="err" id="b-err"></p>
      </div>
    </div>`);
  requestAnimationFrame(() => $('.building').classList.add('in'));
  let idx = -1;
  const mark = (label) => {
    const k = stages.findIndex((x) => label.startsWith(x.split(':')[0].slice(0, 12)));
    const n = k >= 0 ? k : idx + 1;
    $$('.build-steps li').forEach((li) => {
      const i = +li.dataset.i;
      li.classList.toggle('done', i < n);
      li.classList.toggle('now', i === n);
    });
    idx = n;
  };
  try {
    const day = await createDay(input, (label, data) => {
      mark(label);
      if (data?.palette) {
        $('#b-pal').innerHTML = data.palette.slice(0, 6).map((c, i) => `<span style="background:${toHex(c)};--i:${i}"></span>`).join('');
        $('#b-orb').style.background = paletteGradient(data.palette);
      }
      if (data?.title) typeTitle($('#b-title'), data.title);
    });
    $$('.build-steps li').forEach((li) => { li.classList.add('done'); li.classList.remove('now'); });
    draft = null;
    toast(`Сохранено: «${day.title}»`);
    setTimeout(() => { location.hash = '#day-' + day.id; }, 650);
  } catch (e) {
    console.error(e);
    $('#b-err').textContent = e.message || String(e);
    $('.build-card').insertAdjacentHTML('beforeend', `<button class="btn" id="b-back">${icon('left', 16)}Вернуться к записи</button>`);
    $('#b-back').onclick = () => { $('.building').remove(); };
  }
}

function typeTitle(el, text) {
  if (el.dataset.text === text) return;
  el.dataset.text = text;
  el.textContent = '';
  let i = 0;
  const step = () => { el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 28); };
  step();
}

// ================= Архив =================
let archiveState = { q: '', style: 'all', view: 'grid', month: null };

async function viewArchive() {
  setNav('archive');
  const days = await listDays();
  const A = archiveState;
  if (!A.month) { const d = days[0] ? new Date(days[0].date) : new Date(); A.month = [d.getFullYear(), d.getMonth()]; }
  app.innerHTML = `
  <section class="archive">
    <div class="page-head">
      <div><h1>Архив</h1><p class="lead">${days.length ? `${days.length} ${plural(days.length, 'страница', 'страницы', 'страниц')}. Все дни — один дневник, но каждый узнаваемо свой.` : 'Здесь будут ваши дни.'}</p></div>
      <a class="btn primary" href="#new">${icon('plus', 16)}Новый день</a>
    </div>
    ${days.length ? `
    <div class="toolbar">
      <label class="search">${icon('search', 16)}<input id="a-q" placeholder="Поиск по названию и тексту" value="${escapeHtml(A.q)}"></label>
      <div class="chips" id="a-styles">${[['all', 'Все'], ...Object.entries(STYLE_SHORT), ['film', 'Плёнка']].map(([k, l]) => `<button class="chip ${A.style === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
      <div class="seg sm" id="a-view"><button class="${A.view === 'grid' ? 'on' : ''}" data-v="grid" aria-label="Лента">${icon('grid', 16)}</button><button class="${A.view === 'cal' ? 'on' : ''}" data-v="cal" aria-label="Календарь">${icon('calendar', 16)}</button></div>
    </div>
    <div id="a-list"></div>` : `
    <div class="empty">
      <div class="empty-art small" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<span class="page p${i}"></span>`).join('')}</div>
      <p>Пока пусто. Запишите первый день или посмотрите, как система работает на демо-днях.</p>
      <div class="hero-actions"><a class="btn primary" href="#new">${icon('pen', 16)}Записать день</a><button class="btn" id="btn-demo">${icon('sparkle', 16)}Добавить 5 демо-дней</button></div>
      <p class="status-line" id="demo-status"></p>
    </div>`}
    ${storageMode() === 'memory' ? `<p class="notice">${icon('shield', 16)}<span>Хранилище браузера недоступно — записи живут до перезагрузки страницы.</span></p>` : ''}
  </section>`;
  const demoBtn = $('#btn-demo');
  if (demoBtn) { demoBtn.onclick = () => addDemoDays(demoBtn, $('#demo-status')); return; }

  const list = $('#a-list');
  const filtered = () => days.filter((d) => {
    const q = A.q.trim().toLowerCase();
    if (q && !(d.title.toLowerCase().includes(q) || d.text.toLowerCase().includes(q))) return false;
    if (A.style === 'film') return d.params.film;
    return A.style === 'all' || d.params.style === A.style;
  });
  const draw = () => {
    const items = filtered();
    if (A.view === 'grid') {
      list.innerHTML = items.length
        ? `<div class="grid">${items.map((d, i) => cardHtml(d, i)).join('')}</div>`
        : `<p class="empty-line">Ничего не нашлось. Попробуйте другой запрос.</p>`;
    } else {
      list.innerHTML = calendarHtml(items, A.month);
      $('#cal-prev').onclick = () => { A.month = shiftMonth(A.month, -1); draw(); };
      $('#cal-next').onclick = () => { A.month = shiftMonth(A.month, 1); draw(); };
    }
  };
  let t;
  $('#a-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { A.q = e.target.value; draw(); }, 150); };
  $$('#a-styles .chip').forEach((c) => (c.onclick = () => { A.style = c.dataset.s; $$('#a-styles .chip').forEach((x) => x.classList.toggle('on', x === c)); draw(); }));
  $$('#a-view button').forEach((b) => (b.onclick = () => { A.view = b.dataset.v; $$('#a-view button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  draw();
}

const shiftMonth = ([y, m], k) => { const d = new Date(y, m + k, 1); return [d.getFullYear(), d.getMonth()]; };

function calendarHtml(items, [y, m]) {
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // понедельник — первый
  const daysIn = new Date(y, m + 1, 0).getDate();
  const byDate = new Map();
  items.forEach((d) => { if (!byDate.has(d.date)) byDate.set(d.date, d); });
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let day = 1; day <= daysIn; day++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const e = byDate.get(iso);
    cells.push(e
      ? `<a class="cal-cell has" href="#day-${encodeURIComponent(e.id)}" title="${escapeHtml(e.title)}" style="background:${paletteGradient(e.params.palette)}">${e.thumb ? `<img src="${objUrl(e.thumb)}" alt="">` : ''}<span>${day}</span></a>`
      : `<div class="cal-cell ${iso === localISO() ? 'today' : ''}"><span>${day}</span></div>`);
  }
  const title = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return `
    <div class="calendar">
      <div class="cal-head"><button class="icon-btn" id="cal-prev" aria-label="Предыдущий месяц">${icon('left')}</button><h3>${title}</h3><button class="icon-btn" id="cal-next" aria-label="Следующий месяц">${icon('right')}</button></div>
      <div class="cal-grid">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>
    </div>`;
}

// ================= Папка дня =================
async function viewDay(id) {
  setNav('archive');
  const day = await getDay(id);
  if (!day) {
    app.innerHTML = `<div class="empty"><h2>Запись не найдена</h2><p class="muted">Возможно, она в дневнике другого аккаунта.</p><a class="btn" href="#archive">${icon('archive', 16)}В архив</a></div>`;
    return;
  }
  const all = await listDays();
  const pos = all.findIndex((d) => d.id === id);
  const prevD = all[pos + 1], nextD = all[pos - 1];
  const p = day.params;
  const S = STYLES[p.style];
  const s = day.song;
  const mood = p.mood;
  const bars = [['настроение', mood.valence], ['энергия', mood.energy], ['напряжение', mood.tension], ['теплота', mood.warmth], ['ностальгия', mood.nostalgia], ['с людьми', mood.social]];
  const hasAudio = s.kind === 'file' && s.blob;

  app.innerHTML = `
  <section class="day">
    <div class="stage">
      <div class="canvas-wrap" style="--glow:${rgbStr(p.palette[0], 0.35)}">
        <canvas id="d-canvas" width="${CW}" height="${CH}" aria-label="Воспоминание дня «${escapeHtml(day.title)}»"></canvas>
        <button class="play-fab" id="d-play" aria-label="Музыка">${icon('play', 22)}</button>
      </div>
      <div class="controls">
        <button class="btn" id="d-music">${icon('play', 16)}<span>Музыка</span></button>
        <button class="btn" id="d-voice" ${voiceAvailable() ? '' : 'disabled'}>${icon('voice', 16)}<span>Озвучка</span></button>
        <button class="btn" id="d-video">${icon('video', 16)}<span>Видео</span></button>
        <button class="btn" id="d-zip">${icon('download', 16)}<span>Папка дня</span></button>
      </div>
      <div class="rec" id="d-rec" hidden><i></i><span id="d-rec-t">Запись видео</span></div>
      <nav class="pager">
        ${prevD ? `<a href="#day-${encodeURIComponent(prevD.id)}" class="pg">${icon('left', 16)}<span>${escapeHtml(prevD.title)}</span></a>` : '<span></span>'}
        ${nextD ? `<a href="#day-${encodeURIComponent(nextD.id)}" class="pg next"><span>${escapeHtml(nextD.title)}</span>${icon('right', 16)}</a>` : '<span></span>'}
      </nav>
    </div>
    <aside class="folder-panel">
      <p class="eyebrow">${escapeHtml(formatDateRu(new Date(day.date)))} · стр. ${day.pageNo || 1}</p>
      <h1 class="day-title">${icon('folder', 26)} ${escapeHtml(day.title)}</h1>
      <div class="chips"><span class="chip on">${escapeHtml(S.name)}</span>${p.film ? '<span class="chip">плёнка</span>' : ''}<span class="chip">${p.bpm} bpm</span><span class="chip">голос: ${escapeHtml(p.voice.character)}</span></div>
      <div class="seg tabs" role="tablist"><button class="on" data-t="folder" role="tab">${icon('folder', 15)}Папка</button><button data-t="why" role="tab">${icon('why', 15)}Почему так?</button></div>
      <div data-tp="folder">
        <ul class="files">
          <li><b>запись.txt</b><p class="entry">${escapeHtml(day.text)}</p></li>
          <li><b>фото · ${day.photos.length}</b><div class="thumbs">${day.photos.map((ph) => `<img src="${objUrl(ph)}" alt="">`).join('')}</div></li>
          <li><b>песня</b>
            <p class="song-line">${icon('music', 15)} ${escapeHtml([s.artist, s.title].filter(Boolean).join(' — ') || 'без названия')}${s.year ? ` · ${escapeHtml(s.year)}` : ''}</p>
            ${hasAudio ? `<audio id="d-audio" controls src="${objUrl(s.blob)}"></audio>` : ''}
            ${s.embed ? `<iframe class="embed" src="${escapeHtml(s.embed)}" allow="autoplay; encrypted-media" loading="lazy" title="Плеер песни"></iframe>` : ''}
            ${s.url && !s.embed ? `<a class="btn sm" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${icon('link', 14)}Открыть (${escapeHtml(s.service || 'ссылка')})</a>` : ''}
            ${s.analyzedFromFile && !hasAudio ? `<p class="fine">Темп и лад взяты из аудиофайла, сам файл не сохранён (авторские права).</p>` : ''}
          </li>
        </ul>
      </div>
      <div data-tp="why" hidden>
        <div class="palette big">${p.palette.map((c, i) => `<span style="background:${toHex(c)};--i:${i}" title="${toHex(c)}"></span>`).join('')}</div>
        <div class="bars">${bars.map(([n, v]) => `<div class="bar"><span>${n}</span><i style="--v:${v}"></i><em>${Math.round(v * 100)}</em></div>`).join('')}</div>
        <ol class="why-list">${p.explain.map((e, i) => `<li style="--i:${i}"><b>${escapeHtml(e.factor)}</b><span>${escapeHtml(e.effect)}</span></li>`).join('')}</ol>
        <p class="ref">Референс: ${escapeHtml(S.reference)}${p.film ? `; ${escapeHtml(FILM.reference)}` : ''}</p>
        <p class="fine">Оценки настроения — художественный инструмент, а не диагностика.</p>
      </div>
      <button class="btn ghost danger sm" id="d-del">${icon('trash', 15)}Удалить день</button>
    </aside>
  </section>`;

  $$('.tabs button').forEach((b) => (b.onclick = () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-tp]').forEach((x) => (x.hidden = x.dataset.tp !== b.dataset.t));
  }));

  const images = [];
  for (const ph of day.photos) images.push(await loadImageFromBlob(ph));
  const canvas = $('#d-canvas');
  const renderer = new MemoryRenderer(canvas, day, images);
  await renderer.prepare();
  if (location.hash !== '#day-' + id) return; // пользователь уже ушёл
  active = { renderer };
  renderer.start();

  const onKey = (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft' && prevD) location.hash = '#day-' + prevD.id;
    if (e.key === 'ArrowRight' && nextD) location.hash = '#day-' + nextD.id;
  };
  document.addEventListener('keydown', onKey);
  active.off = () => document.removeEventListener('keydown', onKey);

  const audio = $('#d-audio');
  const musicBtn = $('#d-music'), fab = $('#d-play');
  const setPlaying = (on) => {
    musicBtn.innerHTML = `${icon(on ? 'pause' : 'play', 16)}<span>Музыка</span>`;
    fab.innerHTML = icon(on ? 'pause' : 'play', 22);
    fab.classList.toggle('on', on);
    musicBtn.classList.toggle('on', on);
  };
  if (audio) {
    active.audio = audio;
    let wired = false;
    const toggle = async () => {
      if (!wired) {
        try {
          const ac = new AudioContext();
          const src = ac.createMediaElementSource(audio);
          const an = ac.createAnalyser(); an.fftSize = 1024;
          src.connect(an); an.connect(ac.destination);
          active.audioCtx = ac;
          renderer.attachAudio(audio, an);
        } catch (e) { renderer.attachAudio(audio, null); }
        wired = true;
      }
      if (audio.paused) { await active.audioCtx?.resume(); audio.play(); } else audio.pause();
    };
    musicBtn.onclick = fab.onclick = toggle;
    canvas.onclick = toggle;
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
  } else {
    const go = () => {
      const emb = $('.embed');
      if (emb) { emb.scrollIntoView({ behavior: 'smooth', block: 'center' }); emb.classList.add('pulse'); setTimeout(() => emb.classList.remove('pulse'), 1200); toast('Песня играет в плеере сервиса'); }
      else if (s.url) window.open(s.url, '_blank', 'noopener');
      else toast('Для этого дня нет ссылки на песню', 'error');
    };
    musicBtn.onclick = fab.onclick = go;
  }

  $('#d-voice').onclick = (e) => {
    const b = e.currentTarget;
    if (isSpeaking()) { stopSpeaking(); b.innerHTML = `${icon('voice', 16)}<span>Озвучка</span>`; b.classList.remove('on'); return; }
    if (speak(day.text, p, () => { b.innerHTML = `${icon('voice', 16)}<span>Озвучка</span>`; b.classList.remove('on'); })) {
      b.innerHTML = `${icon('stop', 16)}<span>Стоп</span>`; b.classList.add('on');
    }
  };
  $('#d-video').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    const rec = $('#d-rec');
    rec.hidden = false;
    try {
      audio?.pause();
      const secs = Math.min(20, Math.max(10, p.slideSeconds * renderer.slides.length));
      const video = await recordVideo(renderer, { seconds: secs, audioBlob: hasAudio ? s.blob : null, onProgress: (k) => ($('#d-rec-t').textContent = `Запись видео · ${Math.round(k * 100)}%`) });
      download(video, safeName(day.title) + '.webm');
      active.lastVideo = video;
      toast(hasAudio ? 'Видео сохранено' : 'Видео сохранено без звука: песня по ссылке не записывается');
    } catch (err) {
      toast('Не получилось записать видео: ' + err.message, 'error', 5000);
    } finally { b.disabled = false; rec.hidden = true; }
  };
  $('#d-zip').onclick = async () => {
    const { zip, filename } = await dayFolderZip(day, { video: active?.lastVideo });
    download(zip, filename);
    toast('Папка дня скачана');
  };
  $('#d-del').onclick = async () => {
    if (!(await confirmModal('Удалить день?', `«${day.title}» исчезнет из дневника. Это нельзя отменить.`))) return;
    await deleteDay(day.id);
    toast('День удалён');
    location.hash = '#archive';
  };
}

// ================= Настройки =================
async function viewSettings() {
  setNav('settings');
  const u = currentUser();
  const s = getLlmSettings();
  const days = await listDays();
  app.innerHTML = `
  <section class="settings">
    <div class="page-head"><div><h1>Настройки</h1><p class="lead">Аккаунт, анализ текста и ваши данные.</p></div></div>
    <div class="set-grid">
      <div class="set-card">
        <h3>${icon('user', 18)} Аккаунт</h3>
        ${u ? `
          <div class="profile">${u.picture ? `<img src="${escapeHtml(u.picture)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)}</small></div></div>
          <p class="fine">У этого аккаунта свой дневник на этом устройстве.</p>
          <button class="btn" id="s-logout">${icon('logout', 16)}Выйти</button>`
        : `<p class="muted">Вы в гостевом режиме. Войдите, чтобы вести свой дневник отдельно от других людей на этом устройстве.</p>
          <button class="btn primary" id="s-login">${icon('user', 16)}Войти через Google</button>`}
      </div>
      <div class="set-card">
        <h3>${icon('sparkle', 18)} Анализ текста (по желанию)</h3>
        <p class="muted">Без ключа всё работает офлайн по словарю. С ключом Gemini названия и оценки точнее — но текст уходит в Google.</p>
        <label class="field"><span>Gemini API key — хранится только в этом браузере</span><input id="s-key" type="password" value="${escapeHtml(s.apiKey)}" placeholder="AIza…" autocomplete="off"></label>
        <label class="field"><span>Модель</span><input id="s-model" value="${escapeHtml(s.model)}"></label>
        <button class="btn primary" id="s-save">${icon('check', 16)}Сохранить</button>
      </div>
      <div class="set-card">
        <h3>${icon('folder', 18)} Мои данные</h3>
        <p class="muted">${days.length} ${plural(days.length, 'день', 'дня', 'дней')} в этом дневнике. Данные лежат только в этом браузере.</p>
        <div class="btn-col">
          <button class="btn" id="s-export" ${days.length ? '' : 'disabled'}>${icon('download', 16)}Экспорт всех данных (.zip)</button>
          <button class="btn" id="s-demo">${icon('sparkle', 16)}Добавить 5 демо-дней</button>
          <button class="btn ghost danger" id="s-wipe" ${days.length ? '' : 'disabled'}>${icon('trash', 16)}Удалить все данные</button>
        </div>
        <p class="status-line" id="demo-status"></p>
      </div>
      <div class="set-card">
        <h3>${icon('shield', 18)} Конфиденциальность</h3>
        <p class="muted">Никакой аналитики и рекламы. Оценки настроения — не диагностика.</p>
        <div class="btn-col"><a class="btn" href="#privacy">Политика конфиденциальности</a><a class="btn" href="#terms">Условия использования</a></div>
      </div>
    </div>
  </section>`;
  $('#s-logout') && ($('#s-logout').onclick = () => { signOut(); toast('Вы вышли'); });
  $('#s-login') && ($('#s-login').onclick = openLogin);
  $('#s-save').onclick = () => {
    setLlmSettings({ apiKey: $('#s-key').value.trim(), model: $('#s-model').value.trim() || 'gemini-2.5-flash' });
    toast('Настройки сохранены');
  };
  $('#s-demo').onclick = (e) => addDemoDays(e.currentTarget, $('#demo-status'));
  $('#s-export').onclick = async () => {
    const files = [];
    for (const d of days) {
      const { zip } = await dayFolderZip(d);
      files.push({ name: `${d.date} ${safeName(d.title)}.zip`, data: zip });
    }
    download(await makeZip(files), 'дневник-атмосферы-экспорт.zip');
    toast('Экспорт готов');
  };
  $('#s-wipe').onclick = async () => {
    if (!(await confirmModal('Удалить все данные?', `Все ${days.length} ${plural(days.length, 'день', 'дня', 'дней')} этого дневника будут удалены без возможности восстановления. Сначала можно сделать экспорт.`, 'Удалить всё'))) return;
    await deleteAllDays();
    toast('Все данные удалены');
    route();
  };
}

function viewDoc(kind) {
  setNav('');
  app.innerHTML = `<article class="doc page">${kind === 'privacy' ? PRIVACY_HTML : TERMS_HTML}<p><a class="btn" href="javascript:history.back()">${icon('left', 16)}Назад</a></p></article>`;
}

// ================= Запуск =================
onAuthChange(async (u) => {
  applyUser();
  if (u) { toast(`Привет, ${u.givenName || u.name}!`); await offerMigration(); }
  route();
});

window.addEventListener('hashchange', route);
(async () => {
  applyUser();
  route();
  const h = location.hash;
  if (!h.startsWith('#privacy') && !h.startsWith('#terms')) await ensureConsent();
})();
