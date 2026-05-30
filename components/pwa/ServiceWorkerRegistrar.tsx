"use client";

import { useEffect } from "react";

/**
 * Service-worker CLEANUP (not registration).
 *
 * The old offline service worker repeatedly served stale, cached copies
 * of the app — hiding fresh deploys from returning browsers (it bit the
 * owner twice). Offline viewing wasn't worth that, so we no longer
 * register a caching SW at all. Instead, on every load we unregister any
 * existing service worker, wipe its caches, and reload once so the page
 * serves directly from the network from then on.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length === 0) return; // already clean — nothing to do
        await Promise.all(regs.map((r) => r.unregister()));
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
