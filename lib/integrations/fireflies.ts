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
