"use server";

/**
 * Channel spend — hand-entered marketing spend that powers the
 * cost-per-booked-session and cost-per-client columns of the lead-source
 * attribution report. No ad-platform API: the master admin types in what
 * was spent per channel per month.
 *
 * master_admin only. Master org.
 */

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { channelSpend, orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { LEAD_SOURCE_CHANNELS } from "@/lib/pipeline/lead-source";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const upsertSchema = z.object({
  channel: z.enum(LEAD_SOURCE_CHANNELS),
  // "YYYY-MM" (a month) — normalized to the first of that month.
  month: z.string().regex(/^\d{4}-\d{2}$/),
  // Dollars entered in the form; converted to cents here.
  amountCents: z.number().int().nonnegative(),
});

export type ChannelSpendRow = {
  channel: (typeof LEAD_SOURCE_CHANNELS)[number];
  month: string; // "YYYY-MM"
  amountCents: number;
};

async function requireMasterOrg(): Promise<
  { ok: true; orgId: string } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Master admins only." };
  const orgId = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return m?.id ?? null;
  });
  if (!orgId) return { ok: false, error: "Master org not configured." };
  return { ok: true, orgId };
}

export async function upsertChannelSpend(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult<void>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const auth = await requireMasterOrg();
  if (!auth.ok) return auth;

  const monthDate = `${parsed.data.month}-01`;

  await withSystemContext(async (tx) => {
    await tx
      .insert(channelSpend)
      .values({
        orgId: auth.orgId,
        channel: parsed.data.channel,
        month: monthDate,
        amountCents: parsed.data.amountCents,
      })
      .onConflictDoUpdate({
        target: [channelSpend.orgId, channelSpend.channel, channelSpend.month],
        set: { amountCents: parsed.data.amountCents, updatedAt: new Date() },
      });
  });

  revalidatePath("/business-builder/settings/channel-spend");
  revalidatePath("/business-builder/reports");
  return { ok: true, data: undefined };
}

/** Recent spend rows for the settings table, newest month first. */
export async function listChannelSpend(): Promise<ChannelSpendRow[]> {
  const auth = await requireMasterOrg();
  if (!auth.ok) return [];
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        channel: channelSpend.channel,
        month: channelSpend.month,
        amountCents: channelSpend.amountCents,
      })
      .from(channelSpend)
      .where(eq(channelSpend.orgId, auth.orgId))
      .orderBy(desc(channelSpend.month)),
  );
  return rows.map((r) => ({
    channel: r.channel,
    // `month` comes back as "YYYY-MM-DD"; the UI wants "YYYY-MM".
    month: String(r.month).slice(0, 7),
    amountCents: r.amountCents,
  }));
}
