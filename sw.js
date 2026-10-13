const CACHE_PREFIX = 'orthoscribe-demo-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './controller.js', './ui.js', './domain.js', './data.js', './note-style.js',
  './config.js', './bridge.js', './recorder.js', './recorder-worklet.js', './pcm.js', './vault.js',
  './manifest.webmanifest', './assets/logo.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
];
const allowed = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Authorization') || !allowed.has(request.url)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const duplicate = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, duplicate)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
