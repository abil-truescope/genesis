// Сезонный фон сайта: зимой снег, весной лепестки и трава, летом солнце и море,
// осенью падающие листья. Сезон берётся из даты (сегодня, дата записи или дата дня).
// Фон тихий: полупрозрачный, за контентом, не ловит клики. Если в системе
// отключены анимации, рисуется один неподвижный кадр.

const KEY = 'artech-season-bg';
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export const SEASON_NAMES = { winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень' };

export function seasonOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const m = (isNaN(d) ? new Date() : d).getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export function seasonBgEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSeasonBgEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* приватный режим */ }
  if (on) start(); else stop();
}

let canvas = null, ctx = null, W = 0, H = 0, DPR = 1;
let season = null, parts = [], raf = 0, t0 = 0, fade = 0, running = false;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'season-bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  ctx = canvas.getContext('2d');
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (season) spawn();
    if (!raf) frame(performance.now());
  };
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (running) loop();
  });
  REDUCED?.addEventListener?.('change', () => running && loop());
  resize();
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function spawn() {
  const area = W * H;
  parts = [];
  if (season === 'winter') {
    const n = Math.round(Math.min(120, area / 14000));
    for (let i = 0; i < n; i++) {
      const z = rnd(0.35, 1);
      parts.push({ x: rnd(0, W), y: rnd(-H, H), r: 1.2 + z * 2.6, vy: 14 + z * 34, sw: rnd(0, 6.28), amp: rnd(8, 26), z });
    }
  } else if (season === 'autumn') {
    const n = Math.round(Math.min(34, area / 45000));
    const cols = ['#c8642f', '#d9932f', '#a8441f', '#c9a13a', '#8f5a2b'];
    for (let i = 0; i < n; i++) {
      const z = rnd(0.5, 1);
      parts.push({ x: rnd(0, W), y: rnd(-H, H), s: 7 + z * 9, vy: 22 + z * 30, sw: rnd(0, 6.28), amp: rnd(20, 60), rot: rnd(0, 6.28), vr: rnd(-1.4, 1.4), c: pick(cols), z });
    }
  } else if (season === 'spring') {
    const n = Math.round(Math.min(55, area / 24000));
    const cols = ['#f1b7c4', '#f6cfd8', '#e89aae', '#fbe3e8', '#f3c1a8'];
    for (let i = 0; i < n; i++) {
      const z = rnd(0.45, 1);
      parts.push({ x: rnd(0, W), y: rnd(-H, H), s: 4 + z * 5, vy: 14 + z * 20, sw: rnd(0, 6.28), amp: rnd(24, 70), rot: rnd(0, 6.28), vr: rnd(-2, 2), c: pick(cols), z });
    }
    // травинки вдоль низа экрана
    const blades = Math.round(W / 7);
    season_grass = [];
    for (let i = 0; i < blades; i++) season_grass.push({ x: (i / blades) * W + rnd(-3, 3), h: rnd(14, 46), ph: rnd(0, 6.28), c: pick(['#7fa35a', '#93b665', '#6c8f4a', '#a6c27a']) });
  } else if (season === 'summer') {
    const n = Math.round(Math.min(26, area / 60000));
    for (let i = 0; i < n; i++) parts.push({ x: rnd(0, W), y: rnd(0, H * 0.8), r: rnd(1, 2.6), ph: rnd(0, 6.28), vx: rnd(4, 12) });
  }
}
let season_grass = [];

function drawLeaf(p) {
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.rot * 1.3)));
  ctx.fillStyle = p.c;
  ctx.beginPath();
  ctx.moveTo(0, -p.s);
  ctx.quadraticCurveTo(p.s * 0.9, -p.s * 0.2, 0, p.s);
  ctx.quadraticCurveTo(-p.s * 0.9, -p.s * 0.2, 0, -p.s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,40,10,.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(0, p.s * 1.25); ctx.stroke();
  ctx.restore();
}

function drawPetal(p) {
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.rot);
  ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(p.rot * 1.7)));
  ctx.fillStyle = p.c;
  ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSummer(t) {
  // солнце в правом верхнем углу с медленными лучами
  const sx = W * 0.86, sy = Math.min(H * 0.14, 120), R = Math.min(W, H) * 0.06 + 22;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 4);
  g.addColorStop(0, 'rgba(255,214,120,.55)');
  g.addColorStop(0.25, 'rgba(255,200,110,.22)');
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.04);
  ctx.strokeStyle = 'rgba(240,170,70,.22)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const l1 = R * 1.25, l2 = R * (1.7 + 0.25 * Math.sin(t * 0.8 + i));
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * l1, Math.sin(a) * l1); ctx.lineTo(Math.cos(a) * l2, Math.sin(a) * l2); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(248,190,90,.45)';
  ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
  // блики в воздухе
  for (const p of parts) {
    ctx.fillStyle = `rgba(255,205,120,${0.25 + 0.25 * Math.sin(t * 1.5 + p.ph)})`;
    ctx.beginPath(); ctx.arc((p.x + t * p.vx) % (W + 20), p.y + Math.sin(t + p.ph) * 6, p.r, 0, Math.PI * 2); ctx.fill();
  }
  // пляж: песок и две волны внизу
  const base = H - Math.min(70, H * 0.09);
  ctx.fillStyle = 'rgba(232,206,160,.55)';
  ctx.fillRect(0, base + 26, W, H);
  const wave = (yOff, amp, k, speed, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, base + yOff + Math.sin(x * k + t * speed) * amp);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  wave(0, 5, 0.012, 0.9, 'rgba(120,180,200,.32)');
  wave(12, 4, 0.017, -0.7, 'rgba(150,200,214,.38)');
  ctx.fillStyle = 'rgba(236,214,172,.75)';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 12) ctx.lineTo(x, base + 30 + Math.sin(x * 0.006 + t * 0.4) * 3);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function drawGrass(t) {
  ctx.lineCap = 'round';
  for (const b of season_grass) {
    const sway = Math.sin(t * 1.1 + b.ph + b.x * 0.01) * (b.h * 0.18);
    ctx.strokeStyle = b.c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, H + 2);
    ctx.quadraticCurveTo(b.x + sway * 0.3, H - b.h * 0.5, b.x + sway, H - b.h); ctx.stroke();
  }
}

function step(dt, t) {
  for (const p of parts) {
    if (season === 'summer') continue;
    p.y += p.vy * dt;
    p.x += Math.sin(t * 0.7 + p.sw) * p.amp * dt * 0.6;
    if (p.rot !== undefined) p.rot += p.vr * dt;
    if (p.y > H + 20) { p.y = -20; p.x = rnd(0, W); }
    if (p.x > W + 20) p.x = -20; if (p.x < -20) p.x = W + 20;
  }
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = fade;
  if (season === 'winter') {
    for (const p of parts) {
      ctx.fillStyle = `rgba(150,170,196,${0.35 + p.z * 0.4})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    // лёгкий иней внизу
    const g = ctx.createLinearGradient(0, H - 90, 0, H);
    g.addColorStop(0, 'rgba(220,230,242,0)'); g.addColorStop(1, 'rgba(220,230,242,.6)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 90, W, 90);
  } else if (season === 'autumn') {
    ctx.globalAlpha = fade * 0.75;
    for (const p of parts) drawLeaf(p);
  } else if (season === 'spring') {
    ctx.globalAlpha = fade * 0.55;
    drawGrass(t);
    ctx.globalAlpha = fade * 0.8;
    for (const p of parts) drawPetal(p);
  } else if (season === 'summer') {
    drawSummer(t);
  }
  ctx.globalAlpha = 1;
}

let last = 0;
function frame(now) {
  const t = (now - t0) / 1000;
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  fade = Math.min(1, fade + dt * 1.5);
  if (!REDUCED?.matches) step(dt, t);
  draw(t);
}

function loop() {
  cancelAnimationFrame(raf);
  if (REDUCED?.matches) { fade = 1; frame(performance.now()); raf = 0; return; }
  const tick = (now) => { frame(now); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}

function start() {
  if (!season) season = seasonOf();
  ensureCanvas();
  canvas.hidden = false;
  running = true;
  loop();
}

function stop() {
  running = false;
  cancelAnimationFrame(raf); raf = 0;
  if (canvas) { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
}

// Показать сезон для даты (YYYY-MM-DD) или для сегодняшнего дня
export function setSeasonFor(dateStr) {
  const s = seasonOf(dateStr);
  document.documentElement.dataset.season = s;
  if (s !== season) {
    season = s; fade = 0; last = 0;
    if (canvas) spawn();
  }
  if (!seasonBgEnabled()) return stop();
  if (!t0) t0 = performance.now();
  if (!running) start();
  else if (REDUCED?.matches) loop();
}
