"use client";

/**
 * NavLoaderOverlay — bottom-right squiggle that pops the instant
 * any internal link is clicked, and clears when the destination
 * page actually mounts (pathname change).
 *
 * Next.js App Router's loading.tsx only renders when a server
 * data fetch is in flight, which means the squiggle never shows
 * for cached / fast routes. The user clicks, the new page mounts
 * a half-second later, and there's no visible feedback. This
 * overlay closes that gap: any internal nav click → squiggle
 * appears immediately, stays until the new pathname renders.
 *
 * Event delegation on the document keeps this self-contained —
 * no Link-component patching, no global context. Skips external
 * URLs, hash-only anchors, same-page links, target=_blank, and
 * modifier-key clicks (Ctrl/Cmd-click opens a new tab; we don't
 * want a stuck spinner in that case).
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SquiggleSpinner } from "@/components/ui/SquiggleSpinner";

export function NavLoaderOverlay() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // Listen for clicks on anything that looks like an in-app link.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // New-tab / new-window combos should NOT trigger the spinner.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return; // only primary-button clicks

      const target = e.target as HTMLElement | null;
      const a = target?.closest("a");
      if (!a) return;

      // target="_blank" / download / mailto / tel — not in-app nav.
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

      // Resolve relative → absolute so we can compare origin + path.
      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      // Same path = no nav.
      if (url.pathname === pathname) return;

      setPending(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // When pathname actually changes, the destination page has mounted.
  useEffect(() => {
    setPending(false);
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="fixed bottom-6 right-6 z-[60] bg-white border border-tbb-line rounded-lg px-4 py-3 shadow-tbb-md app-rise pointer-events-none"
    >
      <SquiggleSpinner size={40} label="One sec…" />
    </div>
  );
}
