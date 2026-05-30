/**
 * /portal/preview — coach entry into the client portal "preview" mode
 * (Route Handler). Sets the preview cookie the portal layout checks,
 * then redirects into the portal. Route Handler (not a page) because it
 * sets a cookie.
 */

import { cookies } from "next/headers";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  PORTAL_PREVIEW_COOKIE,
  SELECTED_ENGAGEMENT_COOKIE,
} from "@/lib/db/queries/engagements";
import { engagements } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

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

    // If no client is selected yet, default to the most recent engagement
    // so the preview shows a real client portal instead of "No engagement
    // yet". (Use the per-client "View portal" button to pick a specific
    // one.)
    const alreadySelected = cookies().get(SELECTED_ENGAGEMENT_COOKIE)?.value;
    if (!alreadySelected) {
      const [latest] = await withSystemContext(async (tx) =>
        tx
          .select({ slug: engagements.slug })
          .from(engagements)
          .orderBy(desc(engagements.createdAt))
          .limit(1),
      );
      if (latest?.slug) {
        res.cookies.set(SELECTED_ENGAGEMENT_COOKIE, latest.slug, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }
    }
  }
  return res;
}
