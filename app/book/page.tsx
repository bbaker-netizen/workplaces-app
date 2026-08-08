/**
 * The practice's front door — one URL, every Business Builder.
 *
 * A personal calendar link used to BE the front door, which worked while
 * the practice was one person. With a second Business Builder it means
 * every booking lands on the same calendar whoever the prospect wanted,
 * and Google cannot fix it: appointment schedules take co-hosts, which
 * are people added to the same booking rather than alternatives to it,
 * and do not check a co-host's availability by default.
 *
 * So the chooser lives here rather than in a scheduling subscription.
 * The per-Builder booking pages, their availability rules, and the
 * prospect a booking creates all already exist. This page only decides
 * what and who, then hands off to /book/<slug>.
 *
 * ORDERED BY OFFER, NOT BY PERSON. It used to be one heading per
 * Business Builder with their links underneath, which was fine while
 * there was one thing to book: the only real question was who. With two
 * offers that reads as four near-identical buttons and asks the visitor
 * to compare across headings. What someone wants — half an hour to talk,
 * or ninety minutes in their own numbers — is the decision they can
 * actually make; who delivers it is the easier one, and both Builders
 * deliver both.
 *
 * Public — see middleware, where only /portal, /business-builder and
 * /home sit behind Clerk. It therefore runs under withSystemContext (no
 * session to scope by) and is explicit about the master org: a client
 * org with a coach-role user must never surface on the public page.
 */

import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  PUBLIC_MEETING_TYPES,
  PUBLIC_MEETING_TYPE_VALUES,
  type SchedulingMeetingType,
} from "@/lib/booking/meeting-types";
import { PrepRequirementNotice } from "@/components/scheduling/PrepRequirementNotice";
import { orgs, schedulingLinks, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BuilderOption = {
  slug: string;
  builderName: string;
  durationMinutes: number;
};

type Offer = {
  type: SchedulingMeetingType;
  heading: string;
  blurb: string;
  /** Which Business Builders currently take this offer. */
  builders: BuilderOption[];
};

/**
 * Every live PUBLIC link, grouped by what it sells.
 *
 * Only the public meeting types appear. A `bbs` link is shared in
 * context with an existing client and has no business on a public
 * chooser, and an `ad_hoc` link is by definition sent to one person.
 *
 * A Builder with only one of the two offers live simply appears under
 * that one — the two types are independent, so Jen can be taking
 * discovery calls while her second link is still switched off.
 */
async function loadOffers(): Promise<Offer[]> {
  const rows = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];

    return tx
      .select({
        meetingType: schedulingLinks.meetingType,
        slug: schedulingLinks.slug,
        durationMinutes: schedulingLinks.durationMinutes,
        builderName: userProfiles.fullName,
      })
      .from(schedulingLinks)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, schedulingLinks.coachUserProfileId),
      )
      .where(
        and(
          eq(schedulingLinks.orgId, master.id),
          eq(schedulingLinks.isActive, true),
          inArray(
            schedulingLinks.meetingType,
            // Spread to a mutable array: drizzle's inArray types its
            // second argument as T[], and the catalogue is readonly.
            [...PUBLIC_MEETING_TYPE_VALUES],
          ),
        ),
      )
      .orderBy(asc(userProfiles.fullName), asc(schedulingLinks.name));
  });

  return PUBLIC_MEETING_TYPES.map((def) => ({
    type: def.value,
    heading: def.publicHeading,
    blurb: def.publicBlurb,
    builders: rows
      .filter((r) => r.meetingType === def.value)
      .map((r) => ({
        slug: r.slug,
        builderName: r.builderName,
        durationMinutes: Number(r.durationMinutes),
      })),
    // An offer nobody currently takes is dropped rather than shown
    // empty — a heading with no way to book it is a dead end.
  })).filter((o) => o.builders.length > 0);
}

export default async function BookingChooserPage() {
  const offers = await loadOffers();

  return (
    <main className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            The Business Builders by Workplaces
          </p>
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            Book a conversation
          </h1>
          <p className="font-sans text-base text-muted-foreground">
            Pick what you want first, then who you would like to sit down
            with. If you have no preference on the second part, either one is
            the right answer.
          </p>
        </header>

        {offers.length === 0 ? (
          /* No active link is a configuration fault, not a dead end. Send
             the visitor somewhere a human reads rather than showing them
             an empty page and losing the enquiry. */
          <p className="font-sans text-base text-muted-foreground">
            Online booking is unavailable at the moment. Email{" "}
            <a
              className="underline"
              href="mailto:info@4workplaces.com?subject=Booking%20a%20conversation"
            >
              info@4workplaces.com
            </a>{" "}
            and we will find a time.
          </p>
        ) : (
          <ul className="space-y-6">
            {offers.map((offer) => {
              const def = PUBLIC_MEETING_TYPES.find(
                (d) => d.value === offer.type,
              );
              return (
                <li
                  key={offer.type}
                  className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden"
                >
                  <div className="px-5 py-5 space-y-4">
                    <div className="space-y-1.5">
                      <h2 className="font-bold text-foreground text-2xl tracking-tight">
                        {offer.heading}
                      </h2>
                      <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                        {/* Every link of a type is the same length in
                            practice; if two ever differ, say so rather
                            than quietly picking one. */}
                        {Array.from(
                          new Set(offer.builders.map((b) => b.durationMinutes)),
                        ).join(" or ")}{" "}
                        minutes · Mountain Time
                      </p>
                      <p className="font-sans text-base text-muted-foreground">
                        {offer.blurb}
                      </p>
                    </div>

                    {/* Stated before anyone picks a time, not after they
                        have committed to one. */}
                    {def?.prep && (
                      <PrepRequirementNotice
                        prep={def.prep}
                        footnote="Your confirmation email says where to send them."
                      />
                    )}

                    <div className="space-y-2 border-t border-tbb-line pt-4">
                      <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                        Book with
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {offer.builders.map((b) => (
                          <Link
                            key={b.slug}
                            href={`/book/${b.slug}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
                          >
                            {b.builderName}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground text-center">
          Mountain Time · Every conversation is on Google Meet unless we agree
          to meet in person.
        </p>
      </div>
    </main>
  );
}
