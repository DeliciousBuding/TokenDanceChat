const CACHE_NAME = "tdchat-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
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

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Helper: is an API request?
function isApiRequest(url) {
  return url.pathname.startsWith("/ws") || url.pathname.startsWith("/api/");
}

// Helper: is a static asset?
function isStaticAsset(url) {
  return (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname === "/manifest.json"
  );
}

// Fetch: network-first for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // WebSocket requests: pass through
  if (url.pathname.startsWith("/ws")) return;

  // API requests: network-first
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match("/offline.html");
  }
}
