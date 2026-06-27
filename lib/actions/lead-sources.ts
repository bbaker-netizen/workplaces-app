"use server";

/**
 * Lead-capture webhook token management. The token secures the public
 * /api/leads/<token> endpoint that external channels (website form, Meta /
 * TikTok / YouTube / Google / LinkedIn ads via Make.com) POST leads to,
 * landing them in the Pipeline as prospects. Master-admin only.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

function newToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function setMasterToken(token: string): Promise<string | null> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return null;
    await tx
      .update(orgs)
      .set({ leadWebhookToken: token })
      .where(eq(orgs.id, master.id));
    return token;
  });
}

/** Create the lead webhook token if it doesn't exist yet; return it. */
export async function ensureLeadWebhookToken(): Promise<TokenResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Only the account owner can do this." };
  }
  const existing = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ token: orgs.leadWebhookToken })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return master?.token ?? null;
  });
  if (existing) return { ok: true, token: existing };

  const saved = await setMasterToken(newToken());
  if (!saved) return { ok: false, error: "Master org isn't configured." };
  revalidatePath("/business-builder/settings/lead-sources");
  return { ok: true, token: saved };
}

/** Rotate the token — any old webhook URLs stop working immediately. */
export async function regenerateLeadWebhookToken(): Promise<TokenResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Only the account owner can do this." };
  }
  const saved = await setMasterToken(newToken());
  if (!saved) return { ok: false, error: "Master org isn't configured." };
  revalidatePath("/business-builder/settings/lead-sources");
  return { ok: true, token: saved };
}
