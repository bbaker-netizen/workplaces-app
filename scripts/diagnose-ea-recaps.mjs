/**
 * Read-only diagnosis: why are session recaps ("business notes") and
 * drafted agendas not arriving?
 *
 * Both features hang off the SAME chain, and a break anywhere in it is
 * silent — the only symptom is an email that never comes, which looks
 * exactly like a quiet week. This walks the chain link by link and says
 * which link is empty:
 *
 *   Google Calendar event
 *     -> bbs_sessions row              (calendar-sync, every 30 min)
 *        -> Fireflies transcript       (fireflies-sync, hourly)
 *           -> engagement_meetings row
 *              -> matched by client+time to the session
 *                 -> bbs_sessions.fireflies_recording_id set
 *                    -> session_recaps row drafted   <- the recap email
 *
 *   bbs_sessions row scheduled TODAY
 *     -> ea_digests row for today (the 07:00 briefing)
 *        -> ea_agenda_proposals row                  <- the agenda
 *
 * Writes nothing. Deletes nothing. Sends nothing.
 *
 * Run: node scripts/diagnose-ea-recaps.mjs
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
    "No DATABASE_URL / DATABASE_URL_OWNER set.\n" +
      "Copy the production value from Netlify -> Site configuration ->\n" +
      "Environment variables into .env.local, then re-run.",
  );
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(dbUrl);

const h = (s) => console.log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`);
const line = (s) => console.log(`  ${s}`);
const fmt = (d) =>
  d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + "Z" : "—";

/* ---------- 0. Do the tables even exist? (did 0086/0090 apply?) ------ */

h("0. Migrations — do the EA tables exist in this database?");
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('ea_digests','session_recaps','ea_agenda_proposals',
                       'ea_job_runs','bbs_sessions','engagement_meetings')
  ORDER BY table_name`;
const present = new Set(tables.map((t) => t.table_name));
for (const t of [
  "bbs_sessions",
  "ea_agenda_proposals",
  "ea_digests",
  "ea_job_runs",
  "engagement_meetings",
  "session_recaps",
]) {
  line(`${present.has(t) ? "OK    " : "MISSING"}  ${t}`);
}
if (!present.has("session_recaps") || !present.has("ea_agenda_proposals")) {
  console.log(
    "\n>> A table is missing: the migration has not applied to this database.\n" +
      ">> Nothing downstream can possibly have run. Stop here.",
  );
  process.exit(0);
}

/* ---------- 1. Heartbeat — are the jobs firing at all? --------------- */

h("1. Heartbeat — has each background job run, and when?");
const runs = await sql`
  SELECT DISTINCT ON (job_id)
    job_id, completed_at, status, items_processed, error_text
  FROM ea_job_runs
  ORDER BY job_id, completed_at DESC`;
const seen = new Map(runs.map((r) => [r.job_id, r]));
for (const job of [
  "ea-daily-digest",
  "ea-time-blocks",
  "ea-recap-sweep",
  "ea-inbox-sweep",
  "ea-client-nudge",
  "ea-friday-rollup",
]) {
  const r = seen.get(job);
  if (!r) {
    line(`NEVER RUN   ${job}`);
    continue;
  }
  const ageH = (Date.now() - new Date(r.completed_at).getTime()) / 36e5;
  const stale = ageH > 24 * 8 ? "  <-- STALE" : "";
  line(
    `${r.status.padEnd(10)}  ${job.padEnd(18)}  last ${fmt(r.completed_at)}  ` +
      `(${ageH.toFixed(1)}h ago)  items=${r.items_processed}${stale}` +
      (r.error_text ? `\n              error: ${r.error_text}` : ""),
  );
}
const totalRuns = await sql`SELECT count(*)::int AS n FROM ea_job_runs`;
line(`\n  total job-run rows ever recorded: ${totalRuns[0].n}`);

/* ---------- 2. Sessions — is anything being recorded? ---------------- */

h("2. Sessions — bbs_sessions in the last 30 days (non-internal)");
const sessions = await sql`
  SELECT s.id, s.scheduled_at, s.status, s.fireflies_recording_id,
         e.name AS engagement
  FROM bbs_sessions s
  JOIN engagements e ON e.id = s.engagement_id
  WHERE s.scheduled_at > now() - interval '30 days'
    AND coalesce(e.is_internal, false) = false
  ORDER BY s.scheduled_at DESC`;
line(`count: ${sessions.length}`);
if (sessions.length === 0) {
  line("No client sessions recorded in 30 days.");
  line("=> Nothing to recap and nothing to draft an agenda for.");
} else {
  const withTx = sessions.filter((s) => s.fireflies_recording_id).length;
  line(`with a transcript attached: ${withTx} / ${sessions.length}`);
  line("");
  for (const s of sessions.slice(0, 25)) {
    line(
      `${fmt(s.scheduled_at)}  ${String(s.status).padEnd(10)}  ` +
        `${s.fireflies_recording_id ? "transcript" : "NO TRANSCRIPT"}  ` +
        `${s.engagement}`,
    );
  }
  if (sessions.length > 25) line(`… and ${sessions.length - 25} more`);
}

/* ---------- 3. Transcripts — is Fireflies data landing? -------------- */

h("3. Transcripts — engagement_meetings in the last 30 days");
const meetings = await sql`
  SELECT m.id, m.occurred_at, m.title, e.name AS engagement
  FROM engagement_meetings m
  JOIN engagements e ON e.id = m.engagement_id
  WHERE m.occurred_at > now() - interval '30 days'
  ORDER BY m.occurred_at DESC`;
line(`count: ${meetings.length}`);
for (const m of meetings.slice(0, 15)) {
  line(`${fmt(m.occurred_at)}  ${m.engagement} — ${m.title}`);
}
if (meetings.length > 15) line(`… and ${meetings.length - 15} more`);

/* ---------- 4. The join — would matching have worked? ---------------- */

h("4. The join — past sessions with no transcript: is one in range?");
const orphans = await sql`
  SELECT s.id, s.scheduled_at, e.name AS engagement,
    (SELECT count(*)::int FROM engagement_meetings m
      WHERE m.engagement_id = s.engagement_id
        AND m.occurred_at BETWEEN s.scheduled_at - interval '120 minutes'
                              AND s.scheduled_at + interval '120 minutes'
    ) AS candidates
  FROM bbs_sessions s
  JOIN engagements e ON e.id = s.engagement_id
  WHERE s.fireflies_recording_id IS NULL
    AND s.scheduled_at < now()
    AND s.scheduled_at > now() - interval '30 days'
    AND s.status <> 'cancelled'
    AND coalesce(e.is_internal, false) = false
  ORDER BY s.scheduled_at DESC`;
line(`unmatched past sessions: ${orphans.length}`);
for (const o of orphans.slice(0, 25)) {
  line(
    `${fmt(o.scheduled_at)}  ${o.engagement}  ` +
      (o.candidates === 0
        ? "no transcript within ±2h  (nothing to match)"
        : `${o.candidates} candidate transcript(s) in range  <-- MATCH SHOULD HAVE HAPPENED`),
  );
}
line("");
line(
  "NOTE: the sweep only looks back 7 DAYS. Anything older than that is " +
    "never matched and never recapped, by design.",
);

/* ---------- 5. Recaps ------------------------------------------------ */

h("5. Recaps — session_recaps rows");
const recaps = await sql`
  SELECT r.id, r.status, r.subject, r.created_at, r.sent_at, e.name AS engagement
  FROM session_recaps r
  JOIN engagements e ON e.id = r.engagement_id
  ORDER BY r.created_at DESC
  LIMIT 20`;
line(`most recent ${recaps.length} (of all time):`);
for (const r of recaps) {
  line(
    `${fmt(r.created_at)}  ${String(r.status).padEnd(9)}  sent=${fmt(r.sent_at)}  ` +
      `${r.engagement} — ${r.subject}`,
  );
}
if (recaps.length === 0) line("NONE — no recap has ever been drafted.");

/* ---------- 6. Agendas ----------------------------------------------- */

h("6. Agendas — ea_agenda_proposals rows");
const props = await sql`
  SELECT p.id, p.status, p.created_at, p.accepted_at,
         jsonb_array_length(p.items) AS n_items, e.name AS engagement
  FROM ea_agenda_proposals p
  JOIN engagements e ON e.id = p.engagement_id
  ORDER BY p.created_at DESC
  LIMIT 20`;
line(`most recent ${props.length} (of all time):`);
for (const p of props) {
  line(
    `${fmt(p.created_at)}  ${String(p.status).padEnd(9)}  ${p.n_items} items  ` +
      `${p.engagement}`,
  );
}
if (props.length === 0) line("NONE — no agenda has ever been proposed.");

/* ---------- 7. Digests — is the 07:00 briefing being produced? ------- */

h("7. Briefings — ea_digests rows (the agenda rides this email)");
const digests = await sql`
  SELECT d.sent_for_date, d.sent_at, u.full_name, u.email
  FROM ea_digests d
  JOIN user_profiles u ON u.id = d.user_profile_id
  ORDER BY d.sent_for_date DESC, u.full_name
  LIMIT 20`;
for (const d of digests) {
  line(
    `${d.sent_for_date}  ${d.sent_at ? "SENT " + fmt(d.sent_at) : "NOT SENT (row claimed, email failed)"}  ` +
      `${d.full_name} <${d.email}>`,
  );
}
if (digests.length === 0) line("NONE — the morning briefing has never run.");

/* ---------- 8. Today ------------------------------------------------- */

h("8. Today — sessions scheduled today (these are what get an agenda)");
const today = await sql`
  SELECT s.scheduled_at, s.status, e.name AS engagement
  FROM bbs_sessions s
  JOIN engagements e ON e.id = s.engagement_id
  WHERE s.scheduled_at::date = (now() AT TIME ZONE 'America/Edmonton')::date
    AND coalesce(e.is_internal, false) = false
  ORDER BY s.scheduled_at`;
line(`count: ${today.length}`);
for (const t of today) line(`${fmt(t.scheduled_at)}  ${t.status}  ${t.engagement}`);
if (today.length === 0)
  line("No sessions today => no agenda would be drafted today. Expected.");

console.log("\nDone. Nothing was modified.\n");
