"use client";

/**
 * PageTransition — fires a 320ms fade-up every time the route path
 * changes so navigating between pages feels intentional rather than
 * stutter-flash. Uses `key={pathname}` to force the wrapper to
 * remount on each nav; the `.app-page-enter` CSS class restarts on
 * mount.
 *
 * IMPORTANT: Clerk's <SignIn /> / <SignUp /> components own their
 * own internal multi-step routing (e.g. /sign-in → /sign-in/factor-
 * one). If we re-key the wrapper on those internal navs, Clerk's
 * in-flight component state gets wiped mid-flow and the user sees
 * a client-side exception. So we explicitly skip the transition on
 * auth routes — pass the children through untouched.
 *
 * Same idea for /no-invitation (a Clerk-aware boundary page) and
 * any /sign/<token> document-signing flow where remounts would
 * lose typed-signature state.
 *
 * State that should survive navigation (Clerk session, top loader,
 * service worker registrar) lives ABOVE this wrapper in the root
 * layout — only the page content remounts when the transition runs.
 *
 * `prefers-reduced-motion: reduce` collapses the animation to a
 * no-op via the matching media query in globals.css.
 */

import { usePathname } from "next/navigation";

const SKIP_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/no-invitation",
  "/sign/", // public document-signing flow
];

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldSkip =
    !pathname || SKIP_PREFIXES.some((p) => pathname.startsWith(p));

  if (shouldSkip) {
    return <>{children}</>;
  }
  return (
    <div key={pathname} className="app-page-enter">
      {children}
    </div>
  );
}
