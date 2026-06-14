"use server";

/**
 * Link a pipeline client (prospect) to a QuickBooks customer.
 *
 * Because billing happens directly in QuickBooks (no in-app invoicing),
 * this is how a client gets matched to their QBO customer so the pipeline
 * "Value" column can show lifetime payments. The coach picks the customer
 * from a list on the prospect detail page; we store the id + cache the
 * payments total immediately so the value shows without waiting for the
 * nightly sync.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { prospectActivities, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getCustomerTotalPaymentsCents,
  getValidQboCredentials,
  listCustomers,
} from "@/lib/integrations/qbo";

type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function gate(role: string): boolean {
  return role === "master_admin" || role === "coach";
}

export type QboCustomerOption = {
  id: string;
  name: string;
  email: string | null;
};

/** Fetch the QBO customer list for the picker. */
export async function listQboCustomersAction(): Promise<
  Result<QboCustomerOption[]>
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (!gate(profile.role)) return { ok: false, error: "Business Builders only." };

  const creds = await getValidQboCredentials(profile.userProfileId);
  if (!creds) {
    return {
      ok: false,
      error:
        "QuickBooks isn't connected. Connect it at Settings → QuickBooks first.",
    };
  }
  try {
    const customers = await listCustomers(creds.accessToken, creds.realmId);
    const options = customers
      .map((c) => ({
        id: c.Id,
        name: c.DisplayName,
        email: c.PrimaryEmailAddr?.Address ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, data: options };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Link a prospect to a QBO customer and immediately cache its lifetime
 * payments so the Value column updates right away.
 */
export async function setProspectQboCustomer(
  prospectId: string,
  qboCustomerId: string,
  qboCustomerName: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (!gate(profile.role)) return { ok: false, error: "Business Builders only." };
  if (!prospectId || !qboCustomerId) {
    return { ok: false, error: "Missing prospect or customer." };
  }

  const creds = await getValidQboCredentials(profile.userProfileId);
  if (!creds) {
    return {
      ok: false,
      error: "QuickBooks isn't connected. Connect it at Settings → QuickBooks.",
    };
  }
  try {
    const cents = await getCustomerTotalPaymentsCents(
      creds.accessToken,
      creds.realmId,
      qboCustomerId,
    );
    await withSystemContext(async (tx) => {
      const [updated] = await tx
        .update(prospects)
        .set({
          qboCustomerId,
          qboCustomerName,
          qboRealmId: creds.realmId,
          qboLifetimePaymentsCents: cents,
          qboValueSyncedAt: new Date(),
          qboLinkedAt: new Date(),
        })
        .where(eq(prospects.id, prospectId))
        .returning({ orgId: prospects.orgId });
      // Log the link on the activity timeline so there's a dated record.
      if (updated) {
        await tx.insert(prospectActivities).values({
          prospectId,
          orgId: updated.orgId,
          type: "qbo_linked",
          subject: `Linked to QuickBooks customer ${qboCustomerName}`,
          createdByUserProfileId: profile.userProfileId,
        });
      }
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Unlink a prospect from its QBO customer (clears the cached value). */
export async function clearProspectQboCustomer(
  prospectId: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (!gate(profile.role)) return { ok: false, error: "Business Builders only." };
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(prospects)
        .set({
          qboCustomerId: null,
          qboCustomerName: null,
          qboRealmId: null,
          qboLifetimePaymentsCents: null,
          qboValueSyncedAt: null,
          qboLinkedAt: null,
        })
        .where(eq(prospects.id, prospectId));
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
