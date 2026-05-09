"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { subscriptionAssets, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
const LEADERSHIP: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];
function canEdit(role: Role): boolean {
  return (LEADERSHIP as readonly string[]).includes(role);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const modelEnum = z.enum(["model_a", "model_b", "model_c"]);
const transferEnum = z.enum(["retained", "pending_transfer", "transferred"]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(1).max(200),
  vendor: z.string().min(1).max(200),
  monthlyCostCents: z.number().int().min(0).default(0),
  currency: z.string().min(3).max(3).default("CAD"),
  paidBy: z.string().max(100).default("workplaces"),
  model: modelEnum.default("model_c"),
  transferStatus: transferEnum.default("retained"),
  notes: z.string().max(20000).nullable().optional(),
  renewalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const updateSchema = createSchema.partial().omit({ engagementId: true });

export async function createSubscription(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't add subscriptions." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(subscriptionAssets)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            name: data.name,
            vendor: data.vendor,
            monthlyCostCents: data.monthlyCostCents,
            currency: data.currency,
            paidBy: data.paidBy,
            model: data.model,
            transferStatus: data.transferStatus,
            notes: data.notes ?? null,
            renewalDate: data.renewalDate
              ? new Date(data.renewalDate)
              : null,
          })
          .returning({ id: subscriptionAssets.id });
        return row;
      },
    );
    revalidatePath("/portal/subscriptions");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateSubscription(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit subscriptions." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "subscription_assets",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof subscriptionAssets.$inferInsert> = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.vendor !== undefined) update.vendor = data.vendor;
        if (data.monthlyCostCents !== undefined)
          update.monthlyCostCents = data.monthlyCostCents;
        if (data.currency !== undefined) update.currency = data.currency;
        if (data.paidBy !== undefined) update.paidBy = data.paidBy;
        if (data.model !== undefined) update.model = data.model;
        if (data.transferStatus !== undefined)
          update.transferStatus = data.transferStatus;
        if (data.notes !== undefined) update.notes = data.notes;
        if (data.renewalDate !== undefined)
          update.renewalDate = data.renewalDate
            ? new Date(data.renewalDate)
            : null;
        if (Object.keys(update).length === 0) return;
        await tx
          .update(subscriptionAssets)
          .set(update)
          .where(eq(subscriptionAssets.id, id));
      },
    );
    revalidatePath("/portal/subscriptions");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteSubscription(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete subscriptions." };
  const engagementId = await resolveEngagementIdFromRecord(
    "subscription_assets",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .delete(subscriptionAssets)
          .where(eq(subscriptionAssets.id, id));
      },
    );
    revalidatePath("/portal/subscriptions");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
