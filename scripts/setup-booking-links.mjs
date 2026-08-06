/**
 * One-time setup: the practice's Person Profile survey link, and a
 * discovery booking link for each Business Builder.
 *
 * Both were unreachable until the console screens landed — the survey URL
 * column (migration 0118) had no field, and `scheduling_links` had no
 * create form — so the rows have to be seeded once by hand. Everything
 * after this is done in the app.
 *
 * SAFETY:
 *  - Idempotent. A Builder who already has an ACTIVE discovery link is
 *    left alone; a slug already in use is reported, never overwritten.
 *  - Never edits an existing scheduling_links row.
 *  - The survey URL is only written when it is absent or different, and
 *    the old value is printed first.
 *
 *   node scripts/setup-booking-links.mjs            # report only
 *   node scripts/setup-booking-links.mjs --apply    # write
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

const SURVEY_URL = "https://us.survey.ttisi.com/393358CAU";

/**
 * Mon–Fri, 8:30am–6:00pm Mountain Time — Bruce's stated working window,
 * and the same default the create form offers. 30 minutes: a discovery
 * conversation, not the session itself.
 */
const AVAILABILITY = { weekdays: [1, 2, 3, 4, 5], startMinute: 510, endMinute: 1080 };

const LINKS = [
  {
    builder: "Bruce Baker",
    slug: "bruce-baker",
    name: "Discovery call",
    description:
      "A first conversation about your business — where it is, where you want it, and whether we are the right fit. No pitch, no pressure.",
  },
  {
    builder: "Jen Garrison",
    slug: "jen-garrison",
    name: "Discovery call",
    description:
      "A first conversation about your business — where it is, where you want it, and whether we are the right fit. No pitch, no pressure.",
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

  const [master] = await sql`select id, name, person_profile_assessment_url
                               from orgs where type = 'master' limit 1`;
  if (!master) {
    console.error("No master org found.");
    process.exit(1);
  }
  console.log(`Master org: ${master.name} (${master.id})`);

  /* ---------------------- Person Profile survey URL ---------------------- */

  console.log("\n— Person Profile survey link —");
  console.log(`  current: ${master.person_profile_assessment_url ?? "(not set)"}`);
  console.log(`  target:  ${SURVEY_URL}`);
  if (master.person_profile_assessment_url === SURVEY_URL) {
    console.log("  already correct — no change");
  } else if (APPLY) {
    await sql`update orgs
                 set person_profile_assessment_url = ${SURVEY_URL},
                     updated_at = now()
               where id = ${master.id}`;
    console.log("  WROTE");
  } else {
    console.log("  would write");
  }

  /* --------------------------- booking links --------------------------- */

  console.log("\n— Booking links —");
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

    const existing = await sql`
      select slug, is_active, meeting_type from scheduling_links
       where coach_user_profile_id = ${builder.id}`;
    const liveDiscovery = existing.find(
      (r) => r.is_active && r.meeting_type === "discovery",
    );
    if (liveDiscovery) {
      console.log(
        `  ${spec.builder}: already has a live discovery link (/book/${liveDiscovery.slug}) — skipped`,
      );
      continue;
    }

    const [slugTaken] = await sql`
      select id, coach_user_profile_id from scheduling_links
       where slug = ${spec.slug} limit 1`;
    if (slugTaken) {
      console.log(
        `  ${spec.builder}: slug "${spec.slug}" is already taken by another link — skipped, pick another`,
      );
      continue;
    }

    if (!APPLY) {
      console.log(
        `  ${spec.builder} (${builder.role}): would create /book/${spec.slug} — "${spec.name}", 30 min, Mon–Fri 8:30am–6:00pm MT, live`,
      );
      continue;
    }

    const [row] = await sql`
      insert into scheduling_links
        (org_id, coach_user_profile_id, slug, name, description,
         meeting_type, duration_minutes, availability, is_active)
      values
        (${master.id}, ${builder.id}, ${spec.slug}, ${spec.name},
         ${spec.description}, 'discovery', 30,
         ${JSON.stringify(AVAILABILITY)}::jsonb, true)
      returning id, slug`;
    console.log(`  ${spec.builder}: CREATED /book/${row.slug} (${row.id})`);
  }

  /* ------------------------------ verify ------------------------------ */

  console.log("\n— What /book will list —");
  const live = await sql`
    select sl.slug, sl.name, sl.duration_minutes, up.full_name
      from scheduling_links sl
      join user_profiles up on up.id = sl.coach_user_profile_id
     where sl.org_id = ${master.id}
       and sl.is_active = true
       and sl.meeting_type = 'discovery'
     order by up.full_name, sl.name`;
  if (live.length === 0) console.log("  (nothing — the page will show the email fallback)");
  for (const r of live)
    console.log(`  ${r.full_name} → /book/${r.slug} · ${r.name} · ${r.duration_minutes} min`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
