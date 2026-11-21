// Художественные приёмы. Каждый стиль:
//   prepare(img, ctx) — один раз рисует «слой» фото (дорогие эффекты: мазки, постеризация)
//   overlay(g, frame) — каждый кадр рисует живые элементы поверх (геометрия, вырезки)

import { makeCanvas, mulberry32, rgbStr, luminance, rgbToHsl, hslToRgb, mixRgb, clamp } from '../util.js';

export function drawCover(ctx, img, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (w - dw) * fx, (h - dh) * fy, dw, dh);
}

function nearest(pal, r, g, b) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const c = pal[i];
    const d = (c[0] - r) ** 2 * 0.3 + (c[1] - g) ** 2 * 0.59 + (c[2] - b) ** 2 * 0.11;
    if (d < bd) { bd = d; bi = i; }
  }
  return pal[bi];
}

const byLum = (pal) => [...pal].sort((a, b) => luminance(a) - luminance(b));
export function accentOf(pal) {
  let best = pal[0], bs = -1;
  for (const c of pal) {
    const [, s, l] = rgbToHsl(c[0], c[1], c[2]);
    const sc = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}

// ---------------- МОНЕ ----------------
const monet = {
  prepare(img, W, H, p, i, variant) {
    const rnd = mulberry32(p.seed + i * 101 + variant * 7);
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const zoom = 1 + variant * 0.18;
    const fx = variant ? rnd() : 0.5, fy = variant ? rnd() : 0.5;
    drawCover(ctx, img, W, H, zoom, fx, fy);
    // резкая копия: в конце она проступит сквозь мазки, чтобы лица и детали читались
    const sharp = makeCanvas(W, H);
    sharp.getContext('2d').drawImage(c, 0, 0);
    const src = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => {
      const k = ((clamp(y | 0, 0, H - 1) * W) + clamp(x | 0, 0, W - 1)) * 4;
      return [src[k], src[k + 1], src[k + 2]];
    };
    // мягкая подложка
    ctx.filter = 'blur(6px) saturate(1.1)';
    ctx.drawImage(c, 0, 0);
    ctx.filter = 'none';
    ctx.lineCap = 'round';
    const pal = p.palette;
    // мазки мельче, чем раньше: крупные (до 26px) превращали фото в кашу.
    // Ограничение действует и для уже сохранённых дней.
    const base = clamp(p.strokeSize * 0.6, 6, 15);
    const passes = [[base, 1.0, 0.45], [base * 0.55, 1.4, 0.55]];
    for (const [size, density, alpha] of passes) {
      const n = Math.floor(((W * H) / (size * size)) * density);
      for (let s = 0; s < n; s++) {
        const x = rnd() * W, y = rnd() * H;
        const col = at(x, y);
        // направление мазка — поперёк градиента яркости, как кисть идёт вдоль формы
        const gx = luminance(at(x + 3, y)) - luminance(at(x - 3, y));
        const gy = luminance(at(x, y + 3)) - luminance(at(x, y - 3));
        const ang = Math.atan2(gy, gx) + Math.PI / 2 + (rnd() - 0.5) * 0.6;
        const len = size * (0.9 + rnd() * 0.9);
        const tinted = mixRgb(col, nearest(pal, ...col), 0.3);
        const [h, sa, l] = rgbToHsl(...tinted);
        const jit = hslToRgb(h + (rnd() - 0.5) * 18, clamp(sa * (1 + (rnd() - 0.3) * 0.4)), clamp(l + (rnd() - 0.5) * 0.08));
        ctx.strokeStyle = rgbStr(jit, alpha);
        ctx.lineWidth = size * (0.35 + rnd() * 0.25);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2);
        ctx.quadraticCurveTo(x + (rnd() - 0.5) * size * 0.4, y + (rnd() - 0.5) * size * 0.4,
          x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2);
        ctx.stroke();
      }
    }
    // оригинал сквозь краску: мазки остаются фактурой, но снимок узнаваем
    ctx.globalAlpha = 0.55;
    ctx.drawImage(sharp, 0, 0);
    ctx.globalAlpha = 1;
    // световое пятно: импрессионистский «воздух»
    const light = byLum(pal).pop();
    const gr = ctx.createRadialGradient(W * (0.3 + rnd() * 0.4), H * 0.3, 10, W * 0.5, H * 0.4, W * 0.8);
    gr.addColorStop(0, rgbStr(light, 0.35));
    gr.addColorStop(1, rgbStr(light, 0));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  },
  overlay(g, f) {
    // медленные блики, дышащие в такт
    const { ctx, X, Y, W, H, p, t, pulse } = f;
    const light = byLum(p.palette).pop();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let k = 0; k < 3; k++) {
      const x = X + W * (0.5 + 0.35 * Math.sin(t * 0.13 + k * 2.1));
      const y = Y + H * (0.4 + 0.25 * Math.cos(t * 0.11 + k * 1.7));
      const r = W * (0.18 + 0.05 * k) * (1 + pulse * 0.2);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgbStr(light, 0.12));
      gr.addColorStop(1, rgbStr(light, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(X, Y, W, H);
    }
    ctx.restore();
  },
};

// ---------------- МА (минимализм) ----------------
const minimal = {
  photoRect(W, H, p, i) {
    const rnd = mulberry32(p.seed + i * 13);
    const scale = clamp(0.78 - p.whitespace * 0.9, 0.42, 0.7);
    const pw = W * scale, ph = H * scale * 1.05;
    const left = rnd() < 0.5;
    const x = left ? W * 0.08 : W - pw - W * 0.08;
    const y = H * (0.1 + rnd() * 0.08);
    return { x, y, w: pw, h: ph };
  },
  prepare(img, W, H, p, i, variant) {
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    // «Ма» — пауза: фото всегда на одном месте и в одном кадрировании,
    // иначе при смене кадров одно и то же фото накладывается само на себя
    const r = this.photoRect(W, H, p, i);
    const pc = makeCanvas(Math.round(r.w), Math.round(r.h));
    const pctx = pc.getContext('2d');
    pctx.filter = 'saturate(0.35) contrast(0.9) brightness(1.06) sepia(0.08)';
    drawCover(pctx, img, pc.width, pc.height, 1, 0.5, 0.45);
    ctx.drawImage(pc, r.x, r.y);
    return c;
  },
  overlay(g, f) {
    const { ctx, X, Y, W, H, p, idx, photoI, t, title } = f;
    const r = this.photoRect(W, H, p, photoI ?? idx);
    ctx.save();
    // тонкая линия горизонта — единственная «деталь»
    ctx.strokeStyle = rgbStr(p.ink, 0.55);
    ctx.lineWidth = 1.5;
    const ly = Y + r.y + r.h + 46;
    const draw = clamp(t * 0.25, 0, 1);
    const lx0 = r.x < W / 2 ? X + r.x : X + W * 0.08;
    ctx.beginPath();
    ctx.moveTo(lx0, ly);
    ctx.lineTo(lx0 + (W * 0.84) * draw, ly);
    ctx.stroke();
    // печать-ханко: первая буква названия
    const sx = r.x < W / 2 ? X + W - 120 : X + 60;
    const sy = Y + r.y + 10;
    ctx.fillStyle = 'rgb(178,58,40)';
    ctx.globalAlpha = 0.88;
    ctx.fillRect(sx, sy, 58, 58);
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgbStr(p.paper);
    ctx.font = '600 38px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((title || '·').charAt(0), sx + 29, sy + 31);
    ctx.restore();
  },
};

// ---------------- МАТИСС ----------------
function blobPath(ctx, cx, cy, r, lobes, rnd, rot) {
  const pts = 64;
  const amps = Array.from({ length: lobes }, () => 0.15 + rnd() * 0.35);
  ctx.beginPath();
  for (let k = 0; k <= pts; k++) {
    const a = (k / pts) * Math.PI * 2;
    let rr = r;
    for (let j = 0; j < lobes; j++) rr += r * amps[j] * Math.sin(a * (j + 2) + j * 1.3) * 0.5;
    const x = cx + Math.cos(a + rot) * rr, y = cy + Math.sin(a + rot) * rr;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function starPath(ctx, cx, cy, r, n, rot) {
  ctx.beginPath();
  for (let k = 0; k <= n * 2; k++) {
    const a = rot + (k / (n * 2)) * Math.PI * 2;
    const rr = k % 2 ? r * 0.42 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const matisse = {
  prepare(img, W, H, p, i, variant) {
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.filter = 'blur(4px)';
    drawCover(ctx, img, W, H, 1 + variant * 0.2, 0.5, 0.5);
    ctx.filter = 'none';
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;
    // плоские цвета «из бумаги»: каждый пиксель — ближайший цвет палитры дня
    const pal = [...p.palette.slice(0, 5), p.paper];
    for (let k = 0; k < d.length; k += 4) {
      const c2 = nearest(pal, d[k], d[k + 1], d[k + 2]);
      d[k] = c2[0]; d[k + 1] = c2[1]; d[k + 2] = c2[2];
    }
    ctx.putImageData(im, 0, 0);
    return c;
  },
  overlay(g, f) {
    const { ctx, X, Y, W, H, p, beat, pulse } = f;
    const rnd = mulberry32(p.seed + 999);
    const pal = p.palette;
    const shapes = 7;
    ctx.save();
    for (let s = 0; s < shapes; s++) {
      const edge = rnd();
      // фигуры живут по краям окна, частично заходя на фото
      const cx = X + (edge < 0.5 ? (rnd() < 0.5 ? -0.02 : 1.02) * W : rnd() * W);
      const cy = Y + (edge >= 0.5 ? (rnd() < 0.5 ? -0.02 : 1.02) * H : rnd() * H);
      const r = W * (0.06 + rnd() * 0.08) * (1 + pulse * 0.12 * ((s % 2) ? 1 : -0.6));
      const rot = rnd() * 6 + Math.sin(beat * 0.25 + s) * 0.15;
      const col = pal[(s + 1) % pal.length];
      const kind = rnd();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 7; ctx.shadowBlur = 6;
      ctx.fillStyle = rgbStr(col);
      if (kind < 0.55) blobPath(ctx, cx, cy, r, 4, mulberry32(p.seed + s), rot);
      else starPath(ctx, cx, cy, r, 5 + (s % 3), rot);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ---------------- КАНДИНСКИЙ ----------------
const kandinsky = {
  prepare(img, W, H, p, i, variant) {
    const rnd = mulberry32(p.seed + i * 31 + variant);
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    drawCover(ctx, img, W, H, 1 + variant * 0.3, variant ? rnd() : 0.5, variant ? rnd() : 0.5);
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;
    const sorted = byLum(p.palette);
    const dark = mixRgb(sorted[0], [10, 14, 30], 0.55);
    const light = mixRgb(sorted[sorted.length - 1], [235, 238, 242], 0.4);
    const k = p.contrast * 1.25;
    // дуотон с высоким контрастом
    for (let q = 0; q < d.length; q += 4) {
      let l = (0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2]) / 255;
      l = clamp((l - 0.5) * k + 0.5);
      d[q] = dark[0] + (light[0] - dark[0]) * l;
      d[q + 1] = dark[1] + (light[1] - dark[1]) * l;
      d[q + 2] = dark[2] + (light[2] - dark[2]) * l;
    }
    ctx.putImageData(im, 0, 0);
    return c;
  },
  overlay(g, f) {
    const { ctx, X, Y, W, H, p, beat, pulse } = f;
    const rnd = mulberry32(p.seed + 4242);
    const pal = p.palette;
    const acc = accentOf(pal);
    ctx.save();
    ctx.beginPath();
    ctx.rect(X - 30, Y - 30, W + 60, H + 60);
    ctx.clip();
    // жёсткая сетка
    ctx.strokeStyle = rgbStr(p.ink, 0.85);
    ctx.lineWidth = 3;
    const bar = Math.floor(beat / 4);
    for (let k = 0; k < 6; k++) {
      const a = (rnd() - 0.5) * 1.4 + (bar % 2 ? 0.04 : -0.04);
      const cx = X + rnd() * W, cy = Y + rnd() * H;
      const L = W * (0.5 + rnd() * 0.7);
      ctx.lineWidth = k < 2 ? 6 : 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * L / 2, cy - Math.sin(a) * L / 2);
      ctx.lineTo(cx + Math.cos(a) * L / 2, cy + Math.sin(a) * L / 2);
      ctx.stroke();
    }
    // концентрические круги, пульсирующие на долю
    for (let k = 0; k < 3; k++) {
      const cx = X + W * (0.15 + rnd() * 0.7), cy = Y + H * (0.15 + rnd() * 0.7);
      const base = W * (0.05 + rnd() * 0.08) * (1 + pulse * 0.35 * (k === 0 ? 1 : 0.4));
      const rings = 2 + Math.floor(rnd() * 3);
      for (let r = rings; r >= 1; r--) {
        ctx.fillStyle = rgbStr(r === 1 ? acc : pal[(k + r) % pal.length], r === rings ? 0.75 : 0.95);
        ctx.beginPath();
        ctx.arc(cx, cy, base * (r / rings), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // треугольник и шахматный блок
    const tx = X + W * (0.6 + rnd() * 0.3), ty = Y + H * (0.1 + rnd() * 0.3);
    const ts = W * 0.12;
    ctx.fillStyle = rgbStr(p.ink, 0.9);
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx + ts, ty + ts * 1.3); ctx.lineTo(tx - ts * 0.4, ty + ts * 1.1);
    ctx.closePath(); ctx.fill();
    const bx = X + W * (0.05 + rnd() * 0.25), by = Y + H * (0.7 + rnd() * 0.2), cs = 18;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      ctx.fillStyle = (a + b + bar) % 2 ? rgbStr(p.ink) : rgbStr(acc);
      ctx.fillRect(bx + a * cs, by + b * cs, cs, cs);
    }
    ctx.restore();
    // толстая рамка — собранность
    ctx.strokeStyle = rgbStr(p.ink);
    ctx.lineWidth = 8;
    ctx.strokeRect(X, Y, W, H);
  },
};

export const STYLE_IMPL = { monet, minimal, matisse, kandinsky };

// ---------------- ПЛЁНКА (слой поверх любого стиля) ----------------
export function makeGrainTiles(n = 4, size = 256) {
  const tiles = [];
  for (let k = 0; k < n; k++) {
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(size, size);
    const rnd = mulberry32(1000 + k);
    for (let q = 0; q < im.data.length; q += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 110;
      im.data[q] = im.data[q + 1] = im.data[q + 2] = v;
      im.data[q + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    tiles.push(c);
  }
  return tiles;
}

export function filmOverlay(f, tiles, dateStamp) {
  const { ctx, X, Y, W, H, p, t, frameNo } = f;
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
  // засветка, медленно гуляющая по краю кадра
  const lx = X + W * (0.85 + 0.15 * Math.sin(t * 0.21));
  const ly = Y + H * (0.15 + 0.2 * Math.cos(t * 0.17));
  const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.55);
  gr.addColorStop(0, 'rgba(255,140,60,0.32)');
  gr.addColorStop(0.5, 'rgba(255,90,40,0.10)');
  gr.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gr; ctx.fillRect(X, Y, W, H);
  // виньетка
  ctx.globalCompositeOperation = 'multiply';
  const vg = ctx.createRadialGradient(X + W / 2, Y + H / 2, W * 0.35, X + W / 2, Y + H / 2, W * 0.78);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(1, 'rgba(120,100,90,1)');
  ctx.fillStyle = vg; ctx.fillRect(X, Y, W, H);
  // зерно
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = p.grain * 0.55;
  const tile = tiles[frameNo % tiles.length];
  const ox = (frameNo * 37) % 256, oy = (frameNo * 91) % 256;
  for (let x = X - ox; x < X + W; x += 256) for (let y = Y - oy; y < Y + H; y += 256) ctx.drawImage(tile, x, y);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // оранжевая дата как у мыльницы
  ctx.font = '500 30px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,150,50,0.92)';
  ctx.shadowColor = 'rgba(255,90,0,0.8)'; ctx.shadowBlur = 8;
  ctx.textAlign = 'right';
  ctx.fillText(dateStamp, X + W - 28, Y + H - 28);
  ctx.restore();
}
