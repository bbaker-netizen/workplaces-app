/**
 * /portal/preview — coach entry into the client portal "preview" mode
 * (Route Handler). Sets the preview cookie the portal layout checks,
 * then redirects into the portal. Route Handler (not a page) because it
 * sets a cookie.
 */

import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { PORTAL_PREVIEW_COOKIE } from "@/lib/db/queries/engagements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = new URL(req.url);
  const profile = await ensureUserProfile();

  if (profile.status !== "ok") {
    return NextResponse.redirect(new URL("/no-invitation", base));
  }

  const res = NextResponse.redirect(new URL("/portal", base));
  if (profile.role === "master_admin" || profile.role === "coach") {
    res.cookies.set(PORTAL_PREVIEW_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 6,
    });
  }
  return res;
}
