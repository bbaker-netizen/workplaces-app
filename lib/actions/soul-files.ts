"use server";

/**
 * Soul Files — server actions.
 *
 * Phase 1.7. Surface:
 *   - `upsertSoulFileBody(engagementId, body)` — write the markdown
 *     body. Creates the row if none exists. Leadership-only write
 *     (master_admin / coach / client_lead / client_manager).
 *
 * Reads live in `lib/db/queries/soul-files.ts`.
 */

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagements,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import { embedText } from "@/lib/ai/embeddings";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function canEdit(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

const upsertSchema = z.object({
  engagementId: z.string().uuid(),
  body: z.string().max(200000), // Soul Files can run long.
});

export type UpsertSoulFileInput = z.input<typeof upsertSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function upsertSoulFileBody(
  input: UpsertSoulFileInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't edit the Soul File." };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const id = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [eng] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, data.engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");

        const [existing] = await tx
          .select({ id: soulFiles.id })
          .from(soulFiles)
          .where(eq(soulFiles.engagementId, data.engagementId))
          .limit(1);

        if (existing) {
          await tx
            .update(soulFiles)
            .set({
              body: data.body,
              lastEditorUserProfileId: profile.userProfileId,
            })
            .where(eq(soulFiles.id, existing.id));
          return existing.id;
        }
        const [row] = await tx
          .insert(soulFiles)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            body: data.body,
            lastEditorUserProfileId: profile.userProfileId,
          })
          .returning({ id: soulFiles.id });
        return row.id;
      },
    );

    // Embed the new body for semantic search. Best-effort — failures
    // log but don't propagate (the Soul File still saved). The
    // OPENAI_API_KEY env var being unset is the most common reason
    // this skips; that's acceptable.
    if (data.body.trim().length > 0) {
      try {
        const vector = await embedText(data.body);
        const formatted = `[${vector.join(",")}]`;
        await withEngagementContext(
          profile.orgId,
          profile.role,
          data.engagementId,
          async (tx) => {
            await tx.execute(
              sql`UPDATE soul_files
                  SET embedding = ${formatted}::vector,
                      embedding_updated_at = now()
                  WHERE id = ${id}`,
            );
          },
        );
      } catch (e) {
        console.error("[soul-file] embed failed (non-fatal):", e);
      }
    }

    revalidatePath("/portal/soul-file");
    revalidatePath(`/coach/soul-file/${data.engagementId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Cross-engagement Soul File search by semantic similarity to a
 * natural-language query. Coach-only — uses system context to span
 * tenants. Returns top N results ranked by cosine distance.
 */
export async function searchSoulFiles(
  query: string,
  limit = 5,
): Promise<
  | {
      ok: true;
      data: Array<{
        engagementId: string;
        engagementName: string | null;
        snippet: string;
        distance: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Coach-only." };
  if (!query.trim()) return { ok: true, data: [] };

  let queryVector: number[];
  try {
    queryVector = await embedText(query);
  } catch (e) {
    return {
      ok: false,
      error: `Embedding failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const formatted = `[${queryVector.join(",")}]`;

  // System context — coaches search across every engagement they own.
  const { withSystemContext } = await import("@/lib/db/tenant");
  type Row = {
    engagementId: string;
    engagementName: string | null;
    snippet: string;
    distance: number;
  };
  try {
    const queryResult = await withSystemContext(async (tx) =>
      tx.execute(
        sql`SELECT s.engagement_id AS "engagementId",
                   e.name AS "engagementName",
                   substring(s.body for 240) AS snippet,
                   s.embedding <=> ${formatted}::vector AS distance
            FROM soul_files s
            INNER JOIN engagements e ON e.id = s.engagement_id
            INNER JOIN coaches c ON c.id = e.coach_id
            INNER JOIN user_profiles up ON up.id = c.user_profile_id
            WHERE s.embedding IS NOT NULL
              AND up.id = ${profile.userProfileId}
            ORDER BY s.embedding <=> ${formatted}::vector
            LIMIT ${limit}`,
      ),
    );
    const rows = (queryResult as unknown as { rows?: Row[] }).rows ?? [];
    return { ok: true, data: rows };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
