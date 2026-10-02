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

// Filled in by scripts/build.mjs with the real asset list for this build.
const PRECACHE_URLS = /* __PRECACHE_URLS__ */ [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
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

  // Cache-first for anything already cached. Anything else — notably the
  // on-demand Mermaid diagram-type chunks (mermaid lazy-loads a different
  // module per diagram type; see getMermaid() in app.js), which are
  // deliberately *not* in PRECACHE_URLS so a plain-text document never pays
  // for downloading them — is fetched from the network once and then saved
  // into the same shell cache, so the *second* time a given chunk is needed
  // (online or off) it is already local. A failed navigation falls back to
  // the cached app shell so a deep link still opens with no network at all.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && url.pathname.startsWith('/waraqmd/app/')) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
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
