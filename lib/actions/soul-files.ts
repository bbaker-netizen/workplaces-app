"use server";

/**
 * Soul Files — server actions.
 *
 * Phase 1.7 introduced upserting; Phase 2.6 added OpenAI-based
 * embeddings; Phase 4.5 (this rewrite) drops the embedding pipeline
 * and uses Claude directly for cross-engagement search.
 *
 * Why the swap: Anthropic doesn't make a public embeddings API, and
 * Bruce works exclusively with Claude. Rather than maintain a second
 * AI vendor (OpenAI / Voyage) for one feature, we just give Claude
 * the candidate Soul Files and ask it to pick the most relevant
 * snippet. Works for Bruce's scale (up to ~30 Soul Files easily fit
 * Sonnet's context window) and removes a whole dependency.
 *
 * Surface:
 *   - `upsertSoulFileBody(engagementId, body)` — write the markdown.
 *     Leadership-only (master_admin / Coach / client_lead /
 *     client_manager).
 *   - `searchSoulFiles(query, limit?)` — Coach-only cross-engagement
 *     semantic search via Claude.
 *
 * Reads live in `lib/db/queries/soul-files.ts`.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  coaches,
  engagements,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withEngagementContext, withSystemContext } from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";

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

    revalidatePath("/portal/soul-file");
    revalidatePath(`/business-builder/soul-file/${data.engagementId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- search ----------------------------- */

const SEARCH_SYSTEM = `You are a search engine over a Coach's "Soul Files" — long-form context documents written about each of their client engagements. Each Soul File belongs to one engagement and contains:

- Why the engagement exists
- Where the business is today
- Where it wants to be in 12 months
- Strategic backdrop, founders, hard-won learnings

Your job: given a Coach's natural-language query and a list of candidate Soul Files (each with its engagement id, name, and body), return the top results most relevant to the query.

Output strict JSON, no prose, no code fences. The shape:

{
  "results": [
    {
      "engagementId": "<the candidate's id>",
      "engagementName": "<the candidate's name or null>",
      "snippet": "<a 1-2 sentence pulled-from-body excerpt that directly answers the query>",
      "reasoning": "<one short clause explaining why this matched>"
    }
  ]
}

Rules:
- Pick at most the limit specified in the user prompt; fewer is fine if nothing else is relevant.
- Order by relevance, most relevant first.
- Snippet MUST be a verbatim or near-verbatim phrase from the source body — do not paraphrase from your own knowledge.
- If nothing in the candidates matches, return {"results": []}.
- Never mention candidates that weren't in the input.`;

const searchOutputSchema = z.object({
  results: z
    .array(
      z.object({
        engagementId: z.string(),
        engagementName: z.string().nullable(),
        snippet: z.string(),
        reasoning: z.string().optional(),
      }),
    )
    .max(20),
});

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
        // Kept as `distance` for backwards-compat with the existing
        // SoulSearchPanel UI; lower is better, but the values now
        // come from Claude's ranking (we synthesize 0, 1, 2, …).
        distance: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!query.trim()) return { ok: true, data: [] };

  // Load every Soul File for engagements this Coach owns.
  type Candidate = {
    engagementId: string;
    engagementName: string | null;
    body: string;
  };
  const candidates: Candidate[] = await withSystemContext(async (tx) => {
    const [Coach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, profile.userProfileId))
      .limit(1);
    if (!Coach) return [];
    const rows = await tx
      .select({
        engagementId: soulFiles.engagementId,
        engagementName: engagements.name,
        body: soulFiles.body,
        coachId: engagements.coachId,
      })
      .from(soulFiles)
      .innerJoin(engagements, eq(engagements.id, soulFiles.engagementId));
    return rows
      .filter((r) => r.coachId === Coach.id && r.body.trim().length > 0)
      .map((r) => ({
        engagementId: r.engagementId,
        engagementName: r.engagementName,
        body: r.body,
      }));
  });

  if (candidates.length === 0) return { ok: true, data: [] };

  // Build the prompt. Cap each body to keep the call bounded for very
  // long Soul Files; Claude Sonnet has plenty of headroom but no need
  // to burn tokens unnecessarily.
  const MAX_BODY_CHARS = 12_000;
  const userPrompt = [
    `Query: ${query.trim()}`,
    "",
    `Limit: ${Math.max(1, Math.min(limit, 20))}`,
    "",
    "Candidates:",
    ...candidates.map((c, i) => {
      const truncated =
        c.body.length > MAX_BODY_CHARS
          ? c.body.slice(0, MAX_BODY_CHARS) + "\n[…truncated…]"
          : c.body;
      return [
        `--- Candidate ${i + 1} ---`,
        `Engagement ID: ${c.engagementId}`,
        `Engagement Name: ${c.engagementName ?? "(unnamed)"}`,
        "Body:",
        truncated,
      ].join("\n");
    }),
  ].join("\n");

  let parsed: z.infer<typeof searchOutputSchema>;
  try {
    const result = await complete({
      system: SEARCH_SYSTEM,
      user: userPrompt,
      model: "claude-sonnet-5",
      maxTokens: 2000,
      temperature: 0.1,
    });
    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    parsed = searchOutputSchema.parse(JSON.parse(cleaned));
  } catch (e) {
    return {
      ok: false,
      error: `Search failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Filter to candidates we actually own (defensive — Claude shouldn't
  // hallucinate ids but cheap to enforce).
  const validIds = new Set(candidates.map((c) => c.engagementId));
  const safeResults = parsed.results.filter((r) =>
    validIds.has(r.engagementId),
  );

  return {
    ok: true,
    data: safeResults.slice(0, limit).map((r, i) => ({
      engagementId: r.engagementId,
      engagementName: r.engagementName,
      snippet: r.snippet,
      distance: i, // synthetic — UI sorts by this
    })),
  };
}
