const CACHE = 'farmsim-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/constants.js',
  './js/input.js',
  './js/save.js',
  './js/farm.js',
  './js/player.js',
  './js/game.js',
  './js/renderer.js',
  './js/ui.js',
  './js/iap.js',
  './js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
