/**
 * Delete session recaps that were drafted as the old empty fallback, so
 * the sweep can draft them properly.
 *
 * `session_recaps.bbs_session_id` is UNIQUE — one recap per session,
 * ever. That is the right rule, but it means the boilerplate recaps
 * produced before the prose failure was made fatal have permanently
 * consumed their session's only slot. The fixed code will never redraft
 * them because a recap already exists.
 *
 * SAFETY: only ever touches rows that are ALL of:
 *   - status = 'draft'          (never approved, never sent)
 *   - approved_at IS NULL
 *   - sent_at IS NULL
 *   - message_id IS NULL        (never filed on a client portal thread)
 *   - body carries no decisions and no commitments — i.e. it is the
 *     fallback shell, not a real recap someone is still reading
 *
 * A recap that reached a client, or that has genuine content, is never
 * a candidate. Deleting the row does not touch the session, the
 * transcript, or any action item.
 *
 *   node scripts/clear-empty-recaps.mjs           # report only
 *   node scripts/clear-empty-recaps.mjs --apply   # delete
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      if (!/^[A-Z_]+=/.test(line)) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* fall through */
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const url = env.DATABASE_URL_OWNER || env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL_OWNER or DATABASE_URL.");
  process.exit(1);
}
const sql = neon(url);

const rows = await sql`
  select r.id, r.subject, r.body_markdown, r.created_at,
         e.name as engagement, s.scheduled_at, s.fireflies_recording_id
  from session_recaps r
  join engagements e on e.id = r.engagement_id
  join bbs_sessions s on s.id = r.bbs_session_id
  where r.status = 'draft'
    and r.approved_at is null
    and r.sent_at is null
    and r.message_id is null
  order by r.created_at desc`;

// The fallback shell has neither of the two sections that carry
// substance. A real recap always has at least one.
const empty = rows.filter(
  (r) =>
    !(r.body_markdown ?? "").includes("### What we decided") &&
    !(r.body_markdown ?? "").includes("### Who is doing what"),
);

if (empty.length === 0) {
  console.log(`No empty draft recaps. (${rows.length} unsent draft(s) checked.)`);
  process.exit(0);
}

console.log(`${empty.length} empty draft recap(s), of ${rows.length} unsent draft(s):\n`);
for (const r of empty) {
  const willRedraft = r.fireflies_recording_id
    ? "will redraft on the next hourly sync"
    : "NO transcript attached — will only redraft once one is matched";
  console.log(`  ${r.engagement} — session ${r.scheduled_at.toISOString().slice(0, 10)}`);
  console.log(`    ${willRedraft}`);
}

if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to delete these.");
  process.exit(0);
}

let deleted = 0;
for (const r of empty) {
  // Re-assert every safety condition in the DELETE itself, so a recap
  // approved between the read above and now is not removed.
  const gone = await sql`
    delete from session_recaps
    where id = ${r.id}
      and status = 'draft'
      and approved_at is null
      and sent_at is null
      and message_id is null
    returning id`;
  if (gone.length > 0) deleted++;
}
console.log(`\nDeleted ${deleted} empty draft recap(s). They will be redrafted with real content.`);
