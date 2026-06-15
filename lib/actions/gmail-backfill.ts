"use server";

/**
 * On-demand backfill of a single contact's email history from Gmail.
 * Triggered from the per-client Communications panel — searches Gmail for
 * messages to/from that contact over the last year and stores them, so a
 * client's full thread shows up instead of just whatever the forward sync
 * has caught since you connected.
 */

import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { backfillContactEmails } from "@/lib/integrations/gmail";

export type SyncContactEmailsResult =
  | { ok: true; captured: number; scanned: number }
  | { ok: false; error: string };

export async function syncContactEmails(input: {
  contactEmail: string | null;
}): Promise<SyncContactEmailsResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only Business Builders can sync emails." };
  }
  const email = (input.contactEmail ?? "").trim();
  if (!email) {
    return { ok: false, error: "Add a contact email on this client first." };
  }

  try {
    const masterOrgId = await withSystemContext(async (tx) => {
      const [m] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      return m?.id ?? null;
    });
    if (!masterOrgId) return { ok: false, error: "No master org configured." };

    const r = await backfillContactEmails({
      userProfileId: profile.userProfileId,
      masterOrgId,
      contactEmail: email,
    });
    return { ok: true, captured: r.captured, scanned: r.scanned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
