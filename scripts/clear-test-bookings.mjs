/**
 * Remove test bookings — and everything a test booking drags in with it —
 * by a marker in the booker's name.
 *
 * Verifying a public booking path means making real bookings against the
 * live database: a `bookings` row, a `prospects` row owned by a real
 * Business Builder, a `booking_attempts` receipt, and the activity trail
 * hanging off the prospect. Deleting the booking alone leaves a lead in
 * someone's pipeline and a "booked" mark in the funnel that never
 * happened, so this clears the set.
 *
 * SAFETY:
 *  - Dry run by default. `--apply` is the only thing that writes.
 *  - Matches on `bookings.booker_name` ILIKE '%<marker>%', and on
 *    prospects whose contact_name matches the same marker. A marker
 *    shorter than four characters is refused — "ZZ" would be a thin
 *    thing to delete production rows on.
 *  - A prospect is only deleted when its name carries the marker.
 *    A prospect matched by EMAIL alone is left alone and reported: a
 *    test booked against a real person's address must not delete that
 *    person, and de-duplication means a test can attach itself to one.
 *  - Prints every row it will touch before touching it.
 *
 *   node scripts/clear-test-bookings.mjs "ZZ TEST"
 *   node scripts/clear-test-bookings.mjs "ZZ TEST" --apply
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const marker = args.find((a) => !a.startsWith("--"));

if (!marker || marker.trim().length < 4) {
  console.error(
    'Give a marker of at least four characters, e.g.:\n  node scripts/clear-test-bookings.mjs "ZZ TEST"',
  );
  process.exit(1);
}
const like = `%${marker.trim()}%`;

function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      if (!/^[A-Z_]+=/.test(line)) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i)] = line
        .slice(i + 1)
        .replace(/^["']|["']$/g, "")
        .trim();
    }
  } catch {
    /* fall through to process.env */
  }
  return out;
}

const env = loadEnv();
const url =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  env.DATABASE_URL_OWNER ??
  env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Put it in .env.local or the environment.");
  process.exit(1);
}
const sql = neon(url);

async function main() {
  console.log(
    `${APPLY ? "MODE: apply" : "MODE: report only (pass --apply to delete)"}\nMarker: "${marker}"\n`,
  );

  const bookingRows = await sql`
    select b.id, b.booked_at, b.booker_name, b.booker_email, b.prospect_id,
           sl.slug, sl.meeting_type
      from bookings b
      join scheduling_links sl on sl.id = b.scheduling_link_id
     where b.booker_name ilike ${like}
     order by b.created_at`;

  const attemptRows = await sql`
    select id, slug, booker_name, outcome, reason, created_at
      from booking_attempts
     where booker_name ilike ${like}
     order by created_at`;

  const prospectRows = await sql`
    select id, company_name, contact_name, contact_email, status, lead_source
      from prospects
     where contact_name ilike ${like}
     order by created_at`;

  // Prospects a test booking touched but whose own name is clean — the
  // de-duplication path attaches a test to a real lead when the email
  // matches. Reported, never deleted.
  const prospectIdsFromBookings = Array.from(
    new Set(bookingRows.map((b) => b.prospect_id).filter(Boolean)),
  );
  const deletableProspectIds = new Set(prospectRows.map((p) => p.id));
  const spared = prospectIdsFromBookings.filter(
    (id) => !deletableProspectIds.has(id),
  );

  console.log(`— bookings (${bookingRows.length}) —`);
  for (const b of bookingRows)
    console.log(
      `  ${b.id}  ${new Date(b.booked_at).toISOString()}  /book/${b.slug} [${b.meeting_type}]  ${b.booker_name} <${b.booker_email}>`,
    );

  console.log(`\n— booking_attempts (${attemptRows.length}) —`);
  for (const a of attemptRows)
    console.log(
      `  ${a.id}  /book/${a.slug}  ${a.outcome}/${a.reason}  ${a.booker_name}`,
    );

  console.log(`\n— prospects (${prospectRows.length}) —`);
  for (const p of prospectRows)
    console.log(
      `  ${p.id}  ${p.contact_name} — ${p.company_name} <${p.contact_email}>  ${p.status} · ${p.lead_source}`,
    );

  if (spared.length > 0) {
    console.log(
      `\n  NOT deleting ${spared.length} prospect(s) a test booking attached to whose own name does not carry the marker:`,
    );
    for (const id of spared) console.log(`    ${id} — check by hand`);
  }

  const total =
    bookingRows.length + attemptRows.length + prospectRows.length;
  if (total === 0) {
    console.log("\nNothing matches. Nothing to do.");
    return;
  }
  if (!APPLY) {
    console.log("\nWould delete the rows above. Re-run with --apply.");
    return;
  }

  // Order matters. `bookings` first: `booking_attempts.booking_id` is ON
  // DELETE SET NULL, so removing a booking under an attempt row leaves
  // the attempt pointing at nothing rather than failing. Prospects last —
  // `bookings.prospect_id` is SET NULL, so a prospect deleted first would
  // silently orphan a booking we had not got to yet.
  for (const b of bookingRows)
    await sql`delete from bookings where id = ${b.id}`;
  console.log(`\nDeleted ${bookingRows.length} booking(s).`);

  for (const a of attemptRows)
    await sql`delete from booking_attempts where id = ${a.id}`;
  console.log(`Deleted ${attemptRows.length} booking attempt(s).`);

  for (const p of prospectRows) {
    // Activities, notifications and follow-through rows hang off the
    // prospect with ON DELETE CASCADE, so this takes the trail with it.
    await sql`delete from prospects where id = ${p.id}`;
  }
  console.log(`Deleted ${prospectRows.length} prospect(s).`);

  const [{ count: leftB }] = await sql`
    select count(*)::int as count from bookings where booker_name ilike ${like}`;
  const [{ count: leftA }] = await sql`
    select count(*)::int as count from booking_attempts where booker_name ilike ${like}`;
  const [{ count: leftP }] = await sql`
    select count(*)::int as count from prospects where contact_name ilike ${like}`;
  console.log(
    `\nVerified after delete — bookings: ${leftB}, attempts: ${leftA}, prospects: ${leftP}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
