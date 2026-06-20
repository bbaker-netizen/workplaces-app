/**
 * Fireflies API wrapper.
 *
 * Phase 2.3. Fetches a recorded meeting's transcript by id, optionally
 * normalizes attendee/speaker mapping for the action-item extractor.
 *
 * Auth: `FIREFLIES_API_KEY` from
 * https://app.fireflies.ai/settings/developer-portal.
 *
 * Fireflies' API is GraphQL. We POST to /graphql with a query for
 * the transcript shape we need. Phase 2.3 keeps the surface tight —
 * just enough to feed the action-item extractor.
 */

const ENDPOINT = "https://api.fireflies.ai/graphql";

function token(): string {
  const t = process.env.FIREFLIES_API_KEY;
  if (!t) {
    throw new Error(
      "FIREFLIES_API_KEY not configured. Get one at https://app.fireflies.ai/settings/developer-portal.",
    );
  }
  return t;
}

export type FirefliesSentence = {
  text: string;
  speaker_name: string | null;
  speaker_id: number | null;
  start_time: number;
  end_time: number;
};

export type FirefliesTranscript = {
  id: string;
  title: string;
  date: number; // ms epoch
  duration: number; // minutes
  organizer_email: string | null;
  meeting_attendees: Array<{
    email: string | null;
    displayName: string | null;
  }>;
  sentences: FirefliesSentence[];
};

export async function fetchTranscript(
  transcriptId: string,
): Promise<FirefliesTranscript | null> {
  const query = /* GraphQL */ `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        organizer_email
        meeting_attendees {
          email
          displayName
        }
        sentences {
          text
          speaker_name
          speaker_id
          start_time
          end_time
        }
      }
    }
  `;
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: transcriptId } }),
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(
      `Fireflies API failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const json = (await resp.json()) as {
    data?: { transcript: FirefliesTranscript | null };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Fireflies API: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return json.data?.transcript ?? null;
}

export type FirefliesTranscriptSummary = {
  id: string;
  title: string;
  date: number;
  duration: number;
  organizer_email: string | null;
};

/**
 * Rich meeting record used by the engagement Meetings sync. Includes
 * Fireflies' generated summary (overview / bullets / keywords) but
 * intentionally omits sentences and action items — we capture
 * meetings here for review, the action-item pipeline runs separately.
 */
export type FirefliesMeetingDetail = {
  id: string;
  title: string;
  date: number;
  duration: number;
  organizer_email: string | null;
  transcript_url: string | null;
  meeting_attendees: Array<{
    email: string | null;
    displayName: string | null;
  }>;
  summary: {
    overview: string | null;
    shorthand_bullet: string | null;
    keywords: string[] | null;
  } | null;
};

/**
 * Fetch a single transcript's metadata + Fireflies-generated summary
 * (no sentences). Lighter payload than fetchTranscript — used by the
 * engagement-meetings sync, which doesn't need the full transcript
 * body.
 */
export async function fetchMeetingDetail(
  transcriptId: string,
): Promise<FirefliesMeetingDetail | null> {
  const query = /* GraphQL */ `
    query MeetingDetail($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        organizer_email
        transcript_url
        meeting_attendees {
          email
          displayName
        }
        summary {
          overview
          shorthand_bullet
          keywords
        }
      }
    }
  `;
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: transcriptId } }),
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(
      `Fireflies meeting fetch failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const json = (await resp.json()) as {
    data?: { transcript: FirefliesMeetingDetail | null };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Fireflies: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return json.data?.transcript ?? null;
}

/**
 * Search Fireflies for recent transcripts that include the given
 * email address as an attendee. Used by the Soul-File auto-seed on
 * engagement creation — we want the last N sessions Bruce ran with
 * this client (if any) so Claude can draft a starter Soul File.
 *
 * Returns transcripts ordered newest first. Limit defaults to 3.
 * Returns an empty array if the email never appears in any
 * Fireflies attendee list.
 */
export async function searchTranscriptsByAttendee(
  participantEmail: string,
  opts: { limit?: number } = {},
): Promise<FirefliesTranscriptSummary[]> {
  const limit = opts.limit ?? 3;
  const query = /* GraphQL */ `
    query FindForAttendee($email: String!, $limit: Int!) {
      transcripts(participant_email: $email, limit: $limit) {
        id
        title
        date
        duration
        organizer_email
      }
    }
  `;
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { email: participantEmail.toLowerCase(), limit },
    }),
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(
      `Fireflies search failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const json = (await resp.json()) as {
    data?: { transcripts: FirefliesTranscriptSummary[] | null };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Fireflies search: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const list = json.data?.transcripts ?? [];
  // Fireflies' ordering isn't guaranteed — sort newest-first ourselves.
  return list.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

/**
 * List the workspace's transcripts with their titles AND attendees,
 * newest first. Used by the engagement-meetings sync to attribute each
 * meeting to a client by TITLE (Bruce names BBS recordings
 * "<Client> - Business Building Session …") or by a client-unique attendee
 * email. Title matching is essential because in-person sessions often
 * capture only the coach as an attendee.
 *
 * Fireflies caps each query at 50, so we paginate with `skip` up to
 * `maxTotal` (default 1000) to cover the full meeting history.
 */
export type RecentTranscript = FirefliesTranscriptSummary & {
  meeting_attendees: Array<{ email: string | null; displayName: string | null }>;
};

export async function listRecentTranscripts(
  opts: { maxTotal?: number } = {},
): Promise<RecentTranscript[]> {
  const maxTotal = opts.maxTotal ?? 1000;
  const PAGE = 50;
  const query = /* GraphQL */ `
    query RecentTranscripts($limit: Int!, $skip: Int!) {
      transcripts(limit: $limit, skip: $skip) {
        id
        title
        date
        duration
        organizer_email
        meeting_attendees {
          email
          displayName
        }
      }
    }
  `;
  const all: RecentTranscript[] = [];
  for (let skip = 0; skip < maxTotal; skip += PAGE) {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { limit: PAGE, skip } }),
      cache: "no-store",
    });
    if (!resp.ok) {
      // First page failing is fatal; later pages — return what we have.
      if (skip === 0) {
        throw new Error(
          `Fireflies transcripts failed (${resp.status}): ${await resp.text()}`,
        );
      }
      break;
    }
    const json = (await resp.json()) as {
      data?: { transcripts: RecentTranscript[] | null };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      if (skip === 0) {
        throw new Error(
          `Fireflies transcripts: ${json.errors.map((e) => e.message).join("; ")}`,
        );
      }
      break;
    }
    const page = json.data?.transcripts ?? [];
    all.push(...page);
    if (page.length < PAGE) break; // last page reached
  }
  return all.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}

/**
 * Flatten a transcript's sentences into a plain text block tagged
 * with speaker names. The output goes into the LLM action-item
 * extractor.
 */
export function transcriptToPlainText(
  transcript: FirefliesTranscript,
  options: { maxChars?: number } = {},
): string {
  const max = options.maxChars ?? 200_000;
  const lines: string[] = [];
  let total = 0;
  for (const s of transcript.sentences) {
    const speaker = s.speaker_name ?? "Unknown";
    const line = `${speaker}: ${s.text}`;
    total += line.length + 1;
    if (total > max) break;
    lines.push(line);
  }
  return lines.join("\n");
}
