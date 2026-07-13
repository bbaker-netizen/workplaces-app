/**
 * Neutralize the 11 July build-session TEST prospects (ERP build spec, item 2):
 *   - "Testy Three"
 *   - "ERP Shape Test"  (4workplaces+erptest@gmail.com)
 *   - "QC Test"
 *
 * Their booking_follow_through rows are still armed, so emails 2 and 3 keep
 * firing about meetings that no longer exist.
 *
 * Default run REPORTS the matches and SUPPRESSES the sending (sets
 * documents_received_at on their booking rows — the immediate mitigation the
 * spec asks for). It does NOT delete anything.
 *
 * Deletion is gated behind an explicit flag AND requires Bruce's confirmation:
 *   node scripts/suppress-test-prospects.mjs            # report + suppress
 *   node scripts/suppress-test-prospects.mjs --archive  # + soft-delete (archive) the prospects
 *
 * Run: node scripts/suppress-test-prospects.mjs
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

const ARCHIVE = process.argv.includes("--archive");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(dbUrl);

// Match by the exact names, plus the known test email, to be safe.
const targets = await sql`
  SELECT id, company_name, contact_name, contact_email, status, archived_at
  FROM prospects
  WHERE contact_name IN ('Testy Three', 'ERP Shape Test', 'QC Test')
     OR company_name IN ('Testy Three', 'ERP Shape Test', 'QC Test')
     OR lower(contact_email) = lower('4workplaces+erptest@gmail.com')
  ORDER BY contact_name
`;

console.log(`\nTest prospects matched: ${targets.length}`);
console.table(
  targets.map((t) => ({
    id: t.id,
    name: t.contact_name || t.company_name,
    email: t.contact_email,
    status: t.status,
    archived: t.archived_at ? "yes" : "no",
  })),
);

if (targets.length === 0) {
  console.log("Nothing matched — they may already be gone. Done.");
  process.exit(0);
}

const ids = targets.map((t) => t.id);

// Show their booking rows before touching anything.
const bookings = await sql`
  SELECT id, prospect_id, calendar_event_id, session_at,
         email1_sent_at, email2_sent_at, email3_sent_at,
         documents_received_at, cancelled_at
  FROM booking_follow_through
  WHERE prospect_id = ANY(${ids})
  ORDER BY session_at DESC
`;
console.log(`\nTheir booking_follow_through rows: ${bookings.length}`);
console.table(
  bookings.map((b) => ({
    booking_id: b.id,
    session_at: b.session_at,
    e1: b.email1_sent_at ? "sent" : "-",
    e2: b.email2_sent_at ? "sent" : "-",
    e3: b.email3_sent_at ? "sent" : "-",
    armed: b.documents_received_at || b.cancelled_at ? "no" : "YES",
  })),
);

// --- Mitigation: stop the sequence on every armed row. Idempotent. ----------
const suppressed = await sql`
  UPDATE booking_follow_through
  SET documents_received_at = COALESCE(documents_received_at, now()),
      updated_at = now()
  WHERE prospect_id = ANY(${ids})
    AND documents_received_at IS NULL
    AND cancelled_at IS NULL
  RETURNING id
`;
console.log(
  `\nSuppressed (set documents_received_at) on ${suppressed.length} armed booking row(s). No more emails will fire for these.`,
);

if (!ARCHIVE) {
  console.log(
    "\nProspects left in place (report + suppress only). Re-run with --archive to" +
      " soft-delete them once Bruce confirms:\n  node scripts/suppress-test-prospects.mjs --archive",
  );
  process.exit(0);
}

// --- Optional: soft-delete (archive) the prospects. Reversible. -------------
const archived = await sql`
  UPDATE prospects
  SET archived_at = COALESCE(archived_at, now()), updated_at = now()
  WHERE id = ANY(${ids}) AND archived_at IS NULL
  RETURNING id, contact_name, company_name
`;
console.log(`\nArchived ${archived.length} test prospect(s) (soft-delete, recoverable):`);
console.table(archived);
console.log("Done.");
