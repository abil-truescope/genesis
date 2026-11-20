// Озвучка записи синтезированным голосом (Web Speech API, бесплатно, офлайн в большинстве ОС).
// Голос выбирается правилами системы: скорость и высота зависят от энергии и настроения дня.

let speaking = false;

export function voiceAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(params) {
  const voices = speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
  if (!voices.length) return null;
  // Спокойные дни — предпочитаем «мягкие» голоса, если система их различает по имени
  const soft = /milena|alena|irina|svetlana|dariya|female|жен/i;
  const lively = /yuri|pavel|dmitry|male|муж/i;
  if (params.voice.rate < 0.95) return voices.find((v) => soft.test(v.name)) || voices[0];
  return voices.find((v) => lively.test(v.name)) || voices[voices.length - 1];
}

export function speak(text, params, onEnd) {
  if (!voiceAvailable()) return false;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ru-RU';
  const v = pickVoice(params);
  if (v) u.voice = v;
  u.rate = params.voice.rate;
  u.pitch = params.voice.pitch;
  u.volume = params.voice.volume;
  u.onend = () => { speaking = false; onEnd && onEnd(); };
  speaking = true;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (voiceAvailable()) speechSynthesis.cancel();
  speaking = false;
}

export const isSpeaking = () => speaking;
