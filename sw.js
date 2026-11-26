/* 스틱맨 계산기 서비스워커 — 한 번 열면 오프라인에서도 동작 */
const CACHE = 'stickman-calc-v7';
const SHELL = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/calc.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // HTTP 캐시(깃허브 페이지는 10분)를 건너뛰고 이번 버전 파일을 확실히 받아 둔다.
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (res && res.ok) await cache.put(url, res);
          } catch (err) {
            /* 하나 못 받아도 설치는 계속(나머지는 첫 요청 때 채움) */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면(HTML)은 네트워크 우선 — 새로 배포한 내용이 첫 실행에 바로 보이게.
  // 네트워크가 없으면 캐시의 화면으로 연다(오프라인 동작 유지).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('./index.html'))
            .then((hit) => hit || new Response('', { status: 504, statusText: 'offline' })),
        ),
    );
    return;
  }

  // 나머지는 캐시 우선(계산기는 내용이 거의 바뀌지 않으니 빠르게), 없으면 네트워크
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'offline' }));
    }),
  );
});
