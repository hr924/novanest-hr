// Minimal service worker — enables "Add to Home Screen" installability
// and caches the static app shell (HTML/CSS/JS) so the app still opens
// when offline. API requests (/api/...) always go straight to the network
// since that data must stay live.
//
// IMPORTANT: the shell is served network-first. Whenever the app is
// online, the browser always fetches the latest HTML/CSS/JS from the
// server (and refreshes the offline cache in the background) — it never
// silently keeps serving an old cached copy of admin.js/employee.js while
// online. The cache is only used as a fallback when the network request
// fails (i.e. genuinely offline).

const CACHE_NAME = 'novanest-hr-shell-v2';
const SHELL_FILES = [
  '/login.html',
  '/index.html',
  '/admin.html',
  '/employee.html',
  '/css/styles.css',
  '/js/common.js',
  '/js/admin.js',
  '/js/employee.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — always live data.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Only handle GET requests for our own origin.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Network-first: always try to get the latest file when online. Only
  // fall back to the cached copy if the network request actually fails.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
