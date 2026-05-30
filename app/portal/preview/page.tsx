/**
 * /portal/preview — coach entry into the client portal "preview" mode.
 *
 * Sets the preview cookie the portal layout checks, then drops the coach
 * into the portal. Without going through here, a coach hitting any
 * /portal page is bounced back to their console (#7). Returning to the
 * console (/home) clears the cookie.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { PORTAL_PREVIEW_COOKIE } from "@/lib/db/queries/engagements";

export const dynamic = "force-dynamic";

export default async function PortalPreviewEntry() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    redirect("/no-invitation");
  }

  // Only coaches use preview. Anyone else just goes to their portal.
  if (profile.role === "master_admin" || profile.role === "coach") {
    cookies().set(PORTAL_PREVIEW_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Session-ish: clears on its own after a few hours even if they
      // forget to hit "My console". The console exit clears it sooner.
      maxAge: 60 * 60 * 6,
    });
  }

  redirect("/portal");
}
