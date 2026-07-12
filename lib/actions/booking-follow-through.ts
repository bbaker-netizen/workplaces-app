"use server";

/**
 * Booking follow-through actions — the two things Bruce touches from the
 * prospect card: mark documents received (which stops emails 2 and 3) and
 * "Send now" for a specific email.
 *
 * Business Builder side only (master_admin / coach).
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bookingFollowThrough } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  sendBookingFollowThroughEmail,
  type BookingEmailNum,
} from "@/lib/booking/follow-through";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireBb(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  return { ok: true };
}

/** Toggle "documents received". When true, emails 2 and 3 are suppressed. */
export async function setBookingDocumentsReceived(
  ftId: string,
  received: boolean,
  prospectId: string,
): Promise<ActionResult<void>> {
  const auth = await requireBb();
  if (!auth.ok) return auth;

  await withSystemContext(async (tx) => {
    await tx
      .update(bookingFollowThrough)
      .set({ documentsReceivedAt: received ? new Date() : null })
      .where(eq(bookingFollowThrough.id, ftId));
  });

  revalidatePath(`/business-builder/pipeline/${prospectId}`);
  return { ok: true, data: undefined };
}

/** Send one follow-through email right now (manual override of timing). */
export async function sendBookingEmailNow(
  ftId: string,
  emailNum: BookingEmailNum,
  prospectId: string,
): Promise<ActionResult<void>> {
  const auth = await requireBb();
  if (!auth.ok) return auth;

  const r = await sendBookingFollowThroughEmail(ftId, emailNum, new Date(), {
    manual: true,
  });
  if (!r.ok) return { ok: false, error: r.error ?? "Send failed." };

  revalidatePath(`/business-builder/pipeline/${prospectId}`);
  return { ok: true, data: undefined };
}
