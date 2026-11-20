// Необязательный LLM-анализ (Google Gemini). Ключ хранится только в браузере
// пользователя. Если ключа нет или запрос упал — используется анализ по правилам.

import { clamp } from '../util.js';

const SETTINGS_KEY = 'artech-llm-settings';

export function getLlmSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { apiKey: '', model: 'gemini-2.5-flash' };
  } catch (e) {
    return { apiKey: '', model: 'gemini-2.5-flash' };
  }
}

export function setLlmSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage недоступен */ }
}

const PROMPT = (text, song) => `Ты — часть приложения «дневник атмосферы дня». Проанализируй запись пользователя и верни ТОЛЬКО JSON.

Запись дня:
"""${text}"""

Песня дня: ${song || 'не указана'}

Верни JSON со схемой:
{
  "valence": число 0..1 (0 — тяжело/грустно, 1 — радостно),
  "energy": число 0..1 (0 — тихо и медленно, 1 — насыщенно и быстро),
  "warmth": число 0..1 (0 — холодно/отстранённо, 1 — тепло/уютно/близко),
  "social": число 0..1 (0 — один, 1 — с людьми),
  "nostalgia": число 0..1 (насколько хочется запомнить, ощущение «навсегда»),
  "tension": число 0..1 (стресс, спешка, конфликт),
  "season": "autumn"|"winter"|"spring"|"summer",
  "timeOfDay": "morning"|"day"|"evening"|"night",
  "title": "название папки дня, 3-7 слов, по-русски, формула: время/сезон + место + деталь, без слов-эмоций (не 'грустный', не 'счастливый'), с заглавной буквы, без кавычек и точки. Примеры: 'Осенний парк и какао', 'Ночь в офисе перед сдачей'",
  "caption": "одна короткая строка-подпись до 90 символов, тёплая и конкретная, по мотивам текста, от первого лица",
  "song": { "genre": "одно слово латиницей: pop|rock|jazz|classical|electronic|hiphop|lofi|ambient|folk|rnb|metal|indie|soundtrack|kpop|other", "year": число или null, "bpm": примерный темп числом или null, "mode": "major"|"minor"|null, "energy": 0..1 или null }
}
Числа должны отражать именно этот день, не ставь везде 0.5.`;

export async function analyzeWithLlm(text, songDesc) {
  const { apiKey, model } = getLlmSettings();
  if (!apiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT(text, songDesc) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
      }),
    });
    if (!res.ok) throw new Error('LLM HTTP ' + res.status);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    const j = JSON.parse(raw.replace(/^```json|```$/g, '').trim());
    return sanitize(j);
  } catch (e) {
    console.warn('LLM недоступен, работаем по правилам:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n) : null;
}

function sanitize(j) {
  const words = String(j.title || '').replace(/["«».]/g, '').trim().split(/\s+/).filter(Boolean);
  return {
    source: 'llm',
    axes: {
      valence: num(j.valence), energy: num(j.energy), warmth: num(j.warmth),
      social: num(j.social), nostalgia: num(j.nostalgia), tension: num(j.tension),
    },
    season: ['autumn', 'winter', 'spring', 'summer'].includes(j.season) ? j.season : null,
    timeOfDay: ['morning', 'day', 'evening', 'night'].includes(j.timeOfDay) ? j.timeOfDay : null,
    title: words.length >= 3 ? words.slice(0, 7).join(' ') : null,
    caption: j.caption ? String(j.caption).slice(0, 100) : null,
    song: j.song && typeof j.song === 'object' ? {
      genre: j.song.genre || null,
      year: Number(j.song.year) || null,
      bpm: Number(j.song.bpm) || null,
      mode: ['major', 'minor'].includes(j.song.mode) ? j.song.mode : null,
      energy: num(j.song.energy),
    } : null,
  };
}

// Слияние: LLM уточняет правила (70/30), правила подстраховывают пустые поля.
export function mergeTextAnalysis(rules, llm) {
  if (!llm) return rules;
  const axes = {};
  for (const k of Object.keys(rules.axes)) {
    const l = llm.axes[k];
    axes[k] = l == null ? rules.axes[k] : clamp(l * 0.7 + rules.axes[k] * 0.3);
  }
  return {
    ...rules,
    source: 'llm+rules',
    axes,
    season: llm.season || rules.season,
    timeOfDay: llm.timeOfDay || rules.timeOfDay,
    title: llm.title || rules.title,
    caption: llm.caption || rules.caption,
    llmSong: llm.song,
  };
}
