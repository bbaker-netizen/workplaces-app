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
 * who, then hands off to /book/<slug>.
 *
 * Public — see middleware, where only /portal, /business-builder and
 * /home sit behind Clerk. It therefore runs under withSystemContext (no
 * session to scope by) and is explicit about the master org: a client
 * org with a coach-role user must never surface on the public page.
 */

import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { orgs, schedulingLinks, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingOption = {
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
};

type Builder = {
  userProfileId: string;
  builderName: string;
  options: BookingOption[];
};

/**
 * Every bookable Business Builder, with their discovery links.
 *
 * Only `discovery` links appear. A `bbs` link is shared in context with
 * an existing client and has no business on a public chooser, and an
 * `ad_hoc` link is by definition sent to one person.
 */
async function loadBuilders(): Promise<Builder[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];

    const rows = await tx
      .select({
        userProfileId: userProfiles.id,
        builderName: userProfiles.fullName,
        slug: schedulingLinks.slug,
        name: schedulingLinks.name,
        description: schedulingLinks.description,
        durationMinutes: schedulingLinks.durationMinutes,
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
          eq(schedulingLinks.meetingType, "discovery"),
        ),
      )
      .orderBy(asc(userProfiles.fullName), asc(schedulingLinks.name));

    const byBuilder = new Map<string, Builder>();
    for (const r of rows) {
      const existing = byBuilder.get(r.userProfileId);
      const option: BookingOption = {
        slug: r.slug,
        name: r.name,
        description: r.description,
        durationMinutes: r.durationMinutes,
      };
      if (existing) existing.options.push(option);
      else
        byBuilder.set(r.userProfileId, {
          userProfileId: r.userProfileId,
          builderName: r.builderName,
          options: [option],
        });
    }
    // Array.from rather than spread: this project's tsconfig target
    // predates downlevelIteration, so spreading a Map iterator is a
    // compile error that fails the whole build.
    return Array.from(byBuilder.values());
  });
}

export default async function BookingChooserPage() {
  const builders = await loadBuilders();

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
            Pick the Business Builder you would like to sit down with. If you
            have no preference, either one is the right answer.
          </p>
        </header>

        {builders.length === 0 ? (
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
          <ul className="space-y-4">
            {builders.map((b) => (
              <li
                key={b.userProfileId}
                className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden"
              >
                <div className="px-5 py-4 space-y-3">
                  <h2 className="font-bold text-foreground text-xl tracking-tight">
                    {b.builderName}
                  </h2>
                  <ul className="space-y-3">
                    {b.options.map((o) => (
                      <li key={o.slug} className="space-y-1">
                        <Link
                          href={`/book/${o.slug}`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
                        >
                          {o.name} · {o.durationMinutes} min
                        </Link>
                        {o.description && (
                          <p className="font-sans text-sm text-muted-foreground">
                            {o.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
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
