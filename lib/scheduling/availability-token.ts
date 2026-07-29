/**
 * Create-or-reuse the availability token for a prospect.
 *
 * Lives outside the "use server" action file so it can be called with an
 * existing transaction — both by the button on the client's record and by
 * the `{{availability_link}}` merge field when an onboarding email is
 * drafted. One implementation, so the two routes cannot disagree about
 * which token is live.
 *
 * Reuses an UNANSWERED request rather than minting a fresh token each
 * time. A client emailed the link twice would otherwise be able to open
 * the older message and submit against a row nobody is watching.
 */

import { eq } from "drizzle-orm";
import { availabilityRequests, prospects } from "@/lib/db/schema";
import { newSigningToken } from "@/lib/signing/token";

/**
 * @param tx a transaction already bound to system context
 * @returns the public token, or null if the prospect no longer exists
 */
export async function ensureAvailabilityToken(
  // Typed loosely on purpose: Drizzle's transaction type is not exported in
  // a form that survives being passed around, and every caller here already
  // holds a real one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  prospectId: string,
  createdByUserProfileId: string,
): Promise<string | null> {
  const [p] = await tx
    .select({
      orgId: prospects.orgId,
      contactName: prospects.contactName,
      contactEmail: prospects.contactEmail,
    })
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) return null;

  const existing = await tx
    .select({
      publicToken: availabilityRequests.publicToken,
      submittedAt: availabilityRequests.submittedAt,
    })
    .from(availabilityRequests)
    .where(eq(availabilityRequests.prospectId, prospectId));
  const open = existing.find(
    (r: { submittedAt: Date | null }) => r.submittedAt === null,
  );
  if (open) return open.publicToken;

  const fresh = newSigningToken();
  await tx.insert(availabilityRequests).values({
    orgId: p.orgId,
    prospectId,
    publicToken: fresh,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    createdByUserProfileId,
  });
  return fresh;
}

/** Absolute URL a client opens to fill in the grid. */
export function availabilityUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/availability/${token}`;
}
