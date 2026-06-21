"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Coach-preview freshness guard.
 *
 * The portal scopes its data to the selected-engagement cookie, but Next's
 * client Router Cache keys on the URL — so when a coach switches which
 * client they're previewing, a page segment cached under a previous client
 * can be served stale (banner says A&M while the page still shows
 * Impactica). Rendered only in preview mode (from app/portal/template.tsx,
 * which re-mounts on every navigation), this forces a server re-fetch of
 * the current route on arrival, rebinding the page to the live cookie.
 *
 * Scoped to coach preview only — real clients have a single engagement and
 * never switch, so they keep instant client-side navigation untouched.
 */
export function PreviewRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (refreshedFor.current === pathname) return;
    refreshedFor.current = pathname;
    router.refresh();
  }, [pathname, router]);

  return null;
}
