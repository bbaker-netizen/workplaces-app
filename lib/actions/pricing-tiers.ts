"use server";

/**
 * Pricing-tiers CRUD — per-org price grid that suggests a default
 * monthly fee when creating an engagement.
 *
 * Rows are stored in the `pricing_tiers` table, scoped by org via RLS.
 * The engagement creation form reads these as radio options; picking
 * one auto-fills the fee but the field remains editable.
 *
 * Authz: master_admin / coach. Bruce manages this under
 * /coach/settings/pricing.
 */

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { pricingTiers } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

const programEnum = z.enum(["accelerator", "implementer"]);

const upsertSchema = z.object({
  program: programEnum,
  tierKey: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/i, "Tier key must be letters/numbers/dash/underscore."),
  label: z.string().min(1).max(200),
  monthlyFeeCents: z
    .number()
    .int()
    .min(0)
    .max(100_000_00), // $100k upper sanity cap
  sortOrder: z.number().int().optional(),
});

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function listPricingTiers(): Promise<
  ActionResult<
    {
      id: string;
      program: string;
      tierKey: string;
      label: string;
      monthlyFeeCents: number;
      sortOrder: number;
    }[]
  >
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    const rows = await withTenantContext(profile.orgId, async (tx) =>
      tx
        .select()
        .from(pricingTiers)
        .where(eq(pricingTiers.orgId, profile.orgId))
        .orderBy(asc(pricingTiers.program), asc(pricingTiers.sortOrder)),
    );
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        program: r.program,
        tierKey: r.tierKey,
        label: r.label,
        monthlyFeeCents: r.monthlyFeeCents,
        sortOrder: r.sortOrder,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createPricingTier(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    const [row] = await withTenantContext(profile.orgId, async (tx) =>
      tx
        .insert(pricingTiers)
        .values({
          orgId: profile.orgId,
          program: parsed.data.program,
          tierKey: parsed.data.tierKey,
          label: parsed.data.label,
          monthlyFeeCents: parsed.data.monthlyFeeCents,
          sortOrder: parsed.data.sortOrder ?? 0,
        })
        .returning({ id: pricingTiers.id }),
    );
    revalidatePath("/coach/settings/pricing");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error && e.message.includes("unique")
          ? "A tier with that key already exists for this program."
          : e instanceof Error
            ? e.message
            : String(e),
    };
  }
}

export async function updatePricingTier(
  id: string,
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(pricingTiers)
        .set({
          program: parsed.data.program,
          tierKey: parsed.data.tierKey,
          label: parsed.data.label,
          monthlyFeeCents: parsed.data.monthlyFeeCents,
          sortOrder: parsed.data.sortOrder ?? 0,
        })
        .where(
          and(
            eq(pricingTiers.id, id),
            eq(pricingTiers.orgId, profile.orgId),
          ),
        );
    });
    revalidatePath("/coach/settings/pricing");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deletePricingTier(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .delete(pricingTiers)
        .where(
          and(
            eq(pricingTiers.id, id),
            eq(pricingTiers.orgId, profile.orgId),
          ),
        );
    });
    revalidatePath("/coach/settings/pricing");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
