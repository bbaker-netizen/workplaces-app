"use server";

/**
 * Preview-only Soul File draft from Fireflies.
 *
 * Lets Bruce see what a Soul File would look like for a prospect
 * WITHOUT formalising the prospect into an engagement first.
 * Useful for the imported Monday clients — he can see the draft
 * Claude would build before deciding whether to give them portal
 * access via /business-builder/engagements/new.
 *
 * Same engine as the engagement-create-time seeder
 * (lib/soul-files/seed-from-fireflies.ts), just returns the body
 * instead of writing it.
 *
 * Authz: master_admin / Coach only.
 */

import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getProspect } from "@/lib/db/queries/prospects";
import { complete } from "@/lib/ai/anthropic";
import {
  fetchTranscript,
  searchTranscriptsByAttendee,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";

const TRANSCRIPT_CHAR_CAP = 60_000;

// Same prompt as the engagement-create seeder so the previews match
// what'll be saved when the engagement is later formalised.
const SOUL_FILE_DRAFT_SYSTEM = `You are writing a Business Builder insights brief on a coaching client — the catch-up document a brand-new Business Builder would read to get fully up to speed before walking into a session, as if they were taking over the relationship cold.

Structure it around these sections, in this exact order:

# Why this engagement exists
The pain that brought the client to coaching. The "if we don't fix this, what breaks" statement in their words.

# Where they are today
Snapshot of the business: stage, size, what they sell, who's running it, what's working, what's stuck.

# Where they want to be in 12 months
The picture the founder paints when asked. Top-line revenue target, headcount, hours of personal time, anything specific.

# Who they are & how they like to work
The people at the helm — names, backgrounds, what they each own. Their communication and working style: how they like to be talked to, what they respond well to, what energises them, and what frustrates or turns them off. Their likes and dislikes.

# What to watch out for
Sensitivities, hot buttons, sore spots, and risks. Topics to handle carefully, commitments they tend to slip on, internal tensions, anything a new Business Builder could step on without realising. Be candid and specific.

# Where things stand & what's next
Momentum and status: what's been promised, what's been delivered, what's in progress, and what's outstanding or overdue. Then the concrete next actions — what needs to happen before or in the next session, and who owns it.

# Hard-won learnings
Things they've already tried that didn't work, things they've learned the hard way, beliefs they hold strongly.

You will receive transcript text from one or more recent meetings between the Business Builder and the client. Synthesize what the transcripts reveal into this structure.

Rules:
- Markdown output only. Use the section headings shown above (single #), nothing else.
- Each section is 2-6 sentences of dense, plain-spoken prose (the "what to watch out for" and "where things stand & what's next" sections may use a short bullet list if that's clearer).
- If a section has no evidence in the transcripts, write "_To be discussed in an upcoming session._" — do not invent.
- No preamble. No "Here is the brief…". Start with the first heading.
- No closing remarks. End after the last section.
- First person from the Business Builder's POV is fine ("we talked about", "they want"). Never quote sentences verbatim — paraphrase.
- Keep numbers and proper nouns exact as they appear in transcripts.
- This is a draft to review and edit.`;

const schema = z.object({
  prospectId: z.string().uuid(),
});

export type PreviewSoulFileResult =
  | {
      ok: true;
      data: {
        body: string;
        transcriptCount: number;
        transcriptTitles: string[];
      };
    }
  | {
      ok: false;
      error: string;
      kind?: "no_transcripts" | "missing_key" | "api_error" | "auth";
    };

export async function previewSoulFileDraft(input: {
  prospectId: string;
}): Promise<PreviewSoulFileResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not signed in.", kind: "auth" };
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only.", kind: "auth" };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  if (!process.env.FIREFLIES_API_KEY) {
    return {
      ok: false,
      error:
        "FIREFLIES_API_KEY isn't set in Netlify. Add it at /sites/workplaces-the-builder/settings/env and redeploy.",
      kind: "missing_key",
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY isn't set in Netlify.",
      kind: "missing_key",
    };
  }

  const prospect = await getProspect(parsed.data.prospectId);
  if (!prospect) {
    return { ok: false, error: "Prospect not found." };
  }
  if (!prospect.contactEmail) {
    return {
      ok: false,
      error: "This prospect has no email — Fireflies needs an attendee email to search.",
    };
  }

  // 1. Fireflies search.
  let summaries;
  try {
    summaries = await searchTranscriptsByAttendee(prospect.contactEmail, {
      limit: 3,
    });
  } catch (e) {
    return {
      ok: false,
      error: `Fireflies search failed: ${e instanceof Error ? e.message : String(e)}`,
      kind: "api_error",
    };
  }
  if (summaries.length === 0) {
    return {
      ok: false,
      error: `No Fireflies transcripts found where ${prospect.contactEmail} is an attendee. Make sure the email matches what they use on calls.`,
      kind: "no_transcripts",
    };
  }

  // 2. Pull each transcript's text.
  const fetched: string[] = [];
  const titles: string[] = [];
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
        titles.push(`${dateLabel} — ${s.title}`);
      }
    } catch (e) {
      console.warn(
        `[soul-file-preview] couldn't fetch ${s.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  if (fetched.length === 0) {
    return {
      ok: false,
      error:
        "Found transcript metadata but none of the bodies could be fetched. Try again in a minute.",
      kind: "api_error",
    };
  }

  // 3. Send to Claude.
  const userPrompt = [
    `Client: ${prospect.companyName}`,
    `Contact: ${prospect.contactName ?? "(unknown)"} · ${prospect.contactEmail}`,
    `Number of recent sessions: ${fetched.length}`,
    "",
    "Transcripts (oldest first):",
    "",
    ...fetched.reverse(),
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
      ok: false,
      error: `Claude draft failed: ${e instanceof Error ? e.message : String(e)}`,
      kind: "api_error",
    };
  }
  if (!body || body.length < 100) {
    return { ok: false, error: "Claude returned an empty draft." };
  }

  return {
    ok: true,
    data: {
      body,
      transcriptCount: fetched.length,
      transcriptTitles: titles,
    },
  };
}
