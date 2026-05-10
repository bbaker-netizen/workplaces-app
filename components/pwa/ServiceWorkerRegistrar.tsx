"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount. Mounted in the root layout
 * so every page kicks it off; the registration call is idempotent so
 * re-renders are harmless.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[sw] register failed:", err);
      });
  }, []);
  return null;
}
