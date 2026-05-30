/**
 * /home — post-sign-in dispatcher (Route Handler).
 *
 * Where Clerk drops users after sign-in. Routes by role and, for
 * coaches, clears the client-context cookies on the way to the console.
 *
 * This MUST be a Route Handler (not a page): cookies can only be
 * modified in a Route Handler or Server Action, never during a Server
 * Component render. Clearing them in the old page.tsx render threw a
 * server-side exception for coach roles.
 */

import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  PORTAL_PREVIEW_COOKIE,
  SELECTED_ENGAGEMENT_COOKIE,
} from "@/lib/db/queries/engagements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = new URL(req.url);
  const profile = await ensureUserProfile();

  if (profile.status !== "ok") {
    return NextResponse.redirect(new URL("/no-invitation", base));
  }

  if (profile.role === "master_admin" || profile.role === "coach") {
    // Returning to your own console clears any client context.
    const res = NextResponse.redirect(new URL("/business-builder", base));
    res.cookies.delete(SELECTED_ENGAGEMENT_COOKIE);
    res.cookies.delete(PORTAL_PREVIEW_COOKIE);
    return res;
  }

  return NextResponse.redirect(new URL("/portal", base));
}
