"use client";

/**
 * "Portal home" chip in the persistent top bar. From any module page it's
 * a one-click link back to the portal dashboard. On the dashboard itself
 * it renders as the current location (non-clickable) so it doesn't look
 * like a broken link that "does nothing" when you're already home.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

const BASE =
  "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border";

export function PortalHomeLink() {
  const pathname = usePathname();
  const isHome = pathname === "/portal";

  if (isHome) {
    return (
      <span
        aria-current="page"
        className={`${BASE} border-tbb-line bg-tbb-cream-50 text-tbb-ink-3 cursor-default`}
      >
        <Home className="w-3.5 h-3.5" aria-hidden /> Portal home
      </span>
    );
  }

  return (
    <Link
      href="/portal"
      className={`${BASE} border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors`}
    >
      <Home className="w-3.5 h-3.5" aria-hidden /> Portal home
    </Link>
  );
}
