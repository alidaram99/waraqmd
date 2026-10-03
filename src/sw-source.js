// Waraq service worker. Two jobs only:
//   1. Cache the app shell so it opens with no network at all (the whole
//      point of an offline-first "default app" — it must work on a plane,
//      or the moment a phone drops signal mid-share).
//   2. Receive share_target POSTs (Android "Share… -> Waraq") and stash the
//      shared file in a Cache entry the app page reads once it loads,
//      since a service worker intercepting share_target must itself answer
//      the POST with a Response — there is no way to just "let the browser
//      navigate normally" for a multipart/form-data POST.
//
// Bump CACHE_VERSION on every deploy that changes any precached file; the
// build script writes it from the git short SHA so a stale cache can never
// outlive a release the way a single human-remembered constant could.
const CACHE_VERSION = '__CACHE_VERSION__';
const SHELL_CACHE = `waraq-shell-${CACHE_VERSION}`;
const SHARE_CACHE = 'waraq-share-target';
const SHARE_TARGET_PATH = '/waraqmd/app/share-target/';

// Filled in by scripts/build.mjs — see its writeServiceWorker() doc comment
// for why these are two separate lists rather than one.
const CRITICAL_PRECACHE_URLS = /* __CRITICAL_PRECACHE_URLS__ */ [];
const BACKGROUND_PRECACHE_URLS = /* __BACKGROUND_PRECACHE_URLS__ */ [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(CRITICAL_PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .then(() =>
        // Best-effort, not blocking: each file is cached independently so
        // one failed fetch (or a slow connection on first install) can
        // never fail the install the way a missing critical file should.
        // This runs inside the same event.waitUntil(), so the browser
        // won't recycle the service worker mid-way through it.
        caches.open(SHELL_CACHE).then((cache) =>
          Promise.allSettled(
            BACKGROUND_PRECACHE_URLS.map((url) =>
              fetch(url).then((response) => {
                if (response.ok) return cache.put(url, response);
              }),
            ),
          ),
        ),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('waraq-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(event.request, url));
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Cache-first for anything already cached (which, after install finishes,
  // is effectively everything — see BACKGROUND_PRECACHE_URLS above). This
  // runtime-caching fallback mainly covers the rare case of a request
  // during the brief window between a page load and install's background
  // precache completing: fetched from the network once and saved into the
  // same shell cache, so the *next* time it's local either way. A failed
  // navigation falls back to the cached app shell so a deep link still
  // opens with no network at all.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && url.pathname.startsWith('/waraqmd/app/')) {
            const copy = response.clone();
            // event.waitUntil, not a bare un-awaited promise: without this,
            // the service worker is free to be torn down the instant the
            // response above is handed back to the page (event.respondWith
            // only waits for the RESPONSE, not for side effects after it),
            // which was silently dropping this cache write under real
            // concurrent load — found by an offline regression check (open
            // a file right after a fresh reload while offline): several of
            // esbuild's split chunks that app.js needs synchronously, not
            // only Mermaid's lazy ones, were fetched during the online
            // visit but never actually finished being cached, so the next
            // offline load got net::ERR_FAILED on them and the whole
            // preview silently rendered nothing.
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy)));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('/waraqmd/app/');
          return Response.error();
        });
    }),
  );
});

async function handleShareTarget(request, url) {
  try {
    const formData = await request.formData();
    const file = formData.get('files');
    const cache = await caches.open(SHARE_CACHE);
    if (file && typeof file.arrayBuffer === 'function') {
      const headers = new Headers({
        'content-type': file.type || 'text/plain',
        'x-waraq-filename': encodeURIComponent(file.name || 'shared.md'),
      });
      await cache.put('/waraqmd/app/pending-shared-file', new Response(await file.arrayBuffer(), { headers }));
    }
  } catch {
    // No usable file in the share payload — still redirect so the app opens
    // normally instead of the browser showing a raw POST-response error.
  }
  return Response.redirect(`${url.origin}/waraqmd/app/?shared=1`, 303);
}
