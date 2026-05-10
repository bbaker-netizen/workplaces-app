/**
 * Service worker — Phase 4.
 *
 * CLAUDE.md spec: "PWA from day one — manifest.json, service worker for
 * offline-friendly action item viewing."
 *
 * Strategy:
 *   - Network-first for HTML / API responses (fresh data wins).
 *   - Cache-first for static assets (icons, fonts, JS / CSS chunks).
 *   - Offline fallback for /portal/action-items and /portal so the
 *     client can read the last-cached state of their work even when
 *     they're at a job site without signal.
 *
 * Cache version is bumped via the CACHE_VERSION constant; old caches
 * are purged on `activate`.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `the-builder-static-${CACHE_VERSION}`;
const PAGE_CACHE = `the-builder-pages-${CACHE_VERSION}`;
const OFFLINE_FALLBACK = "/offline";

// Precache shell + icon + offline fallback. The Next.js app shell
// is served from chunks discovered at runtime; precaching is limited
// to truly stable resources.
const PRECACHE_URLS = ["/icon.svg", OFFLINE_FALLBACK];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Don't ever cache mutations or API auth.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/sign-in") ||
    url.pathname.startsWith("/sign-up")
  ) {
    return; // Pass through.
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest";

  if (isStatic) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // HTML / page navigations — network first with cache fallback.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstWithOfflineFallback(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}

async function networkFirstWithOfflineFallback(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_FALLBACK);
    if (offline) return offline;
    return new Response(
      "<h1>Offline</h1><p>The Builder is offline. Check back when you have signal.</p>",
      { status: 503, headers: { "Content-Type": "text/html" } },
    );
  }
}
