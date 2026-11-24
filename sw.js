// Минимальный Service Worker для PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Пока не кэшируем ничего, просто пропускаем запросы дальше
self.addEventListener('fetch', (event) => {
  // Ничего не делаем — запросы идут как обычно
});