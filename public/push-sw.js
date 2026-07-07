/**
 * Push service worker — notifications ONLY.
 *
 * Deliberately has NO fetch handler and NO caching, so it can never serve a
 * stale build (the mistake the old offline SW made). It exists solely to
 * receive Web Push events and show/route notifications while the app's tab
 * is closed. The app's ServiceWorkerRegistrar leaves this worker alone
 * (it only unregisters the old caching worker).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "The Builder", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "The Builder";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/business-builder" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/business-builder";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })(),
  );
});
