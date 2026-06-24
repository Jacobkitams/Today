'use strict';

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `iuea-today-static-${CACHE_VERSION}`;
const API_CACHE = `iuea-today-api-${CACHE_VERSION}`;

const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');

const EXTERNAL_PRECACHE = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
  'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/chart.js',
];

const SHELL_ASSETS = [
  'index.html',
  'offline.html',
  'manifest.json',
  'assets/css/style.css',
  'assets/js/app.js',
  'assets/images/03c66843ee4a48f0aa4811a78f911497.jpg',
  'assets/images/048edd175c234412b2132be97206b25d.jpg',
  'assets/images/04ffe21aa3b44dd09fd52de5e0538854.jpg',
  'assets/images/098b76097209470f803723d3b84340bd.jpg',
  'assets/images/0bef470bfa034a91ac25f94945113bf2.jpg',
  'assets/images/0cbd336d090548ddbe2dc45cd4b42652.jpg',
  'assets/images/0e124dd1e6254d7e83ebf5bd9fe71302.jpg',
  'assets/images/142c50bcad344054839f3e03bea55362.jpg',
  'assets/images/153905207d8145778e28be0bc23dc953.jpg',
  'assets/images/1f61c2b9184040a6a5fedd1b18a35130.jpg',
  'assets/images/2917338d8cc844469d3b9b04bbbc3905.jpg',
  'assets/images/298acda08f004d3c934283d235f7b102.jpg',
  'assets/images/2bdcea84d4704908bbf6fe6c471e9596.jpeg',
  'assets/images/2e4e336e701c487ba3065f1f28a474fd.jpg',
  'assets/images/31508698077341fd85a0c887e186d71c.jpg',
  'assets/images/34a66ffb82be43198206aec08838646d.jpg',
  'assets/images/36cb6b03d1464832a493e8fd068ed2dd.jpg',
  'assets/images/38a128df680e4e1fa5b96c43236c046a.jpg',
  'assets/images/3a75bed7d11a45a5bce1df775cb14a33.jpg',
  'assets/images/3b3f18be7e8843e18b3cb3d0588df38e.jpg',
  'assets/images/3bde473fc5344ffc8682105a9d982e0f.jpg',
  'assets/images/4ba3285985694952be926998b7ee4d99.jpg',
  'assets/images/4f28f753599543b39c0f530e7323f6ea.jpg',
  'assets/images/52cceddd818c41c9a38ab98c75624ae0.jpg',
  'assets/images/568fe12ec0e848bc950ce5c6cddb26ec.jpg',
  'assets/images/5b24776388a34f02908a753e33e285be.jpg',
  'assets/images/5e7e74f5af284cd68714873ac86c36b4.jpg',
  'assets/images/60cf66c88139493bbbd6b57364bb80b9.jpg',
  'assets/images/618dc78e636b4c09bb87d544b6973f5b.jpg',
  'assets/images/6689a95703c4492fab5fe7362906bd74.jpg',
  'assets/images/69b8d2cd94d74a568df0d85dcebc0f67.jpg',
  'assets/images/69fc7d4976814fd5a640ee6999ac112b.jpg',
  'assets/images/6f5c58a4bb81460e99d732fe43169694.jpg',
  'assets/images/71bb685e3f254aa8a26c31b809a84052.jpg',
  'assets/images/73ab1b8880854097b98fb341681f3170.jpg',
  'assets/images/75b4e66060934aa9a24621f6582d1306.jpg',
  'assets/images/7b6a5fab49a2418e9e392391173ba093.jpg',
  'assets/images/7d4cb683828b4687b692362cc012af42.jpg',
  'assets/images/7df002d7d1d743b3b253b995910cdd76.jpg',
  'assets/images/80e7b36c4d94443eb2ee88dcb1ded90f.jpg',
  'assets/images/829c471fdd744c94884e4e2e211649a4.jpg',
  'assets/images/871b11e112a045dcbfb4e34cb7b50bb9.jpg',
  'assets/images/8789bead7bdc45e1b04b758adb2691f8.jpg',
  'assets/images/8c050a4007b04287a653e2e34bb1e895.jpg',
  'assets/images/9330eb4e3e6f4b54bfe9373bdd1a4b01.jpg',
  'assets/images/93428ab8178a45aa9242137eb6df4d3d.jpg',
  'assets/images/9a39287cc2404ea7b943e853f6271279.jpg',
  'assets/images/9c174d18fb774a1784d08e5fc7fce1b1.jpg',
  'assets/images/9c5a3312e23a49b8ad4648f87d4caac5.jpg',
  'assets/images/9dd0307caac946eaa4e0b08e1667a5e6.jpg',
  'assets/images/9e9f87f421984511ab5a0b0bd07ccb8b.jpg',
  'assets/images/9f6c3cfaf00c404495f773a2e97c5be4.jpg',
  'assets/images/a47ed88ff7f24d23906b8db1db3a0779.jpg',
  'assets/images/a866ed0d62b04454a75cd0299b59707a.jpeg',
  'assets/images/a90886417141418b922e2d4be6356d95.jpg',
  'assets/images/aa17451269c9474cade8f7a19b57f222.jpg',
  'assets/images/ab5221b6c8504dd88ab620f7426536a8.jpg',
  'assets/images/ae9ac812de9b41548de1bf8a6937f40c.jpg',
  'assets/images/b307847f8b7a400f947b5c9d99c427f2.jpg',
  'assets/images/b9b2d4153e46430a9700c6ed8becda04.jpg',
  'assets/images/baaed56cabe64c009b151a8946c88071.jpg',
  'assets/images/bbe51f1f119b4095a33a2cfc6b210127.jpg',
  'assets/images/c44cbd64fb694aabaca5a2ba0db4cdaa.jpg',
  'assets/images/ce6a6e497fd04d73a1164817c3d2418a.jpg',
  'assets/images/ce7dc55a1bb94a6a816a39f5988babbe.jpg',
  'assets/images/cf134e30e11248f09a0b6d52b7419b6e.jpg',
  'assets/images/cf891515d91d42a2aa87cbb945add8f2.jpg',
  'assets/images/d45bece82704465db20977e5bd1a2e7c.jpg',
  'assets/images/d4a416c6cdc1417380fa73d3e5c5bddc.jpg',
  'assets/images/dd27ddb7f1a24ff1af70bef7b1556e32.jpg',
  'assets/images/e39fac1701b942dbab987966481d9319.jpg',
  'assets/images/e3b6f0d9fd4a43daad7259e0092ddaae.jpg',
  'assets/images/e8dd2af01f8347fca0c3f8c019a9dc9d.jpg',
  'assets/images/ec817fbec5714c6888483228a10c9076.jpg',
  'assets/images/ee0ed861443e481eb4447cbe8d29b2ba.jpg',
  'assets/images/ee140ab3cc6e418ebf9a96d7646eae06.jpg',
  'assets/images/eed509bc1998496e892f8554a8bf8eaa.jpg',
  'assets/images/efd80ea1f0ab4b7ca13e23122bcdbfd7.jpg',
  'assets/images/f1a4632e46e040f797c7d22e7451a995.jpg',
  'assets/images/f48cfa764a4d419ba40bb31d8266bcc1.jpg',
  'assets/images/f7337adaae114308b55f54d15be31055.jpg',
  'assets/images/f9498d09cbc74135a51f387138c4f696.jpg',
  'assets/images/fc2ce1965d964c53a9aff3076c98e7cc.jpg',
  'assets/images/fdcf0a487cad44d8813a8bfb6d4a2644.jpg',
  'assets/images/iuea-logo.png',
];

function assetUrl(path) {
  return `${BASE}/${path.replace(/^\//, '')}`;
}

function isApiRequest(url) {
  return url.port === '8001';
}

function isHeroVideo(url) {
  return /\/uploads\/videos\//i.test(url.pathname);
}

function isStaticAsset(url) {
  if (!url.pathname.startsWith(BASE)) return false;
  const rel = url.pathname.slice(BASE.length);
  return rel.startsWith('/assets/') && !isHeroVideo(url);
}

function isExternalStatic(url) {
  const host = url.hostname;
  return host === 'fonts.googleapis.com'
    || host === 'fonts.gstatic.com'
    || host === 'unpkg.com'
    || host === 'cdn.jsdelivr.net';
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
}

async function precacheUrls(cache, urls) {
  await Promise.allSettled(
    urls.map((url) => cache.add(url).catch(() => undefined))
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request))
      || (await cache.match(assetUrl('index.html')))
      || (await cache.match(assetUrl('offline.html')));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const shellUrls = [
      assetUrl(''),
      assetUrl('/'),
      ...SHELL_ASSETS.map(assetUrl),
      ...EXTERNAL_PRECACHE,
    ];
    await precacheUrls(cache, shellUrls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, API_CACHE]);
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isHeroVideo(url)) return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url) || isExternalStatic(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});
