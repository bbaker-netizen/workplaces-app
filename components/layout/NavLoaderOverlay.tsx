"use client";

/**
 * NavLoaderOverlay — squiggle feedback for any in-app navigation or
 * async action that takes longer than a beat.
 *
 * Two triggers:
 *
 *   1. Internal link click → spinner appears, clears when the new
 *      pathname mounts. Next.js loading.tsx only renders on slow
 *      server fetches; this fills the gap for cached/fast routes.
 *
 *   2. `data-tbb-async` button click → spinner appears with the
 *      label from `data-tbb-async-label` (or "Working…" by default),
 *      stays visible up to 8 seconds OR until pathname changes
 *      (whichever comes first). Used for sign-out, delete prospect,
 *      and anything else where the button kicks off a server action
 *      that might redirect.
 *
 *   3. window.showTbbPending(label?) — programmatic trigger any
 *      component can call. window.hideTbbPending() clears it. Useful
 *      for transitions started by useTransition() where we want the
 *      global feedback instead of (or in addition to) inline spinners.
 *
 * Event delegation on the document keeps it self-contained — no
 * context provider, no Link-component patching.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SquiggleSpinner } from "@/components/ui/SquiggleSpinner";

// Module-level setter so the global window helpers below can flip
// pending state from anywhere without a React context.
let externalSetter: ((label: string | null) => void) | null = null;

declare global {
  interface Window {
    showTbbPending?: (label?: string) => void;
    hideTbbPending?: () => void;
  }
}

export function NavLoaderOverlay() {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  // Expose the setter to the imperative window helpers, and to
  // closures inside the delegated event listeners.
  useEffect(() => {
    externalSetter = (label) => setPending(label);
    if (typeof window !== "undefined") {
      window.showTbbPending = (label = "Working…") => setPending(label);
      window.hideTbbPending = () => setPending(null);
    }
    return () => {
      externalSetter = null;
      if (typeof window !== "undefined") {
        delete window.showTbbPending;
        delete window.hideTbbPending;
      }
    };
  }, []);

  // Delegated click listener — handles both internal-link nav and
  // data-tbb-async buttons.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // New-tab / new-window combos should NOT trigger the spinner.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1) data-tbb-async button (or anything with the attribute).
      const asyncEl = target.closest<HTMLElement>("[data-tbb-async]");
      if (asyncEl) {
        const label =
          asyncEl.getAttribute("data-tbb-async-label") ?? "Working…";
        setPending(label);
        // Auto-clear after 8s as a safety net so a busted action
        // never leaves the overlay stuck.
        window.setTimeout(() => {
          setPending((cur) => (cur === label ? null : cur));
        }, 8000);
        return;
      }

      // 2) Internal link click.
      const a = target.closest("a");
      if (!a) return;
      if (a.target === "_blank") return;
      if (a.hasAttribute("download")) return;
      const rawHref = a.getAttribute("href");
      if (!rawHref) return;
      if (
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:")
      )
        return;
      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname) return;
      setPending("One sec…");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // When pathname changes, whatever was pending is done.
  useEffect(() => {
    setPending(null);
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="fixed bottom-6 right-6 z-[60] bg-white border border-tbb-line rounded-lg px-4 py-3 shadow-tbb-md app-rise pointer-events-none"
    >
      <SquiggleSpinner size={40} label={pending} />
    </div>
  );
}

/**
 * Programmatic trigger for components that aren't simple click → nav.
 * Safe to call from server-action wrappers, useTransition callbacks,
 * etc. No-op during SSR.
 */
export function showPendingFeedback(label = "Working…"): void {
  if (typeof window !== "undefined" && window.showTbbPending) {
    window.showTbbPending(label);
  } else if (externalSetter) {
    externalSetter(label);
  }
}

export function hidePendingFeedback(): void {
  if (typeof window !== "undefined" && window.hideTbbPending) {
    window.hideTbbPending();
  } else if (externalSetter) {
    externalSetter(null);
  }
}
