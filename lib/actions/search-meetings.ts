"use server";

/**
 * Client-facing AI search over a client's own meeting notes.
 *
 * The client asks a natural-language question ("what did we decide about
 * pricing?") and Claude answers strictly from THIS engagement's synced
 * Fireflies recaps, citing the meeting title + date. RLS-scoped via
 * getCurrentEngagement + listEngagementMeetings, so a client only ever
 * searches their own meetings. Available to clients (not just coaches),
 * unlike the coach-only Builder Buddy.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementMeetings } from "@/lib/db/queries/meetings";

const SYSTEM = `You are a helpful assistant that answers questions about a client's recorded Business Building Sessions, using ONLY the meeting notes provided.

Rules:
- Answer strictly from the meeting notes given. Never invent details.
- When you reference something, name the meeting it came from and its date, e.g. "(River City Doors — Business Building Session, Jun 8)".
- If the answer isn't in the notes, say so plainly: "I couldn't find that in your meeting notes." Don't guess.
- Be concise and plain-spoken. Use short paragraphs or bullets.
- These are the client's own meetings, so speak to them directly ("you discussed…").`;

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Edmonton",
  });
}

export async function searchClientMeetings(
  question: string,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Sign in first." };
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "Type a question first." };
  if (q.length > 2000) return { ok: false, error: "That question is too long." };

  const engagement = await getCurrentEngagement();
  if (!engagement) return { ok: false, error: "No engagement found." };

  const meetings = await listEngagementMeetings(engagement.id);
  if (meetings.length === 0) {
    return {
      ok: false,
      error: "No meeting notes have synced yet — nothing to search.",
    };
  }

  // Build a compact context from the synced recaps, newest first, capped.
  let context = "";
  for (const m of meetings) {
    const block =
      `## ${m.title} — ${formatDate(m.occurredAt)}\n` +
      (m.summaryOverview ? `${m.summaryOverview}\n` : "") +
      (m.summaryBullets ? `${m.summaryBullets}\n` : "") +
      (m.summaryKeywords ? `Keywords: ${m.summaryKeywords}\n` : "");
    if (context.length + block.length > 120_000) break;
    context += block + "\n";
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ok: false, error: "Search is unavailable right now." };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      temperature: 0.2,
      system: [{ type: "text", text: SYSTEM }],
      messages: [
        {
          role: "user",
          content: `Here are my meeting notes:\n\n${context}\n\n---\n\nMy question: ${q}`,
        },
      ],
    });
    const reply = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!reply) return { ok: false, error: "No answer came back. Try again?" };
    return { ok: true, reply };
  } catch (e) {
    console.error("[search-meetings] failed:", e);
    return {
      ok: false,
      error:
        e instanceof Error ? `Search hit a snag: ${e.message}` : "Search is offline.",
    };
  }
}
