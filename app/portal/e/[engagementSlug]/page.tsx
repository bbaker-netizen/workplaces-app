/**
 * Engagement-slug switcher — Phase 4. Per CLAUDE.md the file structure
 * is `/[engagementSlug]/modules/[moduleId]`. Rather than fork every
 * `/portal/*` route, this entry point sets a cookie identifying the
 * selected engagement and bounces to /portal. The existing route
 * resolver (getCurrentEngagement) honors the cookie.
 *
 * Auth: only callers who can see the engagement get the cookie set —
 * either it's their home engagement, or they're a Coach role.
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getEngagementBySlug,
  SELECTED_ENGAGEMENT_COOKIE,
} from "@/lib/db/queries/engagements";

export const dynamic = "force-dynamic";

export default async function SelectEngagementPage({
  params,
}: {
  params: { engagementSlug: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getEngagementBySlug(params.engagementSlug);
  if (!engagement) notFound();

  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";
  if (!isCoach && engagement.orgId !== profile.orgId) {
    notFound();
  }

  cookies().set(SELECTED_ENGAGEMENT_COOKIE, params.engagementSlug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect("/portal");
}
