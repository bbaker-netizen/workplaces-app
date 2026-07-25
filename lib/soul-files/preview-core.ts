/**
 * Soul File draft CORE (prospect preview) — framework-agnostic, Clerk-free.
 *
 * Imported by a Netlify Background Function so the heavy work — paginating
 * Fireflies (up to 400 transcripts to title-match), pulling 3 full
 * transcripts, then a big Claude call — runs with a 15-minute budget instead
 * of dying at Netlify's ~26s synchronous ceiling. That timeout is exactly
 * what produced the "took too long or the connection dropped" error on the
 * prospect's Soul File draft button.
 *
 * `getProspect` already runs under withSystemContext (no signed-in user), so
 * this is safe to call from the background function. Throws on hard failure;
 * the caller records the message.
 */

import { getProspect } from "@/lib/db/queries/prospects";
import { complete } from "@/lib/ai/anthropic";
import {
  fetchTranscript,
  listRecentTranscripts,
  searchTranscriptsByAttendee,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";
import { normalizeName } from "@/lib/sync/match-emails";

const TRANSCRIPT_CHAR_CAP = 60_000;

export const SOUL_FILE_DRAFT_SYSTEM = `You are writing a Business Builder insights brief on a coaching client — the catch-up document a brand-new Business Builder would read to get fully up to speed before walking into a session, as if they were taking over the relationship cold.

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

export type SoulFileDraftData = {
  body: string;
  transcriptCount: number;
  transcriptTitles: string[];
};

/** A hard failure the operator should see verbatim in the drawer. */
export class SoulFileDraftError extends Error {}

/**
 * Find this prospect's recent Fireflies recordings, pull the transcripts, and
 * draft the Soul File. Pure work, no auth — the caller has already authorized.
 */
export async function runSoulFileDraftForProspect(
  prospectId: string,
): Promise<SoulFileDraftData> {
  const prospect = await getProspect(prospectId);
  if (!prospect) throw new SoulFileDraftError("Prospect not found.");

  // Match recordings to the prospect two ways (attendee email + title scan),
  // same as the original synchronous path.
  const companyNorm = normalizeName(prospect.companyName ?? "");
  const contactNorm = normalizeName(prospect.contactName ?? "");
  const titlePrefix = companyNorm ? `prospect ${companyNorm}` : null;
  const nameNeedles = Array.from(
    new Set([companyNorm, contactNorm].filter((n) => n.length >= 5)),
  );
  const wantTitleScan = Boolean(titlePrefix) || nameNeedles.length > 0;

  if (!prospect.contactEmail && !wantTitleScan) {
    throw new SoulFileDraftError(
      "This prospect has no email and no company name — Fireflies needs one of them to find recordings.",
    );
  }

  type Summary = Awaited<
    ReturnType<typeof searchTranscriptsByAttendee>
  >[number];
  const byId = new Map<string, Summary>();
  const [byAttendee, recent] = await Promise.all([
    prospect.contactEmail
      ? searchTranscriptsByAttendee(prospect.contactEmail, { limit: 5 })
      : Promise.resolve([]),
    wantTitleScan
      ? listRecentTranscripts({ maxTotal: 400 })
      : Promise.resolve([]),
  ]);
  for (const t of byAttendee) byId.set(t.id, t);
  if (wantTitleScan) {
    for (const t of recent) {
      const tn = normalizeName(t.title ?? "");
      const hit =
        (titlePrefix !== null && tn.startsWith(titlePrefix)) ||
        nameNeedles.some((n) => tn.includes(n));
      if (hit) byId.set(t.id, t);
    }
  }

  const summaries = Array.from(byId.values())
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    .slice(0, 3);

  if (summaries.length === 0) {
    const emailPart = prospect.contactEmail
      ? `${prospect.contactEmail} wasn't a captured attendee on any call`
      : "this prospect has no email on file";
    throw new SoulFileDraftError(
      `No Fireflies recordings found for ${prospect.companyName}. Either ${emailPart}, or no recording is titled "Prospect — ${prospect.companyName}". For in-person meetings, title the Fireflies recording "Prospect — ${prospect.companyName}" so it gets picked up.`,
    );
  }

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
    throw new SoulFileDraftError(
      "Found transcript metadata but none of the bodies could be fetched. Try again in a minute.",
    );
  }

  const userPrompt = [
    `Client: ${prospect.companyName}`,
    `Contact: ${prospect.contactName ?? "(unknown)"} · ${prospect.contactEmail}`,
    `Number of recent sessions: ${fetched.length}`,
    "",
    "Transcripts (oldest first):",
    "",
    ...fetched.reverse(),
  ].join("\n");

  const result = await complete({
    system: SOUL_FILE_DRAFT_SYSTEM,
    user: userPrompt,
    model: "claude-sonnet-5",
    maxTokens: 3500,
    temperature: 0.5,
  });
  const body = result.text.trim();
  if (!body || body.length < 100) {
    throw new SoulFileDraftError("Claude returned an empty draft.");
  }

  return { body, transcriptCount: fetched.length, transcriptTitles: titles };
}
