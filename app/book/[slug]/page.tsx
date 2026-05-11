/**
 * Public booking page.
 *
 * Phase 3.8. Visitor browses available slots from a scheduling_link
 * by slug, picks one, books with name + email. No auth needed.
 */

import { notFound } from "next/navigation";
import { listAvailableSlots } from "@/lib/actions/scheduling";
import { BookingForm } from "@/components/scheduling/BookingForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicBookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await listAvailableSlots(params.slug, 21);
  if (!result.ok) notFound();
  const { link, slots } = result.data;

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
        <BookingForm slug={params.slug} slots={slots} />
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground text-center">
          Workplaces · Build what compounds.
        </p>
      </div>
    </main>
  );
}
