// Рендер «воспоминания дня»: карточка 4:5 (1080×1350) с постоянной сеткой дневника
// и переменной частью (стиль, палитра, ритм), которая зависит от дня.

import { makeCanvas, mulberry32, rgbStr, formatDateRu, clamp, smooth } from '../util.js';
import { STYLE_IMPL, makeGrainTiles, filmOverlay, accentOf } from './styles.js';
import { STYLES } from '../system/mapping.js';

export const CW = 1080, CH = 1350;
// Постоянная сетка (одинакова для всех дней — это и делает ленту цельной)
export const LAYOUT = {
  M: 64,
  header: 84,
  win: { x: 64, y: 136, w: 952, h: 896 },
  titleY: 1104,
  captionY: 1196,
  footerY: 1302,
};

let fontsReady = null;
export function ensureFonts() {
  if (fontsReady) return fontsReady;
  const loads = [
    '600 58px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"',
    '500 44px "Caveat"', '400 24px "JetBrains Mono"', '500 30px "JetBrains Mono"',
  ].map((f) => document.fonts?.load(f, 'Аб').catch(() => null));
  fontsReady = Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3500))]);
  return fontsReady;
}

function paperTexture(p) {
  const c = makeCanvas(CW, CH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = rgbStr(p.paper);
  ctx.fillRect(0, 0, CW, CH);
  const rnd = mulberry32(77); // одинаковая бумага для всех дней
  const im = ctx.getImageData(0, 0, CW, CH);
  for (let q = 0; q < im.data.length; q += 4) {
    const n = (rnd() - 0.5) * 14;
    im.data[q] += n; im.data[q + 1] += n; im.data[q + 2] += n;
  }
  ctx.putImageData(im, 0, 0);
  ctx.strokeStyle = 'rgba(120,100,80,0.05)';
  for (let k = 0; k < 220; k++) {
    const x = rnd() * CW, y = rnd() * CH, a = rnd() * Math.PI, l = 10 + rnd() * 40;
    ctx.lineWidth = 0.6 + rnd();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return c;
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur); cur = w;
      if (lines.length === maxLines) break;
    } else cur = test;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (cur && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

export class MemoryRenderer {
  constructor(canvas, day, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.day = day;
    this.p = day.params;
    this.images = images;
    this.layers = new Map();
    this.running = false;
    this.frameNo = 0;
    this.clockStart = performance.now();
    this.audioEl = null;
    this.analyser = null;
  }

  async prepare() {
    await ensureFonts();
    this.paper = paperTexture(this.p);
    this.grain = makeGrainTiles();
    // слайды: если фото мало, повторяем их с другим кадрированием (вариант)
    const n = Math.max(1, this.images.length);
    const total = Math.max(n, n === 1 ? 3 : n);
    this.slides = [];
    for (let s = 0; s < total; s++) this.slides.push({ i: s % n, v: Math.floor(s / n) });
    for (const sl of this.slides) this.layer(sl);
  }

  layer(sl) {
    const key = sl.i + ':' + sl.v;
    if (!this.layers.has(key)) {
      const { w, h } = LAYOUT.win;
      const impl = STYLE_IMPL[this.p.style];
      const img = this.images[sl.i];
      const c = img ? impl.prepare(img, w, h, this.p, sl.i, sl.v) : makeCanvas(w, h);
      this.layers.set(key, c);
    }
    return this.layers.get(key);
  }

  attachAudio(audioEl, analyser) {
    this.audioEl = audioEl;
    this.analyser = analyser;
    this.levelBuf = analyser ? new Uint8Array(analyser.fftSize) : null;
  }

  time() {
    if (this.audioEl && !this.audioEl.paused) return this.audioEl.currentTime;
    if (this.audioEl && this.audioEl.currentTime > 0) return this.audioEl.currentTime;
    return (performance.now() - this.clockStart) / 1000;
  }

  liveLevel() {
    if (!this.analyser || !this.audioEl || this.audioEl.paused) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let s = 0;
    for (let k = 0; k < this.levelBuf.length; k++) { const v = (this.levelBuf[k] - 128) / 128; s += v * v; }
    return clamp(Math.sqrt(s / this.levelBuf.length) * 3);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw(this.time());
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  restartClock() { this.clockStart = performance.now(); }

  draw(t) {
    const { ctx, p } = this;
    const { win } = LAYOUT;
    this.frameNo++;
    const bpm = p.bpm;
    const beat = Math.max(0, (t - (this.audioEl ? p.beatOffset : 0)) * bpm / 60);
    const beatFrac = beat - Math.floor(beat);
    const pulse = clamp(Math.exp(-beatFrac * 6) * p.beatPulse + this.liveLevel() * 0.5 * p.beatPulse);

    const slideLen = p.slideSeconds;
    const sIdx = Math.floor(t / slideLen);
    const sT = (t % slideLen) / slideLen; // 0..1 внутри кадра
    const cur = this.slides[sIdx % this.slides.length];
    const next = this.slides[(sIdx + 1) % this.slides.length];

    // 1. бумага (постоянная)
    ctx.drawImage(this.paper, 0, 0);

    // 2. окно фото
    ctx.save();
    ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
    const trSec = p.transitionSeconds;
    const trStart = 1 - trSec / slideLen;
    const drawLayer = (sl, localT, alpha, idx) => {
      const L = this.layer(sl);
      const dir = (idx % 2 ? 1 : -1);
      if (p.style === 'minimal') { // неподвижно: без наезда и сдвига
        ctx.globalAlpha = alpha; ctx.drawImage(L, win.x, win.y, win.w, win.h); ctx.globalAlpha = 1; return;
      }
      const z = 1 + p.motion * (p.style === 'minimal' ? 0.3 : 1) * smooth(localT) + (p.style === 'kandinsky' ? pulse * 0.012 : 0);
      const dx = dir * p.motion * win.w * 0.35 * (localT - 0.5);
      ctx.globalAlpha = alpha;
      ctx.drawImage(L, win.x + (win.w - win.w * z) / 2 + dx, win.y + (win.h - win.h * z) / 2, win.w * z, win.h * z);
      ctx.globalAlpha = 1;
    };
    drawLayer(cur, sT, 1, sIdx);
    if (this.slides.length > 1 && sT > trStart) {
      const k = (sT - trStart) / (1 - trStart);
      if (p.transition === 'dissolve' || p.transition === 'fade') {
        drawLayer(next, 0, smooth(k), sIdx + 1);
      } else if (p.transition === 'cut-shape') {
        // новый кадр появляется через растущую «вырезку»
        ctx.save();
        const rnd = mulberry32(p.seed + sIdx);
        const cx = win.x + win.w * (0.3 + rnd() * 0.4), cy = win.y + win.h * (0.3 + rnd() * 0.4);
        ctx.beginPath();
        const R = win.w * 1.2 * smooth(k);
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          const rr = R * (1 + 0.18 * Math.sin(ang * 5 + sIdx));
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.clip();
        drawLayer(next, 0, 1, sIdx + 1);
        ctx.restore();
      } else if (k > 0.5) {
        drawLayer(next, 0, 1, sIdx + 1); // жёсткая склейка
      }
    }
    ctx.restore();

    // 3. живые элементы стиля
    const f = {
      ctx, X: win.x, Y: win.y, W: win.w, H: win.h, p, t, beat, pulse, frameNo: this.frameNo,
      idx: cur.i + cur.v, photoI: cur.i, title: this.day.title,
    };
    if (p.style === 'minimal') { f.X = win.x; f.Y = win.y; }
    STYLE_IMPL[p.style].overlay(this, f);
    if (p.film) filmOverlay(f, this.grain, this.filmDate());

    // 4. текст и сетка дневника (постоянные)
    this.drawChrome(t, pulse);
  }

  filmDate() {
    const d = new Date(this.day.date);
    return `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, ' ')}`;
  }

  drawChrome(t, pulse) {
    const { ctx, p, day } = this;
    const { M, win } = LAYOUT;
    const ink = rgbStr(p.ink);
    const acc = accentOf(p.palette);
    ctx.save();
    // шапка: дата слева, номер страницы справа
    ctx.fillStyle = ink;
    ctx.font = '400 24px "JetBrains Mono", monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(formatDateRu(new Date(day.date)), M + 26, LAYOUT.header);
    ctx.fillStyle = rgbStr(acc);
    ctx.beginPath(); ctx.arc(M + 8, LAYOUT.header - 8, 8 * (1 + pulse * 0.4), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.fillText(`стр. ${String(day.pageNo || 1).padStart(2, '0')}`, CW - M, LAYOUT.header);
    ctx.strokeStyle = rgbStr(p.ink, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, LAYOUT.header + 22); ctx.lineTo(CW - M, LAYOUT.header + 22); ctx.stroke();

    // название папки — антиква
    ctx.textAlign = 'left';
    let size = 60;
    ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    while (ctx.measureText(day.title).width > win.w && size > 40) {
      size -= 2;
      ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    }
    const titleLines = wrapLines(ctx, day.title, win.w, 2);
    titleLines.forEach((l, k) => ctx.fillText(l, M, LAYOUT.titleY + k * size * 0.95));

    // подпись — «от руки», появляется постепенно
    ctx.font = '500 42px "Caveat", "Segoe Print", cursive';
    ctx.fillStyle = rgbStr(p.ink, 0.86);
    const capY = LAYOUT.captionY + (titleLines.length - 1) * 50;
    const capLines = wrapLines(ctx, day.caption, win.w, titleLines.length > 1 ? 1 : 2);
    const reveal = this.forceReveal ? 1 : clamp(t / 2.2);
    capLines.forEach((l, k) => {
      const part = l.slice(0, Math.ceil(l.length * clamp(reveal * capLines.length - k)));
      ctx.fillText(part, M, capY + k * 46);
    });

    // подвал: песня и приём
    ctx.font = '400 21px "JetBrains Mono", monospace';
    ctx.fillStyle = rgbStr(p.ink, 0.7);
    const s = day.song || {};
    const songLabel = s.artist || s.title ? `♪ ${[s.artist, s.title].filter(Boolean).join(' — ')}` : '♪ песня дня';
    ctx.textAlign = 'left';
    let label = songLabel;
    while (ctx.measureText(label).width > win.w * 0.62 && label.length > 6) label = label.slice(0, -2);
    if (label !== songLabel) label += '…';
    ctx.fillText(label, M, LAYOUT.footerY);
    ctx.textAlign = 'right';
    ctx.fillText(`${p.bpm} bpm · ${STYLES[p.style].name.split(' · ')[0].toLowerCase()}`, CW - M, LAYOUT.footerY);
    ctx.restore();
  }

  async snapshot(t = 1.6, w = 432) {
    this.forceReveal = true;
    this.draw(t);
    this.forceReveal = false;
    const c = makeCanvas(w, Math.round((w * CH) / CW));
    c.getContext('2d').drawImage(this.canvas, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  }
}
