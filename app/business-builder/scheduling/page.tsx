/**
 * /business-builder/scheduling — booking links.
 *
 * The last missing piece of Phase 3.8's booking flow. The table, the
 * public /book chooser and the /book/<slug> page have all shipped; until
 * now nothing could create the row they read, so the whole feature was
 * reachable only by writing SQL by hand.
 *
 * Every Business Builder manages their own links. A master_admin sees the
 * practice's and can create one on a teammate's behalf — which matters
 * because the link decides who a booked lead belongs to, and a teammate
 * who has not signed in yet cannot make their own.
 */

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BookingAttempts } from "@/components/scheduling/BookingAttempts";
import {
  BookingPageHealth,
  BookingPageHealthFallback,
} from "@/components/scheduling/BookingPageHealth";
import { listRecentBookingAttempts } from "@/lib/booking/attempts";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listManageableSchedulingLinks } from "@/lib/db/queries/scheduling-links";
import { listBusinessBuilders } from "@/lib/db/queries/user-profiles";
import { SchedulingLinksManager } from "@/components/scheduling/SchedulingLinksManager";

export const dynamic = "force-dynamic";

export default async function SchedulingSettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [view, builders] = await Promise.all([
    listManageableSchedulingLinks(),
    listBusinessBuilders(),
  ]);

  // Scoped to the links this Builder manages, so one Builder's funnel
  // does not appear in the other's console. `listManageableSchedulingLinks`
  // has already applied the own-book rule.
  const attempts = await listRecentBookingAttempts({
    linkIds: view.links.map((l) => l.id),
    sinceDays: 14,
  });

  // Resolved server-side rather than from window.location so the address
  // shown here is the one a prospect would actually receive — a link
  // copied off a preview deploy would point at the preview.
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com"
  ).replace(/\/+$/, "");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Booking links
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Your own Calendly. Each link is a public page where someone picks
          a time from the days and hours you set here. A discovery booking
          creates a lead in the pipeline owned by you, and every live
          discovery link is listed on{" "}
          <Link href="/book" className="underline hover:text-tbb-navy">
            the public booking page
          </Link>
          .
        </p>
      </header>

      <Suspense fallback={<BookingPageHealthFallback />}>
        {/* Streamed: the credential probe reaches Google when something
            is wrong, and the list of links must not wait on it. */}
        <BookingPageHealth links={view.links} />
      </Suspense>

      <SchedulingLinksManager
        links={view.links}
        scope={view.scope}
        builders={builders}
        currentUserProfileId={profile.userProfileId}
        canAssign={profile.role === "master_admin"}
        baseUrl={baseUrl}
      />

      <BookingAttempts attempts={attempts} />
    </main>
  );
}
