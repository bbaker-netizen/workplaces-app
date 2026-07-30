/**
 * One-time backfill: copy the monthly fee from each lead onto the client
 * it became.
 *
 * The fee was only ever written at activation, so every fee agreed or
 * corrected afterwards stayed on the lead while the client's own record
 * read blank — 16 of 18 clients on 30 Jul 2026. That blank is what the
 * QuickBooks recurring retainer bills from (it refuses without one) and
 * what the Friday rollup's effective hourly rate divides by, so the
 * numbers in both were wrong or missing.
 *
 * `updateProspect` now keeps the two in step going forward. This exists
 * only to repair the rows that predate that.
 *
 * SAFETY: only fills engagements whose fee is NULL. An engagement with a
 * fee already set is never touched — `setEngagementMonthlyFee` exists
 * precisely so a client's fee can differ from the lead's, and this must
 * not stamp on a deliberate correction.
 *
 *   node scripts/backfill-engagement-fees.mjs            # report only
 *   node scripts/backfill-engagement-fees.mjs --apply    # write
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
      out[line.slice(0, i)] = line
        .slice(i + 1)
        .replace(/^["']|["']$/g, "")
        .trim();
    }
  } catch {
    /* fall through to process.env */
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const url = env.DATABASE_URL_OWNER || env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL_OWNER or DATABASE_URL. Add one to .env.local.");
  process.exit(1);
}
const sql = neon(url);

const candidates = await sql`
  select e.id, e.name, p.monthly_fee_cents as fee
  from prospects p
  join engagements e on e.id = p.converted_engagement_id
  where p.monthly_fee_cents is not null
    and p.monthly_fee_cents > 0
    and e.monthly_fee_cents is null
  order by e.name`;

if (candidates.length === 0) {
  console.log("Nothing to backfill — every client with a fee on its lead already has one.");
  process.exit(0);
}

// Neon hands numeric columns back as strings, so every arithmetic use
// has to coerce explicitly — `sum + row.fee` silently concatenates.
const money = (c) => `$${(Number(c) / 100).toLocaleString("en-CA")}`;
console.log(`${candidates.length} client(s) missing a monthly fee:\n`);
for (const c of candidates) {
  console.log(`  ${(c.name ?? "(unnamed)").padEnd(34)} ${money(c.fee)}/month`);
}
const total = candidates.reduce((s, c) => s + Number(c.fee), 0);
console.log(`\n  Total monthly across these clients: ${money(total)}`);

if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to write these onto the clients.");
  process.exit(0);
}

let written = 0;
for (const c of candidates) {
  // Re-check the NULL inside the write so a fee set between the read and
  // now is not overwritten.
  const rows = await sql`
    update engagements set monthly_fee_cents = ${Number(c.fee)}
    where id = ${c.id} and monthly_fee_cents is null
    returning id`;
  if (rows.length > 0) written++;
}
console.log(`\nBackfilled ${written} client(s).`);
