import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";

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
 * /business-builder, which rendered again from scratch. That's two full
 * page loads back-to-back on every coach sign-in. This dispatcher has no
 * heavy layout and runs one cached identity check before redirecting, so
 * coaches pay for exactly one dashboard render.
 *
 * It deliberately renders nothing — every path ends in a redirect.
 */
export default async function HomeDispatch() {
  const profile = await ensureUserProfile();

  if (profile.status !== "ok") {
    redirect("/no-invitation");
  }

  if (profile.role === "master_admin" || profile.role === "coach") {
    redirect("/business-builder");
  }

  redirect("/portal");
}
