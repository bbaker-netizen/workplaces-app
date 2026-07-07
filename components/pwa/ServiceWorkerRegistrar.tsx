"use client";

import { useEffect } from "react";

/**
 * Service-worker CLEANUP (not registration).
 *
 * The old offline service worker repeatedly served stale, cached copies
 * of the app — hiding fresh deploys from returning browsers (it bit the
 * owner twice). Offline viewing wasn't worth that, so we no longer
 * register a caching SW at all. Instead, on every load we unregister any
 * existing caching service worker, wipe its caches, and reload once so the
 * page serves directly from the network from then on.
 *
 * Exception: the push-only worker (/push-sw.js) is left alone. It has no
 * fetch handler and no cache, so it can't serve a stale build — it only
 * exists to receive Web Push notifications while the tab is closed.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        // Only tear down NON-push workers (the old caching SW). The push
        // worker must survive so desktop notifications keep working.
        const stale = regs.filter((r) => {
          const url =
            r.active?.scriptURL ||
            r.waiting?.scriptURL ||
            r.installing?.scriptURL ||
            "";
          return !url.endsWith("/push-sw.js");
        });
        if (stale.length === 0) return; // nothing but the push worker — done
        await Promise.all(stale.map((r) => r.unregister()));
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        // Reload once (guarded) so the now-uncontrolled page fetches the
        // live version. Without the guard this could loop.
        if (!sessionStorage.getItem("tbb-sw-purged")) {
          sessionStorage.setItem("tbb-sw-purged", "1");
          window.location.reload();
        }
      } catch {
        // best effort — nothing to do on failure
      }
    })();
  }, []);
  return null;
}
