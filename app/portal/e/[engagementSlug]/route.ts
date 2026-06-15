/**
 * /portal/e/[engagementSlug] — engagement-slug switcher (Route Handler).
 *
 * Sets the selected-engagement cookie then drops into /portal. Route
 * Handler (not a page) because it sets a cookie — doing that during a
 * Server Component render throws a server-side exception.
 *
 * Access: only callers who can see the engagement get the cookie set —
 * either it's their home engagement, or they're a coach role.
 */

import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getEngagementBySlug,
  PORTAL_PREVIEW_COOKIE,
  SELECTED_ENGAGEMENT_COOKIE,
} from "@/lib/db/queries/engagements";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { engagementSlug: string } },
) {
  const base = new URL(req.url);
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return NextResponse.redirect(new URL("/no-invitation", base));
  }

  const engagement = await getEngagementBySlug(params.engagementSlug);
  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";
  if (!engagement || (!isCoach && engagement.orgId !== profile.orgId)) {
    // Can't see it — just go to the portal/console without switching.
    return NextResponse.redirect(
      new URL(isCoach ? "/business-builder" : "/portal", base),
    );
  }

  const res = NextResponse.redirect(new URL("/portal", base));
  res.cookies.set(SELECTED_ENGAGEMENT_COOKIE, params.engagementSlug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // Coaches viewing a specific client's portal are entering preview mode
  // deliberately — set the preview cookie so the portal layout lets them
  // in (otherwise the coach-gate would bounce them straight back).
  if (isCoach) {
    res.cookies.set(PORTAL_PREVIEW_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // 30 days — a short expiry silently dropped preview mode mid-session
      // and bounced the coach to the console on the next action.
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
