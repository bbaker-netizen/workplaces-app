"use server";

/**
 * Subscription product catalogue + assignment to engagements.
 *
 * Product CRUD lives at the master-org level. Assigning a product to
 * an engagement creates a subscription_assets row pre-filled from the
 * product's defaults; the per-engagement price can be overridden.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagements,
  subscriptionAssets,
  subscriptionProducts,
} from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

const productSchema = z.object({
  name: z.string().min(1).max(200),
  vendor: z.string().min(1).max(200).default("Workplaces"),
  description: z.string().max(4000).nullable().optional(),
  defaultMonthlyCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().min(3).max(3).default("CAD"),
  category: z.string().max(120).nullable().optional(),
  active: z.boolean().default(true),
});

export type SubscriptionProductInput = z.input<typeof productSchema>;

export async function createSubscriptionProduct(
  input: SubscriptionProductInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    const row = await withTenantContext(profile.orgId, async (tx) => {
      const [created] = await tx
        .insert(subscriptionProducts)
        .values({
          orgId: profile.orgId,
          name: parsed.data.name,
          vendor: parsed.data.vendor,
          description: parsed.data.description ?? null,
          defaultMonthlyCents: parsed.data.defaultMonthlyCents,
          currency: parsed.data.currency,
          category: parsed.data.category ?? null,
          active: parsed.data.active,
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: subscriptionProducts.id });
      return created;
    });
    revalidatePath("/business-builder/subscriptions");
    return { ok: true, id: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function updateSubscriptionProduct(
  id: string,
  input: SubscriptionProductInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(subscriptionProducts)
        .set({
          name: parsed.data.name,
          vendor: parsed.data.vendor,
          description: parsed.data.description ?? null,
          defaultMonthlyCents: parsed.data.defaultMonthlyCents,
          currency: parsed.data.currency,
          category: parsed.data.category ?? null,
          active: parsed.data.active,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionProducts.id, id));
    });
    revalidatePath("/business-builder/subscriptions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function deleteSubscriptionProduct(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx.delete(subscriptionProducts).where(eq(subscriptionProducts.id, id));
    });
    revalidatePath("/business-builder/subscriptions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/* ----------------------- Assign to engagement ----------------------- */

const assignSchema = z.object({
  productId: z.string().uuid(),
  engagementId: z.string().uuid(),
  monthlyCostCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  paidBy: z.string().max(80).default("workplaces"),
  notes: z.string().max(4000).nullable().optional(),
  renewalDate: z.string().nullable().optional(),
});

export async function assignProductToEngagement(
  input: z.input<typeof assignSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    const row = await withTenantContext(profile.orgId, async (tx) => {
      // Look up product details to seed the asset.
      const [product] = await tx
        .select()
        .from(subscriptionProducts)
        .where(eq(subscriptionProducts.id, parsed.data.productId))
        .limit(1);
      if (!product) throw new Error("Product not found.");
      const [engagement] = await tx
        .select({ id: engagements.id, orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, parsed.data.engagementId))
        .limit(1);
      if (!engagement) throw new Error("Engagement not found.");
      const renewalDate = parsed.data.renewalDate
        ? new Date(parsed.data.renewalDate)
        : null;

      const [created] = await tx
        .insert(subscriptionAssets)
        .values({
          orgId: engagement.orgId,
          engagementId: engagement.id,
          productId: product.id,
          name: product.name,
          vendor: product.vendor,
          monthlyCostCents:
            parsed.data.monthlyCostCents ?? product.defaultMonthlyCents,
          currency: product.currency,
          paidBy: parsed.data.paidBy,
          notes: parsed.data.notes ?? null,
          renewalDate,
        })
        .returning({ id: subscriptionAssets.id });
      return created;
    });
    revalidatePath("/business-builder/subscriptions");
    return { ok: true, id: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}
