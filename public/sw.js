/**
 * Service worker — DISABLED (self-removing kill switch).
 *
 * The previous offline service worker cached the app shell and kept
 * serving stale builds after deploys. We've removed offline caching. A
 * browser still running the old SW will, on its next update check, pick
 * up THIS version, which clears every cache and unregisters itself — so
 * the app serves directly from the network from then on. It never
 * intercepts requests (no fetch handler).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((c) => c.navigate(c.url));
      } catch {
        // best effort
      }
    })(),
  );
});
