"use client";

/**
 * PageTransition — fires a 320ms fade-up every time the route path
 * changes so navigating between pages feels intentional rather than
 * stutter-flash. Uses `key={pathname}` to force the wrapper to
 * remount on each nav; the `.app-page-enter` CSS class restarts on
 * mount.
 *
 * State that should survive navigation (Clerk session, top loader,
 * service worker registrar) lives ABOVE this wrapper in the root
 * layout — only the page content remounts.
 *
 * `prefers-reduced-motion: reduce` collapses the animation to a
 * no-op via the matching media query in globals.css.
 */

import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="app-page-enter">
      {children}
    </div>
  );
}
