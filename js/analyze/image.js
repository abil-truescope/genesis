// Анализ фотографий: доминирующие цвета (k-means), яркость, насыщенность, теплота.

import { rgbToHsl, colorWarmth, luminance, makeCanvas, mulberry32 } from '../util.js';

function samplePixels(img, max = 96) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  return px;
}

function kmeans(points, k, iters = 12, seed = 7) {
  const rnd = mulberry32(seed);
  let cents = [];
  // k-means++ инициализация
  cents.push(points[Math.floor(rnd() * points.length)]);
  while (cents.length < k) {
    const d2 = points.map((p) => Math.min(...cents.map((c) => dist2(p, c))));
    const sum = d2.reduce((a, b) => a + b, 0) || 1;
    let r = rnd() * sum, idx = 0;
    while (r > d2[idx] && idx < d2.length - 1) { r -= d2[idx]; idx++; }
    cents.push(points[idx]);
  }
  let counts = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const acc = cents.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of points) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const dd = dist2(p, cents[i]);
        if (dd < bd) { bd = dd; bi = i; }
      }
      acc[bi][0] += p[0]; acc[bi][1] += p[1]; acc[bi][2] += p[2];
      counts[bi]++;
    }
    cents = cents.map((c, i) => (counts[i] ? acc[i].map((v) => v / counts[i]) : c));
  }
  return cents.map((c, i) => ({ rgb: c, weight: counts[i] / points.length }));
}

function dist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

export async function analyzeImages(images) {
  let all = [];
  for (const img of images) all = all.concat(samplePixels(img));
  if (!all.length) {
    return { palette: [[200, 190, 175], [120, 110, 100]], brightness: 0.5, saturation: 0.3, warmth: 0, count: 0 };
  }
  const clusters = kmeans(all, 6).sort((a, b) => b.weight - a.weight);
  let lum = 0, sat = 0, warm = 0;
  for (const p of all) {
    const [, s, l] = rgbToHsl(p[0], p[1], p[2]);
    lum += luminance(p); sat += s * (1 - Math.abs(2 * l - 1)); warm += colorWarmth(p);
  }
  const n = all.length;
  return {
    palette: clusters.map((c) => c.rgb),
    weights: clusters.map((c) => c.weight),
    brightness: lum / n,
    saturation: Math.min(1, (sat / n) * 1.6),
    warmth: Math.max(-1, Math.min(1, (warm / n) * 3)),
    count: images.length,
  };
}
