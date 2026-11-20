// Конвейер: ввод дня → анализ текста/фото/музыки → правила системы → воспоминание → папка дня.

import { analyzeText } from './analyze/text.js';
import { analyzeWithLlm, mergeTextAnalysis } from './analyze/llm.js';
import { analyzeImages } from './analyze/image.js';
import { decodeAudio, analyzeAudioBuffer, songFromDescription, parseSongLink, fetchSongMeta } from './analyze/audio.js';
import { buildParams } from './system/mapping.js';
import { MemoryRenderer, CW, CH } from './render/renderer.js';
import { saveDay, listDays } from './db.js';
import { uid, loadImageFromBlob, makeCanvas, canvasToBlob, round2 } from './util.js';

// Фото уменьшаем до 1600px — хватает для карточки и не раздувает хранилище
async function normalizePhoto(blob) {
  const img = await loadImageFromBlob(blob);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  if (k === 1 && blob.type === 'image/jpeg') return { blob, img };
  const c = makeCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const out = await canvasToBlob(c, 'image/jpeg', 0.88);
  return { blob: out, img: await loadImageFromBlob(out) };
}

export async function createDay(input, onStatus = () => {}) {
  const { date, text, song = {} } = input;
  if (!text || text.trim().length < 5) throw new Error('Напишите хотя бы пару слов о дне');
  if (!input.photos?.length) throw new Error('Добавьте минимум одно фото');
  if (!song.blob && !song.url && !song.artist && !song.title) throw new Error('Добавьте песню: ссылку, файл или хотя бы исполнителя');

  onStatus('Готовлю фотографии');
  const norm = [];
  for (const p of input.photos) norm.push(await normalizePhoto(p));
  const images = norm.map((n) => n.img);
  const photos = norm.map((n) => n.blob);

  if (song.url && !song.artist && !song.title) {
    const m = await fetchSongMeta(song.url).catch(() => null);
    if (m) { song.artist = m.artist; song.title = m.title; song.cover = song.cover || m.thumb; }
  }
  onStatus('Читаю текст дня');
  const songDesc = [song.artist, song.title, song.genre, song.year].filter(Boolean).join(', ');
  const rules = analyzeText(text, date);
  const llm = await analyzeWithLlm(text, songDesc);
  const textA = mergeTextAnalysis(rules, llm);
  const custom = (input.customTitle || '').trim().slice(0, 70);
  if (custom) textA.title = custom;

  onStatus('Извлекаю палитру из фото');
  const photoA = await analyzeImages(images);

  onStatus(song.blob ? 'Слушаю песню: темп, энергия, лад' : 'Разбираю описание песни', { palette: photoA.palette, title: textA.title });
  let musicA;
  if (song.blob) {
    try {
      const buf = await decodeAudio(song.blob);
      musicA = analyzeAudioBuffer(buf);
      musicA.year = Number(song.year) || textA.llmSong?.year || null;
      musicA.genre = song.genre || textA.llmSong?.genre || null;
      if (musicA.modeConfidence < 0.05) {
        // лад по аудио неуверенный — берём из настроения текста и честно это помечаем
        musicA.mode = textA.axes.valence >= 0.5 ? 'major' : 'minor';
        musicA.modeGuessed = true;
      }
      if (song.mood === 'sad') musicA.mode = 'minor';
      if (song.mood === 'happy') musicA.mode = 'major';
    } catch (e) {
      console.warn('Не удалось декодировать аудио', e);
      musicA = songFromDescription({ genre: song.genre, year: song.year, mood: song.mood, llmSong: textA.llmSong });
    }
  } else {
    musicA = songFromDescription({ genre: song.genre, year: song.year, mood: song.mood, llmSong: textA.llmSong });
  }

  onStatus('Применяю правила визуальной системы');
  const params = buildParams({ text: textA, photo: photoA, music: musicA, seedKey: date + text.slice(0, 40) });

  const existing = await listDays();
  const link = song.url ? parseSongLink(song.url) : null;
  const day = {
    id: uid(),
    createdAt: Date.now(),
    date,
    text,
    photos,
    pageNo: existing.length + 1,
    title: textA.title,
    caption: textA.caption,
    song: {
      // Чужую песню не храним: файл только анализируется. Сохраняем лишь свою запись
      // или трек со свободной лицензией (пользователь отмечает это сам).
      kind: song.blob && song.ownAudio ? 'file' : song.url ? 'link' : 'meta',
      blob: song.blob && song.ownAudio ? song.blob : null,
      analyzedFromFile: Boolean(song.blob),
      fileName: song.fileName || null,
      cover: song.cover || null,
      url: song.url || null,
      embed: link?.embed || null,
      service: link?.service || null,
      artist: song.artist || '',
      title: song.title || '',
      genre: song.genre || musicA.genre || '',
      year: song.year || musicA.year || '',
    },
    analysis: {
      text: { source: textA.source, axes: roundObj(textA.axes), season: textA.season, timeOfDay: textA.timeOfDay, keywords: textA.keywords },
      photo: { brightness: round2(photoA.brightness), saturation: round2(photoA.saturation), warmth: round2(photoA.warmth), palette: photoA.palette.map((c) => c.map(Math.round)) },
      music: roundObj(musicA),
    },
    params,
  };

  onStatus('Собираю воспоминание', { style: params.style, film: params.film, bpm: musicA.bpm, mood: params.mood, palette: params.palette });
  const canvas = makeCanvas(CW, CH);
  const r = new MemoryRenderer(canvas, day, images);
  await r.prepare();
  day.thumb = await r.snapshot(Math.min(params.slideSeconds * 0.4, 2.5));

  onStatus('Сохраняю папку дня');
  await saveDay(day);
  return day;
}

function roundObj(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) out[k] = typeof v === 'number' ? round2(v) : v;
  return out;
}
