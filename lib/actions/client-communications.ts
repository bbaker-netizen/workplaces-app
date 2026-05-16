"use server";

/**
 * Client communications — server actions.
 *
 * - logClientCommunication: manually record an email/call/sms the
 *   Business Builder had with a client. The inbound webhook uses the
 *   same write path internally so call notes and inbound email both
 *   land in the same table.
 * - deleteClientCommunication: hard delete (no soft delete yet; can
 *   add later if audit retention becomes a requirement).
 * - tagCommunication / untagCommunication: manage the user-defined tag
 *   list on a single record.
 * - generateAlias: create a per-prospect or per-engagement inbound BCC
 *   alias so external email can be auto-routed.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientCommunications,
  communicationAliases,
  engagements,
  prospects,
} from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const channelEnum = z.enum([
  "email",
  "sms",
  "whatsapp",
  "phone_call",
  "meeting_note",
  "other",
]);
const directionEnum = z.enum(["inbound", "outbound"]);

const logSchema = z
  .object({
    prospectId: z.string().uuid().nullable().optional(),
    engagementId: z.string().uuid().nullable().optional(),
    channel: channelEnum,
    direction: directionEnum,
    fromAddress: z.string().max(320).nullable().optional(),
    toAddresses: z.array(z.string().max(320)).max(50).optional(),
    subject: z.string().max(500).nullable().optional(),
    body: z.string().max(50000).optional(),
    bodyHtml: z.string().max(200_000).nullable().optional(),
    threadKey: z.string().max(500).nullable().optional(),
    externalId: z.string().max(500).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    tags: z.array(z.string().max(60)).max(20).optional(),
  })
  .refine(
    (v) =>
      (v.prospectId && !v.engagementId) || (!v.prospectId && v.engagementId),
    { message: "Pick either a prospect or an engagement (not both)." },
  );

export type LogCommunicationInput = z.input<typeof logSchema>;

export async function logClientCommunication(
  input: LogCommunicationInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;
  try {
    const created = await withTenantContext(profile.orgId, async (tx) => {
      // Verify the target record exists & is in the caller's tenant.
      if (data.prospectId) {
        const [p] = await tx
          .select({ id: prospects.id })
          .from(prospects)
          .where(eq(prospects.id, data.prospectId))
          .limit(1);
        if (!p) throw new Error("Prospect not found.");
      }
      if (data.engagementId) {
        const [e] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, data.engagementId))
          .limit(1);
        if (!e) throw new Error("Engagement not found.");
      }
      const [row] = await tx
        .insert(clientCommunications)
        .values({
          orgId: profile.orgId,
          prospectId: data.prospectId ?? null,
          engagementId: data.engagementId ?? null,
          channel: data.channel,
          direction: data.direction,
          fromAddress: data.fromAddress ?? null,
          toAddresses: data.toAddresses ?? [],
          subject: data.subject ?? null,
          body: data.body ?? "",
          bodyHtml: data.bodyHtml ?? null,
          threadKey: data.threadKey ?? null,
          externalId: data.externalId ?? null,
          occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
          tags: data.tags ?? [],
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: clientCommunications.id });
      return row;
    });
    if (data.prospectId) {
      revalidatePath(`/coach/pipeline/${data.prospectId}`);
    }
    if (data.engagementId) {
      revalidatePath(`/coach/communication/${data.engagementId}`);
    }
    revalidatePath("/coach/inbox");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function deleteClientCommunication(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx.delete(clientCommunications).where(eq(clientCommunications.id, id));
    });
    revalidatePath("/coach/inbox");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

const tagsSchema = z.object({
  id: z.string().uuid(),
  tags: z.array(z.string().max(60)).max(20),
});

export async function setCommunicationTags(
  input: z.input<typeof tagsSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  const parsed = tagsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(clientCommunications)
        .set({ tags: parsed.data.tags, updatedAt: new Date() })
        .where(eq(clientCommunications.id, parsed.data.id));
    });
    revalidatePath("/coach/inbox");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/* ------------------------------ Aliases ------------------------------ */

function newAliasFragment(prefix: string): string {
  const slug = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const suffix = randomBytes(3).toString("hex");
  return `${slug || "client"}-${suffix}`;
}

export async function generateProspectAlias(
  prospectId: string,
): Promise<ActionResult<{ alias: string; address: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(prospectId).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    const result = await withTenantContext(profile.orgId, async (tx) => {
      const [p] = await tx
        .select({
          id: prospects.id,
          companyName: prospects.companyName,
        })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");

      const alias = newAliasFragment(`lead-${p.companyName}`);
      await tx.insert(communicationAliases).values({
        orgId: profile.orgId,
        alias,
        prospectId: p.id,
        createdByUserProfileId: profile.userProfileId,
      });
      return alias;
    });
    const domain =
      process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.4workplaces.com";
    revalidatePath(`/coach/pipeline/${prospectId}`);
    return {
      ok: true,
      data: { alias: result, address: `${result}@${domain}` },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function generateEngagementAlias(
  engagementId: string,
): Promise<ActionResult<{ alias: string; address: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(engagementId).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    const result = await withTenantContext(profile.orgId, async (tx) => {
      const [e] = await tx
        .select({ id: engagements.id, name: engagements.name })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!e) throw new Error("Engagement not found.");

      const alias = newAliasFragment(`client-${e.name ?? "engagement"}`);
      await tx.insert(communicationAliases).values({
        orgId: profile.orgId,
        alias,
        engagementId: e.id,
        createdByUserProfileId: profile.userProfileId,
      });
      return alias;
    });
    const domain =
      process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.4workplaces.com";
    return {
      ok: true,
      data: { alias: result, address: `${result}@${domain}` },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}
