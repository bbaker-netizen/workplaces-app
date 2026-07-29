/**
 * Public availability page — the link in the onboarding email.
 *
 * No Clerk session: clients have no login, and the token is the auth, the
 * same standard as /sign/[token]. This is what replaced the Google Form, and
 * the reason it's worth having in-house is that the answer lands on the
 * client's record instead of in someone's inbox to be re-keyed.
 */

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { availabilityRequests } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { AvailabilityGridForm } from "@/components/scheduling/AvailabilityGridForm";
import {
  describeSlots,
  sanitizeSlots,
} from "@/lib/scheduling/availability-grid";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({
  params,
}: {
  params: { token: string };
}) {
  const req = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(availabilityRequests)
      .where(eq(availabilityRequests.publicToken, params.token))
      .limit(1);
    return row ?? null;
  });
  if (!req) notFound();

  const alreadyDone = Boolean(req.submittedAt);
  const slots = sanitizeSlots(req.slots);

  return (
    <main className="min-h-screen bg-tbb-cream px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue">
            The Builder · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-3xl tracking-tight leading-none">
            When can you meet?
          </h1>
          <p className="font-sans text-sm text-tbb-ink-2">
            We run two Business Building sessions a month, two hours each.
            Tell us which windows work and we&apos;ll build the schedule
            around them.
          </p>
        </header>

        {alreadyDone ? (
          // Answered already. Show it back rather than a dead end — a client
          // who clicks the link twice should see what they told us, not an
          // error suggesting something went wrong.
          <div className="border border-tbb-line rounded-lg bg-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarCheck
                className="w-5 h-5 text-tbb-success"
                aria-hidden
              />
              <h2 className="font-bold text-foreground text-lg tracking-tight">
                You&apos;ve already sent this
              </h2>
            </div>
            <p className="font-sans text-sm text-tbb-ink-2">
              <strong>Windows you gave us:</strong> {describeSlots(slots)}
            </p>
            {req.note && (
              <p className="font-sans text-sm text-tbb-ink-2">
                <strong>Your note:</strong> {req.note}
              </p>
            )}
            <p className="font-sans text-xs text-tbb-ink-3">
              If something has changed, reply to the email from your Business
              Builder and we&apos;ll update it.
            </p>
          </div>
        ) : (
          <AvailabilityGridForm
            token={params.token}
            contactName={req.contactName}
          />
        )}
      </div>
    </main>
  );
}
