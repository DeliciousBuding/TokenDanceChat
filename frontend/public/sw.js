const CACHE_NAME = "tdchat-v8";
const STATIC_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/tokendance-icon-rounded-192.png",
  "/tokendance-icon-rounded-512.png",
];

// Install: cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches and claim all clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all([
        ...keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        self.clients.claim(),
      ]);
    })
  );
});

// Helper: is an API request?
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

// Helper: is a static asset?
function isStaticAsset(url) {
  return (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname === "/manifest.json"
  );
}

function isNavigationRequest(request, url) {
  return (
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html")
  );
}

// Fetch: network-first for nav, network-only for API, stale-while-revalidate for static
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // WebSocket requests: pass through
  if (url.pathname.startsWith("/ws")) return;

  // App shell must be network-first so users do not keep running stale bundles.
  if (isNavigationRequest(event.request, url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // API requests may contain authenticated chat data. Never persist them in Cache Storage.
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: stale-while-revalidate (fast loads + auto-update)
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || caches.match("/offline.html"));

  return cached || fetchPromise;
}
