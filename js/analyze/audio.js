// Аудиоанализ своего файла прямо в браузере:
// темп (BPM), энергия (RMS), «яркость» (спектральный центроид), лад (мажор/минор
// по хроматическому профилю Крумхансла) и фаза первой доли для синхронизации кадров.

import { clamp } from '../util.js';

const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function corr(a, b) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export async function decodeAudio(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 44100, 44100);
  return await ctx.decodeAudioData(buf);
}

export function analyzeAudioBuffer(audio) {
  const sr0 = audio.sampleRate;
  // Сводим в моно
  const ch = audio.numberOfChannels;
  const len0 = audio.length;
  const mono0 = new Float32Array(len0);
  for (let c = 0; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < len0; i++) mono0[i] += d[i] / ch;
  }
  // Берём до 60 секунд из середины трека и понижаем частоту до ~11 кГц
  const step = Math.max(1, Math.round(sr0 / 11025));
  const sr = sr0 / step;
  const maxLen = Math.floor(60 * sr0);
  const start = len0 > maxLen ? Math.floor((len0 - maxLen) / 2) : 0;
  const end = Math.min(len0, start + maxLen);
  const n = Math.floor((end - start) / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = mono0[start + i * step];

  // --- энергия ---
  let sq = 0;
  for (let i = 0; i < n; i++) sq += x[i] * x[i];
  const rms = Math.sqrt(sq / Math.max(1, n));

  // --- огибающая атак (spectral flux по кадрам) + центроид + хрома ---
  const N = 1024, hop = 256;
  const frames = Math.max(0, Math.floor((n - N) / hop));
  const flux = new Float32Array(frames);
  const chroma = new Array(12).fill(0);
  let centroidSum = 0, centroidW = 0;
  let prev = new Float32Array(N / 2);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let fl = 0, num = 0, den = 0;
    const mag = new Float32Array(N / 2);
    for (let k = 1; k < N / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = m;
      const d = m - prev[k];
      if (d > 0) fl += d;
      const freq = (k * sr) / N;
      num += freq * m; den += m;
    }
    flux[f] = fl;
    prev = mag;
    if (den > 0) { centroidSum += num / den; centroidW++; }
  }
  const centroid = centroidW ? centroidSum / centroidW : 1500;

  // --- темп: автокорреляция огибающей в диапазоне 60–180 BPM ---
  const fps = sr / hop;
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, frames);
  const env = flux.map((v) => Math.max(0, v - mean));
  let bestBpm = 100, bestScore = -Infinity;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    const l0 = Math.floor(lag), fr = lag - l0;
    let s = 0;
    for (let i = 0; i + l0 + 1 < env.length; i++) {
      s += env[i] * (env[i + l0] * (1 - fr) + env[i + l0 + 1] * fr);
    }
    // Мягкий приоритет «удобных» темпов около 110 BPM против кратных ошибок
    s *= Math.exp(-((Math.log2(bpm / 110)) ** 2) / (2 * 0.9 ** 2));
    if (s > bestScore) { bestScore = s; bestBpm = bpm; }
  }
  // фаза: сдвиг, при котором сетка долей сильнее всего совпадает с атаками
  const period = (60 / bestBpm) * fps;
  let bestPhase = 0, bestPh = -Infinity;
  for (let p = 0; p < period; p += 1) {
    let s = 0;
    for (let t = p; t < env.length; t += period) s += env[Math.round(t)] || 0;
    if (s > bestPh) { bestPh = s; bestPhase = p; }
  }
  const beatOffset = start / sr0 + bestPhase / fps;

  // --- хрома: отдельный проход с окном 4096 (бин ≈2.7 Гц), чтобы различать полутона ---
  const NC = 4096, hopC = 2048;
  const winC = new Float32Array(NC).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NC - 1)));
  const reC = new Float32Array(NC), imC = new Float32Array(NC);
  for (let off = 0; off + NC < n; off += hopC) {
    for (let i = 0; i < NC; i++) { reC[i] = x[off + i] * winC[i]; imC[i] = 0; }
    fft(reC, imC);
    const frameChroma = new Array(12).fill(0);
    for (let k = 1; k < NC / 2; k++) {
      const freq = (k * sr) / NC;
      if (freq < 120 || freq > 2500) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const cents = Math.abs(midi - Math.round(midi));
      if (cents > 0.35) continue; // между нотами — шум
      frameChroma[((Math.round(midi) % 12) + 12) % 12] += Math.sqrt(reC[k] * reC[k] + imC[k] * imC[k]);
    }
    const fsum = frameChroma.reduce((a2, b2) => a2 + b2, 0) || 1;
    for (let q = 0; q < 12; q++) chroma[q] += frameChroma[q] / fsum; // каждый кадр с равным весом
  }

  // --- лад ---
  let bestMaj = -2, bestMin = -2, keyMaj = 0, keyMin = 0;
  for (let r = 0; r < 12; r++) {
    const rot = chroma.map((_, i) => chroma[(i + r) % 12]);
    const cM = corr(rot, MAJOR), cm = corr(rot, MINOR);
    if (cM > bestMaj) { bestMaj = cM; keyMaj = r; }
    if (cm > bestMin) { bestMin = cm; keyMin = r; }
  }
  const mode = bestMaj >= bestMin ? 'major' : 'minor';
  const key = mode === 'major' ? PITCHES[keyMaj] : PITCHES[keyMin] + 'm';

  // Плотность атак = «насколько много всего происходит»
  const onsetDensity = env.filter((v, i) => v > mean * 1.5 && v > (env[i - 1] || 0) && v >= (env[i + 1] || 0)).length / Math.max(1, frames / fps);

  const energy = clamp(0.55 * clamp((rms - 0.04) / 0.22) + 0.25 * clamp(onsetDensity / 6) + 0.2 * clamp((bestBpm - 70) / 90));

  return {
    source: 'audio',
    bpm: Math.round(bestBpm),
    beatOffset,
    rms,
    energy,
    brightness: clamp((centroid - 600) / 2400),
    mode,
    key,
    modeConfidence: Math.abs(bestMaj - bestMin),
    duration: audio.duration,
  };
}

// Описание песни без аудио: приоры по жанру и эпохе.
const GENRES = {
  classical: { bpm: 76, energy: 0.3, valence: 0.5, label: 'классика' },
  jazz: { bpm: 112, energy: 0.45, valence: 0.6, label: 'джаз' },
  lofi: { bpm: 80, energy: 0.25, valence: 0.5, label: 'lo-fi' },
  ambient: { bpm: 70, energy: 0.15, valence: 0.45, label: 'эмбиент' },
  pop: { bpm: 116, energy: 0.65, valence: 0.7, label: 'поп' },
  kpop: { bpm: 124, energy: 0.8, valence: 0.75, label: 'k-pop' },
  rock: { bpm: 128, energy: 0.8, valence: 0.55, label: 'рок' },
  indie: { bpm: 110, energy: 0.55, valence: 0.5, label: 'инди' },
  metal: { bpm: 150, energy: 0.95, valence: 0.3, label: 'метал' },
  electronic: { bpm: 126, energy: 0.8, valence: 0.5, label: 'электроника' },
  hiphop: { bpm: 92, energy: 0.7, valence: 0.5, label: 'хип-хоп' },
  rnb: { bpm: 90, energy: 0.5, valence: 0.55, label: 'R&B' },
  folk: { bpm: 100, energy: 0.4, valence: 0.55, label: 'фолк' },
  soundtrack: { bpm: 90, energy: 0.45, valence: 0.45, label: 'саундтрек' },
  other: { bpm: 105, energy: 0.5, valence: 0.5, label: 'другое' },
};
export const GENRE_LIST = Object.entries(GENRES).map(([k, v]) => [k, v.label]);

export function songFromDescription({ genre, year, mood, llmSong }) {
  const g = GENRES[genre] || GENRES[llmSong?.genre] || GENRES.other;
  const bpm = llmSong?.bpm || g.bpm;
  let energy = llmSong?.energy ?? g.energy;
  let mode = llmSong?.mode || (g.valence >= 0.5 ? 'major' : 'minor');
  // Пользователь может явно указать характер песни
  if (mood === 'calm') energy = Math.min(energy, 0.3);
  if (mood === 'drive') energy = Math.max(energy, 0.75);
  if (mood === 'sad') mode = 'minor';
  if (mood === 'happy') mode = 'major';
  return {
    source: llmSong ? 'description+llm' : 'description',
    bpm: Math.round(bpm), beatOffset: 0, energy, brightness: g.valence,
    mode, key: null, year: Number(year) || llmSong?.year || null, genre: genre || llmSong?.genre || 'other',
  };
}

// Распознаём ссылку на музыкальный сервис и строим embed для просмотра записи.
export function parseSongLink(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return { service: 'YouTube', embed: `https://www.youtube.com/embed/${u.pathname.slice(1)}` };
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return { service: 'YouTube', embed: `https://www.youtube.com/embed/${id}` };
    }
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/(track|album|playlist)\/([A-Za-z0-9]+)/);
      if (m) return { service: 'Spotify', embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
    }
    if (host.startsWith('music.yandex.')) {
      const m = u.pathname.match(/album\/(\d+)\/track\/(\d+)/);
      if (m) return { service: 'Яндекс Музыка', embed: `https://music.yandex.ru/iframe/#track/${m[2]}/${m[1]}` };
    }
    if (host === 'music.apple.com') return { service: 'Apple Music', embed: `https://embed.music.apple.com${u.pathname}${u.search}` };
    if (host === 'soundcloud.com') return { service: 'SoundCloud', embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}` };
    return { service: host, embed: null };
  } catch (e) {
    return null;
  }
}
