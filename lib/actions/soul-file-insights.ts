"use server";

/**
 * Soul File AI insights — Bruce points at a BBS session's notes (or
 * paste-in transcript) and Claude proposes Soul-File-worthy
 * observations. Each one lands as a pending row; Bruce reviews, hits
 * Accept (merges into the Soul File body), or Dismiss.
 *
 * Future: when Fireflies API auto-extract lands, the source notes
 * will be the full transcript rather than whatever's in the session
 * notes textarea. The pipeline doesn't care — same Claude call, same
 * insight shape.
 */

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  bbsSessions,
  soulFileAiInsights,
  soulFiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY missing — needed for insight extraction.");
  }
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

const SYSTEM_PROMPT = `You are reading a Business Builder coaching session transcript or notes between Bruce (the coach) and a client. Your job: pull out 3-6 observations worth adding to the client's long-term Soul File — the document Bruce keeps about who this business is and where it's going.

What COUNTS as Soul-File-worthy:
- Founder story or backstory the client revealed
- Strategic direction shifts ("they're pivoting from X to Y")
- Hard-won learnings or lessons ("they tried this, didn't work because...")
- Cultural / values insights ("the team really cares about...")
- Long-term goals or fears
- Recurring patterns or themes
- Relationships and people of consequence
- Mental models the founder uses

What does NOT count:
- This-week action items (those go in Action Items)
- Operational tasks
- Numbers or KPIs (those go in dashboards)
- Routine project updates

Output format: just bullet points. One observation per bullet. 1-3 sentences each. No headers, no preamble. Write in Bruce's voice — direct, specific, no fluff.

If the input doesn't contain anything Soul-File-worthy, return an empty response.`;

const extractSchema = z.object({
  engagementId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  /** Free text fallback — if a sessionId is provided we use the
   *  session's notes; otherwise this is the source. */
  rawText: z.string().max(50_000).optional(),
});

export async function extractSoulFileInsights(
  input: z.input<typeof extractSchema>,
): Promise<
  | { ok: true; created: number }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = extractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  // Resolve source text + Soul File.
  const ctx = await withSystemContext(async (tx) => {
    const [soul] = await tx
      .select()
      .from(soulFiles)
      .where(eq(soulFiles.engagementId, parsed.data.engagementId))
      .limit(1);
    let sourceText = parsed.data.rawText ?? "";
    if (parsed.data.sessionId) {
      const [session] = await tx
        .select({ notes: bbsSessions.notes })
        .from(bbsSessions)
        .where(eq(bbsSessions.id, parsed.data.sessionId))
        .limit(1);
      if (session?.notes && session.notes.trim().length > 0) {
        sourceText = session.notes;
      }
    }
    return { soul: soul ?? null, sourceText };
  });

  if (!ctx.soul) {
    return {
      ok: false,
      error: "Soul File doesn't exist yet — start writing it first.",
    };
  }
  if (!ctx.sourceText || ctx.sourceText.trim().length < 50) {
    return {
      ok: false,
      error:
        "Not enough source text. Paste in session notes (or a transcript) of at least a couple paragraphs.",
    };
  }

  // Ask Claude for insights.
  let bulletText = "";
  try {
    const r = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.4,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Session transcript / notes to extract Soul File insights from:\n\n" +
            ctx.sourceText,
        },
      ],
    });
    bulletText = r.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Claude couldn't reach the API: ${e.message}`
          : "Claude is offline right now.",
    };
  }

  // Split bullet text into individual insights. Accept lines starting
  // with -, *, or • as bullet markers.
  const bullets = bulletText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 8);

  if (bullets.length === 0) {
    return { ok: true, created: 0 };
  }

  // Persist as pending insights.
  await withTenantContext(profile.orgId, async (tx) => {
    for (const body of bullets) {
      await tx.insert(soulFileAiInsights).values({
        orgId: profile.orgId,
        soulFileId: ctx.soul!.id,
        sourceSessionId: parsed.data.sessionId ?? null,
        body,
        status: "pending",
      });
    }
  });

  revalidatePath(`/coach/soul-file/${parsed.data.engagementId}`);
  return { ok: true, created: bullets.length };
}

export async function acceptSoulFileInsight(
  insightId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      const [insight] = await tx
        .select()
        .from(soulFileAiInsights)
        .where(eq(soulFileAiInsights.id, insightId))
        .limit(1);
      if (!insight) throw new Error("Insight not found.");
      const [soul] = await tx
        .select()
        .from(soulFiles)
        .where(eq(soulFiles.id, insight.soulFileId))
        .limit(1);
      if (!soul) throw new Error("Soul File missing.");
      const stamp = new Date().toLocaleDateString("en-CA");
      const appendSection = `\n\n---\n_AI insight, ${stamp}:_\n${insight.body}`;
      await tx
        .update(soulFiles)
        .set({
          body: (soul.body ?? "") + appendSection,
          lastEditorUserProfileId: profile.userProfileId,
          updatedAt: new Date(),
        })
        .where(eq(soulFiles.id, soul.id));
      await tx
        .update(soulFileAiInsights)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(soulFileAiInsights.id, insightId));
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  } finally {
    // Caller decides which path to revalidate.
  }
}

export async function dismissSoulFileInsight(
  insightId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(soulFileAiInsights)
        .set({ status: "dismissed", dismissedAt: new Date() })
        .where(eq(soulFileAiInsights.id, insightId));
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/** Pending insights for the given Soul File. */
export async function listPendingInsights(
  soulFileId: string,
): Promise<
  Array<{
    id: string;
    body: string;
    createdAt: Date;
  }>
> {
  return withSystemContext(async (tx) => {
    return tx
      .select({
        id: soulFileAiInsights.id,
        body: soulFileAiInsights.body,
        createdAt: soulFileAiInsights.createdAt,
      })
      .from(soulFileAiInsights)
      .where(
        and(
          eq(soulFileAiInsights.soulFileId, soulFileId),
          eq(soulFileAiInsights.status, "pending"),
        ),
      )
      .orderBy(desc(soulFileAiInsights.createdAt));
  });
}
