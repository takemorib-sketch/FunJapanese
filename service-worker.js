// Service worker for offline support — caches the app shell (the static
// pages, picker UIs, and icons) on install so the site still opens
// without a network connection. Individual review pages are cached
// on-the-fly as you visit them (see the fetch handler below), since
// there's no fixed list of those — new ones get added over time as you
// upload more.

const CACHE_NAME = "jp-practice-v1";

// The static "shell" files that always exist and rarely change — these
// are pre-cached on install so the app opens offline immediately, even
// before the user has visited every page once.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./restaurant_browse.html",
  "./amazon_browse.html",
  "./deck.html",
  "./match_game.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old cache versions from previous deployments.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests for same-origin resources — let everything
  // else (e.g. cross-origin Google Fonts) pass through to the network
  // normally rather than trying to cache things this worker doesn't own.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Network-first for manifest.json files specifically, so newly
      // added review pages show up without waiting for a stale cached
      // manifest to expire — but still fall back to cache if offline.
      if (url.pathname.endsWith("manifest.json") && url.pathname !== "/manifest.json") {
        return fetch(event.request)
          .then((networkResponse) => {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            return networkResponse;
          })
          .catch(() => cachedResponse);
      }

      // Cache-first for everything else (HTML pages, images, the app
      // shell) — fast and works offline; falls back to network if not
      // yet cached, and caches the result for next time.
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          // Only cache successful, basic (same-origin) responses.
          if (networkResponse.ok && networkResponse.type === "basic") {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // No cache, no network — nothing more we can do for this request.
          return new Response("Offline and not yet cached.", {
            status: 503,
            statusText: "Offline",
          });
        });
    })
  );
});
