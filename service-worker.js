// Офлайн-оболочка: сначала сеть (свежая версия после деплоя), без сети — из кэша.
// Supabase, oEmbed, YouTube и прочие чужие адреса не трогаем: их запросы идут мимо воркера.
const CACHE = 'atmosfera-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/ui.js', 'js/util.js', 'js/db.js', 'js/config.js', 'js/pipeline.js', 'js/datepicker.js',
  'js/season-bg.js', 'js/privacy.js', 'js/voice.js', 'js/export.js', 'js/demo.js', 'js/auth.js', 'js/cloud.js',
  'js/vendor/supabase.js', 'js/analyze/audio.js', 'js/analyze/image.js', 'js/analyze/llm.js', 'js/analyze/text.js',
  'js/system/mapping.js', 'js/render/renderer.js', 'js/render/styles.js',
];
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONTS.includes(url.origin)) {
    // шрифты не меняются: из кэша, при первом запросе — сохранить
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
