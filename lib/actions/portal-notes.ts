"use server";

/**
 * Private portal notes — each user's own markdown scratchpad for an
 * engagement. Always scoped to the caller's own row, so one client
 * member can never read or write another's notes, and the coach can't
 * see them either.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { portalNotes } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

const schema = z.object({
  engagementId: z.string().uuid(),
  body: z.string().max(100000),
});

type Result = { ok: true } | { ok: false; error: string };

export async function upsertPortalNote(
  input: z.input<typeof schema>,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { engagementId, body } = parsed.data;
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .insert(portalNotes)
        .values({
          orgId: profile.orgId,
          engagementId,
          userProfileId: profile.userProfileId,
          body,
        })
        .onConflictDoUpdate({
          target: [portalNotes.engagementId, portalNotes.userProfileId],
          set: { body, updatedAt: new Date() },
        });
    });
    revalidatePath("/portal/notes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMyPortalNoteBody(
  engagementId: string,
): Promise<string> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return "";
  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select({ body: portalNotes.body })
      .from(portalNotes)
      .where(
        and(
          eq(portalNotes.engagementId, engagementId),
          eq(portalNotes.userProfileId, profile.userProfileId),
        ),
      )
      .limit(1);
    return row?.body ?? "";
  });
}
