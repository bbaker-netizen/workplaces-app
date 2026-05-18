/**
 * Seed a Soul File from recent Fireflies transcripts.
 *
 * When Bruce creates a new engagement and ticks "Seed from
 * Fireflies", this helper fires post-engagement-creation. It:
 *
 *   1. Searches Fireflies for the last N transcripts where the
 *      client lead's email is in the attendee list.
 *   2. Pulls each transcript's text (capped per-transcript so we
 *      don't blow Claude's context window for marathon meetings).
 *   3. Sends the concatenated transcripts to Claude with a prompt
 *      to draft a Soul-File-shaped starter document.
 *   4. Writes the result into the soul_files table for the
 *      engagement (via system context — RLS bypass — because this
 *      runs synchronously inside the engagement creation flow and
 *      the soul_files RLS policy on the brand-new client org
 *      wouldn't recognise Bruce's master-org GUC yet).
 *
 * Best-effort: if Fireflies has no matching transcripts (which is
 * the common case for first-time clients), or the API errors,
 * we log and return — the engagement still works, the Soul File
 * is just empty until Bruce writes it.
 */

import { complete } from "@/lib/ai/anthropic";
import { soulFiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  fetchTranscript,
  searchTranscriptsByAttendee,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";

const SOUL_FILE_DRAFT_SYSTEM = `You are drafting a starter "Soul File" for a coaching engagement — a long-form context document that captures the most important things a business coach needs to know about a client.

A Soul File is structured around six sections in this exact order:

# Why this engagement exists
The pain that brought the client to coaching. The "if we don't fix this, what breaks" statement in their words.

# Where they are today
Snapshot of the business: stage, size, what they sell, who's running it, what's working, what's stuck.

# Where they want to be in 12 months
The picture the founder paints when asked. Top-line revenue target, headcount, hours of personal time, anything specific.

# Strategic backdrop
Industry, market, competitive position, macro forces affecting them. Why now matters.

# Founders
Who's at the helm. Names, backgrounds, working styles, what they each own. The personal stakes.

# Hard-won learnings
Things they've already tried that didn't work, things they've learned the hard way, beliefs they hold strongly.

You will receive transcript text from one or more recent meetings between the coach and the client. Your job: synthesize what the transcripts reveal into this six-section structure.

Rules:
- Markdown output only. Use the section headings shown above (single #), nothing else.
- Each section is 2-6 sentences of dense plain-spoken prose. NOT bullet points unless the transcripts literally list things.
- If a section has no evidence in the transcripts, write "_To be discussed in an upcoming session._" — do not invent.
- No preamble. No "Here is the Soul File…". Start with the first heading.
- No closing remarks. End after the last section.
- First person from the coach's POV is fine ("we talked about", "they want"). Never quote sentences verbatim — paraphrase.
- Keep numbers and proper nouns exact as they appear in transcripts.
- This is a starter draft. The coach will edit it.`;

const TRANSCRIPT_CHAR_CAP = 60_000;

export type SeedSoulFileResult =
  | {
      kind: "seeded";
      transcriptCount: number;
      bodyLength: number;
    }
  | { kind: "no_transcripts" }
  | { kind: "skipped"; reason: string };

export async function seedSoulFileFromFireflies(args: {
  engagementId: string;
  engagementOrgId: string;
  clientLeadEmail: string;
  engagementName: string;
  senderUserProfileId: string;
  maxTranscripts?: number;
}): Promise<SeedSoulFileResult> {
  if (!process.env.FIREFLIES_API_KEY) {
    return { kind: "skipped", reason: "FIREFLIES_API_KEY not configured" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { kind: "skipped", reason: "ANTHROPIC_API_KEY not configured" };
  }

  // 1. Search Fireflies for transcripts where this client was an attendee.
  let summaries;
  try {
    summaries = await searchTranscriptsByAttendee(args.clientLeadEmail, {
      limit: args.maxTranscripts ?? 3,
    });
  } catch (e) {
    return {
      kind: "skipped",
      reason: `Fireflies search failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (summaries.length === 0) {
    return { kind: "no_transcripts" };
  }

  // 2. Pull each transcript's text. Fail fast on partial errors — if
  //    we got 3 hits but only 2 fetched, still build the draft from 2.
  const fetched: string[] = [];
  for (const s of summaries) {
    try {
      const full = await fetchTranscript(s.id);
      if (!full) continue;
      const text = transcriptToPlainText(full, {
        maxChars: Math.floor(TRANSCRIPT_CHAR_CAP / summaries.length),
      });
      if (text.trim().length > 0) {
        const dateLabel = new Date(s.date).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        fetched.push(`# Meeting — ${dateLabel} — ${s.title}\n\n${text}`);
      }
    } catch (e) {
      console.warn(
        `[seed-soul-file] couldn't fetch Fireflies transcript ${s.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (fetched.length === 0) {
    return { kind: "no_transcripts" };
  }

  // 3. Draft via Claude.
  const userPrompt = [
    `Client engagement: ${args.engagementName}`,
    `Client lead email: ${args.clientLeadEmail}`,
    `Number of recent sessions: ${fetched.length}`,
    "",
    "Transcripts (oldest first):",
    "",
    ...fetched.reverse(), // oldest first so Claude can sense the arc
  ].join("\n");

  let body: string;
  try {
    const result = await complete({
      system: SOUL_FILE_DRAFT_SYSTEM,
      user: userPrompt,
      model: "claude-sonnet-4-6",
      maxTokens: 3500,
      temperature: 0.5,
    });
    body = result.text.trim();
  } catch (e) {
    return {
      kind: "skipped",
      reason: `Claude draft failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!body || body.length < 100) {
    return { kind: "skipped", reason: "Claude returned an empty draft" };
  }

  // Tack on a small footer so Bruce knows the source + that this is a
  // starter draft, not the final IP.
  const finalBody = `${body}\n\n---\n\n_Starter draft auto-generated from ${fetched.length} recent Fireflies transcript(s). Edit freely._`;

  // 4. Insert into soul_files. System context bypasses RLS so the
  //    brand-new client org accepts a write without an authenticated
  //    session bound to it.
  try {
    await withSystemContext(async (tx) => {
      await tx
        .insert(soulFiles)
        .values({
          orgId: args.engagementOrgId,
          engagementId: args.engagementId,
          body: finalBody,
          lastEditorUserProfileId: args.senderUserProfileId,
        })
        .onConflictDoNothing();
    });
  } catch (e) {
    return {
      kind: "skipped",
      reason: `Soul File insert failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    kind: "seeded",
    transcriptCount: fetched.length,
    bodyLength: finalBody.length,
  };
}
