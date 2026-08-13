// bump CACHE_NAME ทุกครั้งที่แก้โค้ด (ไม่งั้นเบราว์เซอร์จะเสิร์ฟไฟล์เก่าจาก cache ต่อไปเรื่อยๆ)
const CACHE_NAME = 'condo-rental-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: เสิร์ฟจาก cache ทันทีถ้ามี (เร็ว, ใช้ offline ได้)
// พร้อมโหลดของใหม่จากเน็ตมาอัปเดต cache ไว้เบื้องหลังเสมอ
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
