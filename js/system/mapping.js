// ВИЗУАЛЬНАЯ СИСТЕМА ДНЕВНИКА
// Здесь все правила «настроение дня → форма». Каждое решение возвращается вместе с
// объяснением, которое показывается в панели «Почему так?».

import { clamp, lerp, rgbToHsl, hslToRgb, round2, hashString } from '../util.js';

export const STYLES = {
  monet: {
    name: 'Моне · импрессионизм',
    reference: 'Клод Моне, «Впечатление. Восходящее солнце», «Кувшинки»',
    why: 'Мазки без чётких контуров и рассеянный свет передают расслабленное, тёплое состояние: границы предметов растворяются, как растворяется время в хороший спокойный день.',
  },
  minimal: {
    name: 'Ма · японский минимализм',
    reference: 'японская концепция «ма» (пустота как часть композиции), Хаммерсхёй, гравюры Хасуи Кавасэ',
    why: 'Пустое пространство и приглушённые цвета дают тишину. Грустный или одинокий день не нужно «раскрашивать» — ему нужен воздух.',
  },
  matisse: {
    name: 'Матисс · вырезки',
    reference: 'Анри Матисс, «Джаз» и поздние вырезки из бумаги',
    why: 'Плоские яркие формы и коллаж — это игра и лёгкость. Энергичный радостный день прыгает, как вырезанные из бумаги фигуры.',
  },
  kandinsky: {
    name: 'Кандинский · геометрия',
    reference: 'Василий Кандинский, «Композиция VIII», «Несколько кругов»',
    why: 'Острые углы, жёсткие линии и резкий ритм кадров передают напряжение, скорость и собранность: день, в котором всё на пределе.',
  },
};

export const FILM = {
  name: 'Плёнка',
  reference: 'плёночная фотография 70–90-х, Kodak Portra, засветки',
  why: 'Зерно, виньетка и засветки — визуальный язык «старой фотографии». Включается, когда день хочется сохранить навсегда или песня из прошлого.',
};

// Сводим оси текста, фото и музыки в общее настроение
export function combineMood(text, photo, music) {
  const t = text.axes;
  const major = music.mode === 'major' ? 1 : 0;
  const valence = clamp(0.62 * t.valence + 0.23 * (0.25 + 0.5 * major + 0.25 * music.brightness) + 0.15 * photo.brightness);
  const energy = clamp(0.5 * t.energy + 0.4 * music.energy + 0.1 * photo.saturation);
  const tension = clamp(t.tension + (music.mode === 'minor' && music.energy > 0.65 ? 0.15 : 0));
  const warmth = clamp(0.55 * t.warmth + 0.3 * (0.5 + photo.warmth / 2) + 0.15 * (major ? 0.65 : 0.4));
  const era = music.year ? music.year : null;
  const nostalgia = clamp(t.nostalgia + (era && era < 1995 ? 0.3 : 0) + (text.timeOfDay === 'evening' ? 0.08 : 0));
  return { valence, energy, tension, warmth, nostalgia, social: t.social };
}

export function chooseStyle(m) {
  if (m.tension > 0.5 || (m.energy > 0.62 && m.valence < 0.45)) return 'kandinsky';
  if (m.energy > 0.56 && m.valence >= 0.5) return 'matisse';
  if (m.valence < 0.44) return 'minimal';
  return 'monet';
}

// Сдвигаем палитру фото по правилам: теплота → оттенок, энергия → насыщенность,
// настроение → светлота. Фото остаётся основой цвета, система лишь «настраивает» его.
export function shapePalette(base, m, style) {
  const hueShift = (m.warmth - 0.5) * 36; // до ±18° к тёплому/холодному
  const satMul = lerp(0.55, 1.45, m.energy) * (style === 'minimal' ? 0.55 : 1);
  const lightShift = (m.valence - 0.5) * 0.18;
  return base.map((c) => {
    let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    // тёплый сдвиг тянет к оранжевому (30°), холодный — к синему (215°)
    const target = hueShift >= 0 ? 30 : 215;
    const d = ((target - h + 540) % 360) - 180;
    h += Math.sign(d) * Math.min(Math.abs(d), Math.abs(hueShift));
    s = clamp(s * satMul, 0.04, 0.95);
    l = clamp(l + lightShift, 0.08, 0.92);
    return hslToRgb(h, s, l);
  });
}

function paperColor(m, style) {
  // Бумага всегда светлая (постоянный элемент), но её тон чуть следует за днём
  if (style === 'kandinsky') return [232, 230, 224];
  if (style === 'minimal') return [238, 235, 229];
  return m.warmth > 0.55 ? [244, 236, 222] : [240, 237, 230];
}

export function buildParams({ text, photo, music, seedKey }) {
  const m = combineMood(text, photo, music);
  const style = chooseStyle(m);
  const film = m.nostalgia > 0.45 || (music.year && music.year < 1995);
  const palette = shapePalette(photo.palette, m, style);

  // Ритм: сколько долей держится один кадр
  const beatsPerSlide = m.energy > 0.72 ? 2 : m.energy > 0.5 ? 4 : m.energy > 0.3 ? 8 : 12;
  const bpm = clamp(music.bpm || 100, 50, 200);
  const slideSeconds = clamp((beatsPerSlide * 60) / bpm, 1.1, 9);

  const params = {
    style,
    film,
    palette,
    paper: paperColor(m, style),
    ink: [29, 27, 25],
    whitespace: round2(lerp(0.04, 0.26, 1 - m.energy) + (style === 'minimal' ? 0.12 : 0)),
    motion: round2(lerp(0.015, 0.085, m.energy)),
    transition: { monet: 'dissolve', minimal: 'fade', matisse: 'cut-shape', kandinsky: 'hard-cut' }[style],
    transitionSeconds: style === 'kandinsky' ? 0.08 : style === 'matisse' ? 0.35 : clamp(slideSeconds * 0.45, 0.8, 3.2),
    bpm,
    beatOffset: music.beatOffset || 0,
    beatsPerSlide,
    slideSeconds: round2(slideSeconds),
    beatPulse: round2(style === 'kandinsky' || style === 'matisse' ? lerp(0.2, 1, m.energy) : lerp(0, 0.25, m.energy)),
    grain: round2(film ? lerp(0.25, 0.6, m.nostalgia) : lerp(0.05, 0.16, 1 - m.energy)),
    strokeSize: round2(lerp(26, 9, m.energy)),
    contrast: round2(lerp(0.85, 1.35, Math.max(m.tension, m.energy * 0.8))),
    voice: {
      rate: round2(lerp(0.82, 1.12, m.energy)),
      pitch: round2(lerp(0.88, 1.1, m.valence)),
      volume: round2(lerp(0.75, 1, m.energy)),
      character: m.energy < 0.4 ? 'тихий и тёплый' : m.energy < 0.65 ? 'спокойный, разговорный' : 'живой и быстрый',
    },
    seed: hashString(seedKey || 'day'),
    mood: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round2(v)])),
  };
  params.explain = explain(params, m, text, photo, music);
  return params;
}

const pct = (v) => Math.round(v * 100) + '%';

function explain(p, m, text, photo, music) {
  const out = [];
  const S = STYLES[p.style];
  const moodWord = (v, lo, hi) => (v < 0.35 ? lo : v > 0.65 ? hi : 'средняя');

  out.push({
    factor: `Настроение: valence ${pct(m.valence)}, энергия ${pct(m.energy)}, напряжение ${pct(m.tension)}`,
    effect: `Приём «${S.name}». ${S.why}`,
  });
  out.push({
    factor: `Текст: ${text.source === 'rules' ? 'словарь настроений' : 'LLM + словарь'}` +
      (text.keywords ? ` (зацепки: ${[...(text.keywords.positive || []), ...(text.keywords.negative || []), ...(text.keywords.tension || [])].slice(0, 5).join(', ') || '—'})` : ''),
    effect: `Теплота дня ${pct(m.warmth)} → палитра сдвинута в ${m.warmth >= 0.5 ? 'тёплую (к охре)' : 'холодную (к синему)'} сторону.`,
  });
  out.push({
    factor: `Фото: ${photo.count} шт., яркость ${pct(photo.brightness)}, насыщенность ${pct(photo.saturation)}`,
    effect: `Цвета карточки взяты из самих фотографий (k-means), насыщенность ×${round2(lerp(0.55, 1.45, m.energy))} по энергии дня.`,
  });
  const musicSrc = music.source === 'audio' ? 'аудиоанализ файла' : 'описание песни';
  out.push({
    factor: `Музыка (${musicSrc}): ${music.bpm} BPM, ${music.mode === 'major' ? 'мажор' : 'минор'}${music.key && !music.modeGuessed ? ' ' + music.key : ''}${music.modeGuessed ? ' (лад неуверенный — взят из текста)' : ''}, энергия ${pct(music.energy)}`,
    effect: `Кадр держится ${p.beatsPerSlide} ${p.beatsPerSlide < 5 ? 'доли' : 'долей'} = ${p.slideSeconds} с. ${music.mode === 'minor' ? 'Минор приглушает светлоту.' : 'Мажор поднимает светлоту.'}`,
  });
  out.push({
    factor: `Энергия дня ${pct(m.energy)} (${moodWord(m.energy, 'низкая', 'высокая')})`,
    effect: `Воздух вокруг фото ${pct(p.whitespace)}, амплитуда движения ${pct(p.motion)}, переход «${p.transition}».`,
  });
  if (p.film) {
    out.push({
      factor: `Ностальгия ${pct(m.nostalgia)}${music.year ? `, песня ${music.year} года` : ''}`,
      effect: `Плёночный слой: зерно ${pct(p.grain)}, виньетка, засветка. ${FILM.why}`,
    });
  }
  out.push({
    factor: 'Озвучка',
    effect: `Голос ${p.voice.character}: скорость ${p.voice.rate}, высота ${p.voice.pitch}.`,
  });
  return out;
}
