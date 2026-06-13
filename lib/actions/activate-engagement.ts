"use server";

/**
 * Activate a prospect into an engagement WITHOUT inviting the client.
 *
 * This is the decoupled "Convert to active engagement" path: it creates
 * the engagement + its client org so the coach can prepare the portal
 * (modules, content, apps) immediately — but it does NOT create a Clerk
 * organisation or email the client. `clerk_org_id` is a `pending:<id>`
 * placeholder until the coach explicitly invites the client (a separate
 * step that builds the real Clerk org + sends the invite).
 *
 * Database-only, so it's safe to run in bulk with no side effects.
 */

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  coaches,
  engagements,
  orgs,
  prospects,
  type Prospect,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type Result<T = { engagementId: string }> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? `${base}-${id.slice(0, 6)}` : id.slice(0, 12);
}

/** Find (or lazily create) the caller's coaches row. */
async function ensureCoachId(
  userProfileId: string,
  orgId: string,
): Promise<string> {
  return withSystemContext(async (tx) => {
    const [existing] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, userProfileId))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await tx
      .insert(coaches)
      .values({ orgId, userProfileId, status: "active" })
      .returning({ id: coaches.id });
    return created.id;
  });
}

/** Build the orgs + engagements row values for a prospect (no Clerk). */
function buildRows(prospect: Prospect, coachId: string) {
  const newOrgId = randomUUID();
  const newEngagementId = randomUUID();
  const type: "accelerator" | "implementer" =
    prospect.programType === "implementer" ? "implementer" : "accelerator";
  return {
    newEngagementId,
    org: {
      id: newOrgId,
      // Placeholder until the client is invited — no Clerk org yet.
      clerkOrgId: `pending:${newEngagementId}`,
      name: prospect.companyName,
      type: "client" as const,
    },
    engagement: {
      id: newEngagementId,
      orgId: newOrgId,
      coachId,
      type,
      name: prospect.companyName,
      slug: slugify(prospect.companyName, newEngagementId),
      startDate: prospect.expectedStartDate ?? new Date(),
      monthlyFeeCents: prospect.monthlyFeeCents ?? null,
      pricingTier: prospect.pricingTier ?? null,
    },
  };
}

/** Activate a single prospect (the one-click "Convert" CTA). */
export async function activateProspectAsEngagement(
  prospectId: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const coachId = await ensureCoachId(profile.userProfileId, profile.orgId);
  try {
    const engagementId = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select()
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
      if (p.convertedEngagementId) return p.convertedEngagementId;
      const rows = buildRows(p, coachId);
      await tx.insert(orgs).values(rows.org);
      await tx.insert(engagements).values(rows.engagement);
      await tx
        .update(prospects)
        .set({
          convertedEngagementId: rows.newEngagementId,
          status: "onboarded",
        })
        .where(eq(prospects.id, p.id));
      return rows.newEngagementId;
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    revalidatePath("/business-builder/engagements");
    return { ok: true, data: { engagementId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Activate every Contract-signed prospect that isn't an engagement yet. */
export async function activateAllSignedProspects(): Promise<
  Result<{ activated: number }>
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const coachId = await ensureCoachId(profile.userProfileId, profile.orgId);
  try {
    const activated = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return 0;
      const signed = await tx
        .select()
        .from(prospects)
        .where(
          and(
            eq(prospects.orgId, master.id),
            eq(prospects.status, "contract_signed"),
            isNull(prospects.convertedEngagementId),
          ),
        );
      let count = 0;
      for (const p of signed) {
        const rows = buildRows(p, coachId);
        await tx.insert(orgs).values(rows.org);
        await tx.insert(engagements).values(rows.engagement);
        await tx
          .update(prospects)
          .set({
            convertedEngagementId: rows.newEngagementId,
            status: "onboarded",
          })
          .where(eq(prospects.id, p.id));
        count++;
      }
      return count;
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/business-builder/engagements");
    return { ok: true, data: { activated } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
