/**
 * One-time setup: a "Where the money went" booking link for each
 * Business Builder.
 *
 * The offer already existed — ninety minutes reading a prospect's own
 * twelve months of bank statements and their P&L — but it lived on a
 * Google appointment schedule outside this app. That made it Bruce's
 * alone: it could not be routed to Jen, it created no booking row, and
 * the funnel could not count it. Migration 0122 added the meeting type;
 * this creates the rows that make it bookable.
 *
 * The pre-work requirement is NOT seeded into `description`. It lives in
 * lib/booking/meeting-types.ts so it renders identically on both
 * Builders' pages and cannot be edited away. `description` here is the
 * offer's own words, nothing load-bearing.
 *
 * SAFETY:
 *  - Idempotent. A Builder who already has an ACTIVE link of this type
 *    is left alone; a slug already in use is reported, never overwritten.
 *  - Never edits an existing scheduling_links row.
 *
 *   node scripts/setup-money-links.mjs            # report only
 *   node scripts/setup-money-links.mjs --apply    # write
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

const MEETING_TYPE = "where_the_money_went";
const DURATION_MINUTES = 90;

/**
 * Mon–Fri, 8:30am–6:00pm Mountain Time — the same window the discovery
 * links use. Ninety minutes fits inside it nine and a half hours over, so
 * it renders six slots a day; the Builder's real calendar removes the
 * rest.
 */
const AVAILABILITY = { weekdays: [1, 2, 3, 4, 5], startMinute: 510, endMinute: 1080 };

const DESCRIPTION =
  "Ninety minutes in your own numbers. I read twelve months of your bank statements and your P&L before we meet, then we go through what I found — the spending you decided on, and the spending that just happened.";

const LINKS = [
  {
    builder: "Bruce Baker",
    slug: "bruce-where-the-money-went",
    name: "Where the money went",
    description: DESCRIPTION,
  },
  {
    builder: "Jen Garrison",
    slug: "jen-where-the-money-went",
    name: "Where the money went",
    description: DESCRIPTION,
  },
];

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
  console.log(APPLY ? "MODE: apply\n" : "MODE: report only (pass --apply to write)\n");

  // The enum value has to exist before a row can name it. Checked rather
  // than assumed, because the failure otherwise is an invalid-input-value
  // error mid-insert with the first Builder created and the second not.
  const labels = await sql`select e.enumlabel from pg_enum e
                             join pg_type t on t.oid = e.enumtypid
                            where t.typname = 'scheduling_meeting_type'`;
  if (!labels.some((r) => r.enumlabel === MEETING_TYPE)) {
    console.error(
      `The '${MEETING_TYPE}' meeting type is not in the database yet. Run migration 0122 first (pnpm db:migrate:deploy).`,
    );
    process.exit(1);
  }

  const [master] = await sql`select id, name from orgs where type = 'master' limit 1`;
  if (!master) {
    console.error("No master org found.");
    process.exit(1);
  }
  console.log(`Master org: ${master.name} (${master.id})`);

  console.log("\n— Where the money went links —");
  for (const spec of LINKS) {
    const [builder] = await sql`
      select id, full_name, role from user_profiles
       where org_id = ${master.id}
         and role in ('master_admin','coach')
         and lower(full_name) = lower(${spec.builder})
       limit 1`;
    if (!builder) {
      console.log(`  ${spec.builder}: NO PROFILE FOUND — skipped`);
      continue;
    }

    const [live] = await sql`
      select slug from scheduling_links
       where coach_user_profile_id = ${builder.id}
         and meeting_type = ${MEETING_TYPE}
         and is_active = true
       limit 1`;
    if (live) {
      console.log(
        `  ${spec.builder}: already has a live link (/book/${live.slug}) — skipped`,
      );
      continue;
    }

    const [slugTaken] = await sql`
      select id from scheduling_links where slug = ${spec.slug} limit 1`;
    if (slugTaken) {
      console.log(
        `  ${spec.builder}: slug "${spec.slug}" is already taken by another link — skipped, pick another`,
      );
      continue;
    }

    if (!APPLY) {
      console.log(
        `  ${spec.builder} (${builder.role}): would create /book/${spec.slug} — "${spec.name}", ${DURATION_MINUTES} min, Mon–Fri 8:30am–6:00pm MT, live`,
      );
      continue;
    }

    const [row] = await sql`
      insert into scheduling_links
        (org_id, coach_user_profile_id, slug, name, description,
         meeting_type, duration_minutes, availability, is_active)
      values
        (${master.id}, ${builder.id}, ${spec.slug}, ${spec.name},
         ${spec.description}, ${MEETING_TYPE}, ${DURATION_MINUTES},
         ${JSON.stringify(AVAILABILITY)}::jsonb, true)
      returning id, slug`;
    console.log(`  ${spec.builder}: CREATED /book/${row.slug} (${row.id})`);
  }

  console.log("\n— What /book will list —");
  const listed = await sql`
    select sl.meeting_type, sl.slug, sl.name, sl.duration_minutes, up.full_name
      from scheduling_links sl
      join user_profiles up on up.id = sl.coach_user_profile_id
     where sl.org_id = ${master.id}
       and sl.is_active = true
       and sl.meeting_type in ('discovery', ${MEETING_TYPE})
     order by sl.meeting_type desc, up.full_name`;
  if (listed.length === 0)
    console.log("  (nothing — the page will show the email fallback)");
  for (const r of listed)
    console.log(
      `  [${r.meeting_type}] ${r.full_name} → /book/${r.slug} · ${r.name} · ${r.duration_minutes} min`,
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
