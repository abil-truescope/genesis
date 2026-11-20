// Экспорт: видео воспоминания (WebM через MediaRecorder) и «папка дня» в .zip.

import { CW, CH } from './render/renderer.js';

export async function recordVideo(renderer, { seconds = 15, audioBlob = null, onProgress } = {}) {
  const canvas = renderer.canvas;
  const stream = canvas.captureStream(30);
  let audioCtx = null, audioEl = null;
  if (audioBlob) {
    audioCtx = new AudioContext();
    audioEl = new Audio(URL.createObjectURL(audioBlob));
    audioEl.crossOrigin = 'anonymous';
    const src = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Браузер не умеет записывать видео (нужен Chrome/Edge/Firefox)');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const wasRunning = renderer.running;
  renderer.stop();
  const prevAudio = renderer.audioEl;
  renderer.audioEl = audioEl;
  renderer.restartClock();
  if (audioEl) { audioEl.currentTime = 0; await audioEl.play().catch(() => {}); }
  rec.start(250);
  renderer.start();

  await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const el = (performance.now() - t0) / 1000;
      onProgress && onProgress(Math.min(1, el / seconds));
      if (el >= seconds) return resolve();
      setTimeout(tick, 200);
    };
    tick();
  });
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  renderer.stop();
  if (audioEl) audioEl.pause();
  if (audioCtx) audioCtx.close();
  renderer.audioEl = prevAudio;
  if (wasRunning) { renderer.restartClock(); renderer.start(); }
  return new Blob(chunks, { type: 'video/webm' });
}

// ---------- минимальный ZIP (без сжатия) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function makeZip(files) {
  // files: [{ name, data: Blob|string }]
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(await f.data.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 имена файлов
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export function safeName(s) {
  return String(s || 'день').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'день';
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export async function dayFolderZip(day, extra = {}) {
  const folder = safeName(day.title) + '/';
  const files = [];
  const s = day.song || {};
  files.push({ name: folder + 'запись.txt', data: `${day.title}\n${day.date}\n\n${day.text}\n` });
  day.photos.forEach((ph, k) => files.push({ name: `${folder}фото_${k + 1}.jpg`, data: ph }));
  const songTxt = [
    s.artist && `Исполнитель: ${s.artist}`, s.title && `Песня: ${s.title}`, s.genre && `Жанр: ${s.genre}`,
    s.year && `Год: ${s.year}`, s.url && `Ссылка: ${s.url}`, s.fileName && `Файл: ${s.fileName}`,
  ].filter(Boolean).join('\n');
  files.push({ name: folder + 'песня.txt', data: songTxt || 'песня не указана' });
  if (s.blob) files.push({ name: folder + 'песня_' + safeName(s.fileName || 'audio'), data: s.blob });
  if (day.thumb) files.push({ name: folder + 'обложка.jpg', data: day.thumb });
  if (extra.video) files.push({ name: folder + 'воспоминание.webm', data: extra.video });
  files.push({
    name: folder + 'система.json',
    data: JSON.stringify({ title: day.title, caption: day.caption, params: { ...day.params, palette: day.params.palette.map((c) => c.map(Math.round)) }, analysis: day.analysis }, null, 2),
  });
  return { zip: await makeZip(files), filename: safeName(day.title) + '.zip' };
}

export { CW, CH };
