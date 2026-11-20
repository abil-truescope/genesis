// Демо-дни: процедурные «фото» и синтезированная музыка, чтобы прототип можно было
// проверить без своих файлов. В финальном демо замените их на свои фото и песню.

import { makeCanvas, mulberry32, canvasToBlob } from './util.js';

const W = 960, H = 1200;

function grad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function blob(ctx, x, y, r, color, rnd) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let a = 0; a <= 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    const rr = r * (0.75 + rnd() * 0.4);
    const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr * 0.85;
    a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.fill();
}

const SCENES = {
  park(ctx, rnd) {
    ctx.fillStyle = grad(ctx, 0, H, [[0, '#cfd8dc'], [0.45, '#f1e2c6'], [1, '#c98f4e']]);
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) {
      const x = rnd() * W, base = 640 + rnd() * 120;
      ctx.fillStyle = '#4b3527';
      ctx.fillRect(x - 10, base - 260, 20 + rnd() * 10, 420);
      for (let b = 0; b < 14; b++) {
        blob(ctx, x + (rnd() - 0.5) * 260, base - 300 + (rnd() - 0.5) * 220, 50 + rnd() * 60,
          ['#e0a030', '#d9822b', '#c4561f', '#f2c14e', '#b5651d'][Math.floor(rnd() * 5)], rnd);
      }
    }
    ctx.fillStyle = '#d7b77a';
    ctx.beginPath(); ctx.moveTo(W * 0.35, H); ctx.lineTo(W * 0.48, 760); ctx.lineTo(W * 0.56, 760); ctx.lineTo(W * 0.8, H); ctx.fill();
    for (let k = 0; k < 160; k++) blob(ctx, rnd() * W, 760 + rnd() * 440, 6 + rnd() * 8, ['#e8a33d', '#c9581f', '#f0c050'][k % 3], rnd);
    // две кружки какао
    ctx.fillStyle = '#f5efe6'; ctx.fillRect(380, 960, 90, 110); ctx.fillRect(500, 975, 90, 100);
    ctx.fillStyle = '#6b3e26'; ctx.fillRect(388, 966, 74, 14); ctx.fillRect(508, 981, 74, 14);
  },
  office(ctx, rnd) {
    ctx.fillStyle = grad(ctx, 0, H, [[0, '#0b1020'], [1, '#1b2338']]);
    ctx.fillRect(0, 0, W, H);
    // окно с ночным городом
    ctx.fillStyle = '#121a30'; ctx.fillRect(60, 80, 840, 520);
    for (let k = 0; k < 28; k++) {
      const bx = 60 + rnd() * 800, bw = 30 + rnd() * 70, bh = 120 + rnd() * 360;
      ctx.fillStyle = '#0a0f1e'; ctx.fillRect(bx, 600 - bh, bw, bh);
      for (let w = 0; w < 18; w++) {
        if (rnd() < 0.45) { ctx.fillStyle = rnd() < 0.7 ? '#f6d27a' : '#7fb4ff'; ctx.fillRect(bx + 4 + rnd() * (bw - 10), 600 - bh + 8 + rnd() * (bh - 16), 5, 7); }
      }
    }
    ctx.strokeStyle = '#2a3350'; ctx.lineWidth = 10; ctx.strokeRect(60, 80, 840, 520);
    ctx.beginPath(); ctx.moveTo(480, 80); ctx.lineTo(480, 600); ctx.stroke();
    // стол и монитор
    ctx.fillStyle = '#0e1424'; ctx.fillRect(0, 860, W, 340);
    const mg = ctx.createRadialGradient(480, 760, 20, 480, 760, 420);
    mg.addColorStop(0, 'rgba(80,140,255,0.45)'); mg.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 300, W, 900);
    ctx.fillStyle = '#1e5bd6'; ctx.fillRect(250, 640, 460, 280);
    ctx.fillStyle = '#0d1a33'; ctx.fillRect(262, 652, 436, 256);
    for (let l = 0; l < 14; l++) { ctx.fillStyle = ['#6fd3ff', '#ff6b9a', '#c3e88d', '#ffffff'][l % 4]; ctx.fillRect(280 + (l % 3) * 20, 668 + l * 17, 80 + rnd() * 260, 6); }
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(460, 920, 40, 50);
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(720, 900, 60, 80); // кружка
  },
  rain(ctx, rnd) {
    ctx.fillStyle = grad(ctx, 0, H, [[0, '#9aa7b0'], [1, '#56616b']]);
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) {
      const g = ctx.createRadialGradient(rnd() * W, 300 + rnd() * 500, 0, 0, 0, 0);
      ctx.fillStyle = `rgba(${200 + rnd() * 55},${180 + rnd() * 50},${120 + rnd() * 60},0.18)`;
      ctx.beginPath(); ctx.arc(rnd() * W, 250 + rnd() * 600, 20 + rnd() * 60, 0, 7); ctx.fill();
    }
    for (let k = 0; k < 700; k++) {
      const x = rnd() * W, y = rnd() * 950, r = 1 + rnd() * 4;
      ctx.fillStyle = 'rgba(230,240,245,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r, 0, 0, 7); ctx.fill();
      if (rnd() < 0.1) { ctx.strokeStyle = 'rgba(230,240,245,0.35)'; ctx.lineWidth = r * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 4, y + 30 + rnd() * 60); ctx.stroke(); }
    }
    ctx.fillStyle = '#e9e4da'; ctx.fillRect(0, 950, W, 250); // подоконник
    ctx.fillStyle = '#3b3f45'; ctx.fillRect(0, 0, 40, H); ctx.fillRect(W - 40, 0, 40, H); ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(600, 860, 110, 130);
    ctx.fillStyle = '#a3794f'; ctx.fillRect(608, 868, 94, 16);
    ctx.fillStyle = '#7b5a43'; ctx.fillRect(180, 930, 260, 40); ctx.fillStyle = '#c0b49c'; ctx.fillRect(190, 905, 240, 26);
  },
  gym(ctx, rnd) {
    ctx.fillStyle = grad(ctx, 0, H, [[0, '#2d3a8c'], [0.4, '#5a4fcf'], [0.41, '#e7a95b'], [1, '#c77a32']]);
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) { const g = ctx.createRadialGradient(80 + k * 110, 60, 0, 80 + k * 110, 60, 140); g.addColorStop(0, 'rgba(255,255,230,0.9)'); g.addColorStop(1, 'rgba(255,255,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300); }
    for (let k = 0; k < 120; k++) blob(ctx, rnd() * W, 300 + rnd() * 160, 14 + rnd() * 10, ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#ffffff'][k % 5], rnd);
    ctx.strokeStyle = '#fff6e5'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(W / 2, 900, 220, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(W, 700); ctx.stroke();
    ctx.fillStyle = '#f26b1d'; ctx.beginPath(); ctx.arc(640, 620, 70, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a1c0b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(640, 620, 70, 0, 7); ctx.moveTo(570, 620); ctx.lineTo(710, 620); ctx.moveTo(640, 550); ctx.lineTo(640, 690); ctx.stroke();
    for (let k = 0; k < 5; k++) { ctx.fillStyle = '#1b1b3a'; ctx.fillRect(140 + k * 150, 760 + (k % 2) * 30, 60, 260); ctx.beginPath(); ctx.arc(170 + k * 150, 730 + (k % 2) * 30, 34, 0, 7); ctx.fill(); }
  },
  sea(ctx, rnd) {
    ctx.fillStyle = grad(ctx, 0, 620, [[0, '#3b4a8a'], [0.5, '#e27d60'], [1, '#f6c177']]);
    ctx.fillRect(0, 0, W, 620);
    ctx.fillStyle = '#ffd89a'; ctx.beginPath(); ctx.arc(W * 0.6, 560, 90, 0, 7); ctx.fill();
    ctx.fillStyle = grad(ctx, 600, 880, [[0, '#d98466'], [1, '#2f4f6f']]);
    ctx.fillRect(0, 600, W, 280);
    for (let k = 0; k < 90; k++) { ctx.fillStyle = `rgba(255,${200 + rnd() * 40},150,${0.2 + rnd() * 0.4})`; ctx.fillRect(W * 0.6 - 120 + rnd() * 240 * (1 + k / 90), 620 + k * 3, 30 + rnd() * 90, 3); }
    ctx.fillStyle = grad(ctx, 880, H, [[0, '#c9a27a'], [1, '#8a6a4b']]);
    ctx.fillRect(0, 880, W, H - 880);
    for (let k = 0; k < 4; k++) { ctx.fillStyle = '#2b1d1a'; const x = 200 + k * 120; ctx.fillRect(x, 820 - (k % 2) * 20, 46, 160); ctx.beginPath(); ctx.arc(x + 23, 800 - (k % 2) * 20, 26, 0, 7); ctx.fill(); }
  },
};

async function scenePhotos(name, count, seed) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    SCENES[name](ctx, mulberry32(seed + k * 17));
    if (k > 0) { // второй кадр — другой ракурс того же места
      const c2 = makeCanvas(W, H);
      const x2 = c2.getContext('2d');
      x2.drawImage(c, -W * 0.18, -H * 0.12, W * 1.4, H * 1.4);
      out.push(await canvasToBlob(c2));
    } else out.push(await canvasToBlob(c));
  }
  return out;
}

// ---------- синтез простого трека, чтобы проверить аудиоанализ ----------
function encodeWav(buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  ws(36, 'data'); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  return new Blob([out.buffer], { type: 'audio/wav' });
}

export async function synthTrack({ bpm, minor, energy, seconds = 20, root = 57 }) {
  const sr = 22050;
  const ctx = new OfflineAudioContext(1, sr * seconds, sr);
  const master = ctx.createGain();
  master.gain.value = 0.35 + energy * 0.35;
  master.connect(ctx.destination);
  const beat = 60 / bpm;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // диатонические последовательности: мажор I–V–vi–IV, минор i–VI–VII–v
  const prog = minor
    ? [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]]
    : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  const noiseBuf = ctx.createBuffer(1, sr, sr);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const bars = Math.ceil(seconds / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const t0 = b * beat * 4;
    const chord = prog[b % 4];
    const r = root + chord[0];
    // аккорд-подушка (+ тоника сверху держит тональность)
    for (const iv of [...chord.map((c) => c - chord[0]), 12]) {
      const o = ctx.createOscillator();
      o.type = energy > 0.6 ? 'sawtooth' : 'triangle';
      o.frequency.value = hz(r + iv);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.2);
      g.gain.linearRampToValueAtTime(0.0, t0 + beat * 4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800 + energy * 2500;
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + beat * 4 + 0.05);
    }
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      // бочка на каждую долю
      const k = ctx.createOscillator(); const kg = ctx.createGain();
      k.frequency.setValueAtTime(140, tb); k.frequency.exponentialRampToValueAtTime(45, tb + 0.12);
      kg.gain.setValueAtTime(0.9 * (0.4 + energy * 0.6), tb); kg.gain.exponentialRampToValueAtTime(0.001, tb + 0.25);
      k.connect(kg); kg.connect(master); k.start(tb); k.stop(tb + 0.3);
      // бас
      const bs = ctx.createOscillator(); const bg = ctx.createGain();
      bs.type = 'sine'; bs.frequency.value = hz(r - 24);
      bg.gain.setValueAtTime(0.25, tb + beat * 0.5); bg.gain.exponentialRampToValueAtTime(0.001, tb + beat * 0.95);
      bs.connect(bg); bg.connect(master); bs.start(tb + beat * 0.5); bs.stop(tb + beat);
      // хэт на слабые доли — больше энергии, больше хэтов
      const hats = energy > 0.6 ? 4 : energy > 0.35 ? 2 : 0;
      for (let h = 0; h < hats; h++) {
        const th = tb + (h + 0.5) * (beat / Math.max(1, hats));
        const n = ctx.createBufferSource(); n.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const hg = ctx.createGain(); hg.gain.setValueAtTime(0.12, th); hg.gain.exponentialRampToValueAtTime(0.001, th + 0.05);
        n.connect(hp); hp.connect(hg); hg.connect(master); n.start(th); n.stop(th + 0.06);
      }
    }
  }
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

export const DEMO_DAYS = [
  {
    date: '2026-10-18', scene: 'park', photos: 3,
    text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали. Пахло мокрой листвой, и свет был такой мягкий. Хочу запомнить этот вечер навсегда.',
    song: { artist: 'Демо-трек', title: 'Осенний свинг (синтез)', genre: 'jazz', year: 1957, synth: { bpm: 92, minor: false, energy: 0.3 } },
  },
  {
    date: '2026-11-03', scene: 'office', photos: 2,
    text: 'Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка. Не спал до утра, нервы на пределе, дедлайн в 9:00. Сдали!',
    song: { artist: 'Демо-трек', title: 'Deadline (синтез)', genre: 'electronic', year: 2024, synth: { bpm: 128, minor: true, energy: 0.85 } },
  },
  {
    date: '2026-11-08', scene: 'rain', photos: 2,
    text: 'Сегодня одна. Дождь весь день, сидела дома с чаем и читала… Капли на окне, тихо. Немного грустно и пусто.',
    song: { artist: 'Демо-трек', title: 'Капли (синтез)', genre: 'ambient', year: 2019, synth: { bpm: 70, minor: true, energy: 0.15 } },
  },
  {
    date: '2026-11-12', scene: 'gym', photos: 2,
    text: 'Выиграли матч по баскетболу! Ребята орали, весь зал прыгал, потом всей командой ели пиццу. Это было круто!!',
    song: { artist: 'Демо-трек', title: 'Победа (синтез)', genre: 'pop', year: 2025, synth: { bpm: 120, minor: false, energy: 0.8 } },
  },
  {
    date: '2026-08-30', scene: 'sea', photos: 2,
    text: 'Последний вечер лета на море с семьёй. Закат, тёплый песок, папа жарил рыбу, мы смеялись. Никогда не забуду этот день.',
    song: { artist: 'Демо-трек', title: 'Песок (синтез)', genre: 'folk', year: 1985, synth: { bpm: 100, minor: false, energy: 0.4 } },
  },
];

export async function buildDemoInput(d, k) {
  const photos = await scenePhotos(d.scene, d.photos, 100 + k * 1000);
  const blob = await synthTrack({ ...d.song.synth, seconds: 20 });
  return {
    date: d.date,
    text: d.text,
    photos,
    song: { kind: 'file', ownAudio: true, blob, fileName: `demo-${d.scene}.wav`, artist: d.song.artist, title: d.song.title, genre: d.song.genre, year: d.song.year },
  };
}
