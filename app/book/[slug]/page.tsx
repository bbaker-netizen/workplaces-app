/**
 * Public booking page.
 *
 * Phase 3.8. Visitor browses available slots from a scheduling_link
 * by slug, picks one, books with name + email. No auth needed.
 */

import { notFound } from "next/navigation";
import { listAvailableSlots } from "@/lib/actions/scheduling";
import { prepFor } from "@/lib/booking/meeting-types";
import { BookingForm } from "@/components/scheduling/BookingForm";
import { PrepRequirementNotice } from "@/components/scheduling/PrepRequirementNotice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicBookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await listAvailableSlots(params.slug, 21);
  if (!result.ok) notFound();
  const { link, slots, calendarReadable } = result.data;
  // What this offer requires of them before the meeting. Read from the
  // offer catalogue, not from the link's free-text description: it is
  // the point of "Where the money went", it has to be identical on both
  // Business Builders' pages, and a Builder rewriting their description
  // must not be able to delete it.
  const prep = prepFor(link.meetingType);

  return (
    <main className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Business Builder Portal · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            Book {link.name}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            {link.durationMinutes} minutes · Mountain Time
          </p>
          {link.description && (
            <p className="font-sans text-base text-muted-foreground">
              {link.description}
            </p>
          )}
        </header>
        {/* Above the picker, deliberately. Someone should know what this
            costs them in preparation before they spend time choosing a
            time for it. */}
        {prep && (
          <PrepRequirementNotice
            prep={prep}
            footnote="Your confirmation email says where to send them."
          />
        )}
        <BookingForm
          slug={params.slug}
          slots={slots}
          calendarReadable={calendarReadable}
        />
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground text-center">
          Workplaces · Build what compounds.
        </p>
      </div>
    </main>
  );
}
