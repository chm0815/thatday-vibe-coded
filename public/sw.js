const CACHE_NAME = "thatday-v5";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/login.html",
  "/confirm.html",
  "/style.css",
  "/app.js",
  "/dist/flatpickr.min.css",
  "/dist/flatpickr.min.js",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
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

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Photos: cache-first (immutable UUIDs, already cached aggressively by the server)
  // Strip auth token from cache key so photos don't re-cache after token refresh
  if (url.pathname.startsWith("/uploads/")) {
    const cacheUrl = new URL(url);
    cacheUrl.searchParams.delete("token");
    const cacheKey = new Request(cacheUrl.toString());
    event.respondWith(cacheFirstWithKey(request, cacheKey));
    return;
  }

  // API calls: network-first, fall back to cached response
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (HTML, CSS, JS): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Cache-first: return from cache if available, otherwise fetch and cache
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
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

// Cache-first with a separate cache key (used for photos to strip auth tokens)
async function cacheFirstWithKey(request, cacheKey) {
  const cached = await caches.match(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

// Network-first: try network, fall back to cache
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
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "You are offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Stale-while-revalidate: return cache immediately, update in background
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
    .catch(() => cached);

  return cached || fetchPromise;
}
