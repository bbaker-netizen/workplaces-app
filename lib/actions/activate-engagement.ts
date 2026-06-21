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
  actionItems,
  coaches,
  engagements,
  orgs,
  prospects,
  userProfiles,
  type Prospect,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { referralRewardEmail } from "@/lib/email/templates";

/** A queued "thank the referrer" reward to email after the DB commit. */
type ReferralReward = { referrer: string; companyName: string };

/**
 * When a referred prospect becomes an active engagement, drop a task on
 * the coach's plate to send the $50 gift certificate + thank-you card.
 * Returns the reward details (for the follow-up email) or null if this
 * prospect wasn't a referral. Runs inside the caller's system-context tx.
 */
async function insertReferralReward(
  tx: Parameters<Parameters<typeof withSystemContext>[0]>[0],
  params: {
    prospect: Prospect;
    engagementId: string;
    engagementOrgId: string;
    coachUserProfileId: string;
  },
): Promise<ReferralReward | null> {
  const { prospect, engagementId, engagementOrgId, coachUserProfileId } = params;
  if ((prospect.leadSource ?? "").trim().toLowerCase() !== "referral") {
    return null;
  }
  const referrer = (prospect.referrerName ?? "").trim();
  if (referrer.length < 2) return null;
  // Due in a week — enough lead time to buy the card + certificate.
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await tx.insert(actionItems).values({
    orgId: engagementOrgId,
    engagementId,
    title: `Buy $50 gift certificate + thank-you card for ${referrer}`,
    description: `${prospect.companyName} came in as a referral from ${referrer}. Now that they're an active engagement, send a $50 gift certificate and a thank-you card to ${referrer}.`,
    status: "open",
    assigneeUserProfileId: coachUserProfileId,
    dueDate,
    createdBy: "coach",
  });
  return { referrer, companyName: prospect.companyName };
}

/** Load the coach's email + name for the referral-reward email. */
async function loadCoachContact(
  userProfileId: string,
): Promise<{ email: string; name: string } | null> {
  return withSystemContext(async (tx) => {
    const [u] = await tx
      .select({ email: userProfiles.email, name: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.id, userProfileId))
      .limit(1);
    if (!u?.email) return null;
    return { email: u.email, name: u.name ?? "there" };
  });
}

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

/** Build the orgs + engagements row values for a prospect (no Clerk).
 *  `programOverride`, when supplied, is the program chosen at the moment
 *  of conversion — the single source of truth for the engagement's type. */
function buildRows(
  prospect: Prospect,
  coachId: string,
  programOverride?: "accelerator" | "implementer",
) {
  const newOrgId = randomUUID();
  const newEngagementId = randomUUID();
  const type: "accelerator" | "implementer" =
    programOverride ??
    (prospect.programType === "implementer" ? "implementer" : "accelerator");
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

/** Activate a single prospect (the "Convert" CTA). The coach picks the
 *  program at this moment; it's saved to the prospect AND used as the
 *  engagement's type so every surface agrees from day one. */
export async function activateProspectAsEngagement(
  prospectId: string,
  program?: "accelerator" | "implementer",
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const coachId = await ensureCoachId(profile.userProfileId, profile.orgId);
  try {
    const result = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select()
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
      if (p.convertedEngagementId) {
        return { engagementId: p.convertedEngagementId, reward: null };
      }
      const rows = buildRows(p, coachId, program);
      await tx.insert(orgs).values(rows.org);
      await tx.insert(engagements).values(rows.engagement);
      await tx
        .update(prospects)
        .set({
          convertedEngagementId: rows.newEngagementId,
          status: "onboarded",
          // Persist the program chosen at conversion so the prospect (the
          // single source the Engagements + Portal lists read) matches the
          // engagement. Falls through to whatever was already set otherwise.
          ...(program ? { programType: program } : {}),
        })
        .where(eq(prospects.id, p.id));
      const reward = await insertReferralReward(tx, {
        prospect: p,
        engagementId: rows.newEngagementId,
        engagementOrgId: rows.org.id,
        coachUserProfileId: profile.userProfileId,
      });
      return { engagementId: rows.newEngagementId, reward };
    });
    // Email the coach about the gift cert after the commit, so a mail
    // hiccup can never roll back the conversion.
    if (result.reward) {
      const coach = await loadCoachContact(profile.userProfileId);
      if (coach) {
        await sendEmailQuietly(
          referralRewardEmail({
            to: coach.email,
            coachName: coach.name,
            referrer: result.reward.referrer,
            companyName: result.reward.companyName,
          }),
        );
      }
    }
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    revalidatePath("/business-builder/engagements");
    return { ok: true, data: { engagementId: result.engagementId } };
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
    const { count, rewards } = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return { count: 0, rewards: [] as ReferralReward[] };
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
      const rewards: ReferralReward[] = [];
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
        const reward = await insertReferralReward(tx, {
          prospect: p,
          engagementId: rows.newEngagementId,
          engagementOrgId: rows.org.id,
          coachUserProfileId: profile.userProfileId,
        });
        if (reward) rewards.push(reward);
        count++;
      }
      return { count, rewards };
    });
    if (rewards.length > 0) {
      const coach = await loadCoachContact(profile.userProfileId);
      if (coach) {
        for (const reward of rewards) {
          await sendEmailQuietly(
            referralRewardEmail({
              to: coach.email,
              coachName: coach.name,
              referrer: reward.referrer,
              companyName: reward.companyName,
            }),
          );
        }
      }
    }
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/business-builder/engagements");
    return { ok: true, data: { activated: count } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Reset a prospect's engagement link — for clients set up before the
 * Clerk Production cutover (e.g. Amardeep) whose portal is broken.
 * Clears the converted link, sends the prospect back to "Contract signed"
 * so the Convert button reappears, and removes the orphaned engagement +
 * its client org so a clean re-activation has nothing to collide with.
 * DESTRUCTIVE: deletes the old engagement's workspace data.
 */
export async function resetProspectEngagement(
  prospectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({
          id: prospects.id,
          convertedEngagementId: prospects.convertedEngagementId,
        })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
      await tx
        .update(prospects)
        .set({ convertedEngagementId: null, status: "contract_signed" })
        .where(eq(prospects.id, prospectId));
      const engId = p.convertedEngagementId;
      if (!engId) return;
      const [eng] = await tx
        .select({ orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, engId))
        .limit(1);
      // Deleting the engagement cascades its workspace rows.
      await tx.delete(engagements).where(eq(engagements.id, engId));
      if (eng) {
        const remaining = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.orgId, eng.orgId))
          .limit(1);
        // Drop the now-empty client org (never the master).
        if (remaining.length === 0) {
          await tx
            .delete(orgs)
            .where(and(eq(orgs.id, eng.orgId), eq(orgs.type, "client")));
        }
      }
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    revalidatePath("/business-builder/engagements");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
