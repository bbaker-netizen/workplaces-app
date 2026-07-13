/**
 * Read-only investigation for the 2026-07-13 empty-recipient incident
 * (ERP build spec, item 1). Finds every booking_follow_through row whose
 * prospect has a missing / blank / invalid email — i.e. the rows that would
 * POST the Make sender an empty `to`. Reports, deletes NOTHING.
 *
 * Run: node scripts/investigate-empty-email-bookings.mjs
 */

import fs from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dbUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL / DATABASE_URL_OWNER set. Aborting.");
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(dbUrl);

// A booking row is "at risk" when the joined prospect has no valid email.
// The same pragmatic check the app uses: something@something.tld.
const rows = await sql`
  SELECT
    bft.id             AS booking_id,
    bft.calendar_event_id,
    bft.session_at,
    bft.email1_sent_at,
    bft.email2_sent_at,
    bft.email3_sent_at,
    bft.documents_received_at,
    bft.cancelled_at,
    p.id               AS prospect_id,
    p.company_name,
    p.contact_name,
    p.contact_email
  FROM booking_follow_through bft
  JOIN prospects p ON p.id = bft.prospect_id
  WHERE
    p.contact_email IS NULL
    OR btrim(p.contact_email) = ''
    OR p.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[a-zA-Z]{2,}$'
  ORDER BY bft.session_at DESC
`;

console.log(
  `\nBooking follow-through rows with a missing/invalid prospect email: ${rows.length}\n`,
);
if (rows.length === 0) {
  console.log("None. No row can POST an empty recipient.");
} else {
  console.table(
    rows.map((r) => ({
      booking_id: r.booking_id,
      prospect: r.contact_name || r.company_name,
      email: r.contact_email === null ? "(null)" : `"${r.contact_email}"`,
      session_at: r.session_at,
      e1: r.email1_sent_at ? "sent" : "-",
      e2: r.email2_sent_at ? "sent" : "-",
      e3: r.email3_sent_at ? "sent" : "-",
      stopped: r.documents_received_at || r.cancelled_at ? "yes" : "NO",
    })),
  );
  console.log(
    "\nThese are reported only. With the item-1 guard deployed, the cron now skips" +
      " them and raises a next action instead of POSTing a blank recipient.\n" +
      "To immediately stop any that are still armed, run:\n" +
      "  node scripts/suppress-test-prospects.mjs   (for the known test rows)\n" +
      "or set documents_received_at on the specific booking_id above by hand.",
  );
}
