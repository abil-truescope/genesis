# Использованные инструменты

**Написано командой** (без внешних библиотек в рантайме):
- словарь настроений на русском, генератор названий и подписей;
- k-means++ палитра;
- FFT, оценка темпа, фазы доли, энергии и лада (профили Крумхансла — Кесслер);
- визуальная система (правила и объяснения);
- рендер всех приёмов на Canvas 2D;
- zip-архиватор (store, CRC32);
- синтезатор демо-треков на Web Audio.

**Браузерные API:** Canvas 2D, Web Audio API (декодирование, анализатор, OfflineAudioContext),
Web Speech API (озвучка), MediaRecorder + captureStream (видео), IndexedDB (архив).

**Внешние ресурсы:**
- Google Fonts: Cormorant Garamond, Caveat, Inter, JetBrains Mono (лицензия OFL);
- Google Identity Services — вход через Google;
- embed-плееры Spotify, YouTube, Яндекс Музыки, Apple Music и SoundCloud — для песен по ссылке;
- *необязательно:* Google Gemini API для анализа текста (ключ пользователя хранится в его браузере).

**Разработка:** esbuild (сборка в один файл), Playwright + Chrome (e2e-тест `tools/smoke.py`).

**AI-ассистенты:** код прототипа частично написан с помощью Claude (Anthropic). Идея, правила системы и проверка — команда.
