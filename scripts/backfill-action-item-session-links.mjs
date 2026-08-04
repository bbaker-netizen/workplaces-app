/**
 * Backfill `action_items.bbs_session_id` from the transcript the item was
 * drafted out of.
 *
 * WHY IT IS NEEDED. An action item drafted from a meeting needs two
 * links: `engagement_meeting_id`, which the meeting workspace queries,
 * and `bbs_session_id`, which the client recap's "Who is doing what"
 * section queries. Until 2026-08-04 the workspace drafting path wrote
 * only the first — `bbsSessionId: null`, hard-coded — so no recap could
 * ever list a commitment, whatever was published. Both drafting paths
 * now write both links; this repairs the rows written before that.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH: drafts.
 *
 * Linking a row to a session makes it reachable from the CLIENT-facing
 * session page. Repairing the drafts here would make unreviewed
 * machine-written items client-reachable the instant this runs — ahead
 * of the deploy that carries the draft filter in
 * `listSessionActionItems`, and against the rule the draft status exists
 * to enforce. Drafts instead heal themselves at the moment they are
 * PUBLISHED (see the self-heal block in `lib/actions/action-items.ts`),
 * which is precisely when the link is allowed to matter. So this script
 * is only ever about rows that are already client-visible.
 *
 * SAFE TO RE-RUN. Only ever fills NULLs — a deliberate correction is
 * never stamped on. Only links where exactly ONE session matches, so an
 * ambiguous pairing is reported and skipped rather than guessed.
 *
 * Read-only unless `--apply` is passed. Default is a dry run.
 *
 *   node scripts/backfill-action-item-session-links.mjs
 *   node scripts/backfill-action-item-session-links.mjs --apply
 *
 * Needs DATABASE_URL (or DATABASE_URL_OWNER) in .env.local or the shell.
 */

import fs from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dbUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "No DATABASE_URL / DATABASE_URL_OWNER set. Copy the production value\n" +
      "from Netlify -> Site configuration -> Environment variables into\n" +
      ".env.local, then re-run.",
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(dbUrl);

console.log(apply ? "MODE: apply (writes)\n" : "MODE: dry run (no writes)\n");

/* ---- candidates: non-draft, no session link, but a transcript id ---- */

const candidates = await sql`
  select a.id, a.title, a.status, a.engagement_id,
         a.fireflies_transcript_id, e.name as engagement_name
  from action_items a
  join engagements e on e.id = a.engagement_id
  where a.bbs_session_id is null
    and a.fireflies_transcript_id is not null
    and a.status <> 'draft'
  order by e.name, a.created_at`;

console.log(`Non-draft items missing a session link: ${candidates.length}`);

const drafts = await sql`
  select count(*)::int as n from action_items
  where bbs_session_id is null and fireflies_transcript_id is not null
    and status = 'draft'`;
console.log(
  `Drafts skipped by design (they self-heal on publish): ${drafts[0].n}\n`,
);

if (candidates.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

let linked = 0;
let ambiguous = 0;
let noSession = 0;

for (const item of candidates) {
  const sessions = await sql`
    select id, scheduled_at from bbs_sessions
    where engagement_id = ${item.engagement_id}
      and fireflies_recording_id = ${item.fireflies_transcript_id}`;

  const label = `${item.engagement_name} · ${String(item.title).slice(0, 55)}`;

  if (sessions.length === 0) {
    noSession += 1;
    console.log(`  SKIP  no session for that transcript   ${label}`);
    continue;
  }
  if (sessions.length > 1) {
    ambiguous += 1;
    console.log(
      `  SKIP  ${sessions.length} sessions share that transcript  ${label}`,
    );
    continue;
  }

  const session = sessions[0];
  if (apply) {
    // Guarded on still being NULL: if something set the link between the
    // read above and this write, that one wins.
    await sql`
      update action_items set bbs_session_id = ${session.id}
      where id = ${item.id} and bbs_session_id is null`;
  }
  linked += 1;
  console.log(
    `  ${apply ? "LINK" : "WOULD"}  ${session.scheduled_at.toISOString().slice(0, 10)}  ${label}`,
  );
}

console.log(
  `\n${apply ? "Linked" : "Would link"}: ${linked}` +
    `   ambiguous: ${ambiguous}   no matching session: ${noSession}`,
);

if (apply) {
  const remaining = await sql`
    select count(*)::int as n from action_items
    where bbs_session_id is null and fireflies_transcript_id is not null
      and status <> 'draft'`;
  console.log(`Non-draft items still unlinked: ${remaining[0].n}`);
}
