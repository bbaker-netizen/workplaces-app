import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  PORTAL_PREVIEW_COOKIE,
  SELECTED_ENGAGEMENT_COOKIE,
} from "@/lib/db/queries/engagements";

/**
 * /home — post-sign-in dispatcher.
 *
 * This is where Clerk drops users after they sign in. It does the
 * minimum work needed to decide which home they belong on, then sends
 * them straight there:
 *
 *   - coaches / master_admin → /business-builder
 *   - everyone else          → /portal
 *
 * Why this route exists: before it, sign-in landed everyone on /portal.
 * A coach would render the entire client dashboard (its layout + every
 * card's database read) only for the page to then redirect them to
 * /business-builder, which rendered again from scratch. This dispatcher
 * has no heavy layout and runs one cached identity check before
 * redirecting, so coaches pay for exactly one dashboard render.
 *
 * It also doubles as the "back to my console" exit for coaches: landing
 * here clears the selected-engagement cookie. That cookie (set when a
 * coach opens a client's engagement) otherwise sticks for 30 days and
 * survives sign-out, which left coaches stuck "inside" a client and
 * unable to get back to their own admin view. Clearing it on every
 * sign-in / console return guarantees you always come back to yourself.
 *
 * It deliberately renders nothing — every path ends in a redirect.
 */

export const dynamic = "force-dynamic";

export default async function HomeDispatch() {
  const profile = await ensureUserProfile();

  if (profile.status !== "ok") {
    redirect("/no-invitation");
  }

  if (profile.role === "master_admin" || profile.role === "coach") {
    // Leaving any client's context — reset to your own. Clear both the
    // selected-engagement cookie and the portal-preview cookie so the
    // coach lands cleanly in their console.
    cookies().delete(SELECTED_ENGAGEMENT_COOKIE);
    cookies().delete(PORTAL_PREVIEW_COOKIE);
    redirect("/business-builder");
  }

  redirect("/portal");
}
