/**
 * Sub-Phase 1.2 test setup: ensure Bruce has an engagement in his
 * master Workplaces org so /portal/action-items has somewhere to
 * write items into during local testing.
 *
 * Idempotent — re-running is a no-op once the "Bruce Test" engagement
 * exists. Direct SQL insert; no Clerk Org is created because this
 * engagement lives in the existing master org, not a new client org.
 *
 * Run: node scripts/setup-bruce-test-engagement.mjs
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

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

console.log("— setup-bruce-test-engagement —\n");

// 1. Find Bruce's master org + coach record
const bruceCoach = await sql`
  SELECT
    o.id  AS org_id,
    o.name AS org_name,
    c.id  AS coach_id,
    up.id AS user_profile_id,
    up.email
  FROM orgs o
  JOIN user_profiles up ON up.org_id = o.id
  JOIN coaches c ON c.user_profile_id = up.id
  WHERE o.type = 'master' AND up.role = 'master_admin'
  LIMIT 1
`;

if (bruceCoach.length === 0) {
  console.error(
    "No master_admin user with a coach record found. Did Phase 1.1 finish?",
  );
  process.exit(1);
}

const { org_id, org_name, coach_id, user_profile_id, email } = bruceCoach[0];
console.log(`Bruce's master org: ${org_id} (${org_name})`);
console.log(`Bruce's coach id: ${coach_id}`);
console.log(`Bruce's user_profile_id: ${user_profile_id} (${email})`);

// 2. Check whether "Bruce Test" engagement already exists in this org
const existing = await sql`
  SELECT id, name, type, status
  FROM engagements
  WHERE org_id = ${org_id} AND name = 'Bruce Test'
  LIMIT 1
`;

if (existing.length > 0) {
  console.log(`\n"Bruce Test" engagement already exists: ${existing[0].id}`);
  console.table(existing);
  process.exit(0);
}

// 3. Create the engagement
const created = await sql`
  INSERT INTO engagements (org_id, coach_id, type, name, status, start_date)
  VALUES (
    ${org_id},
    ${coach_id},
    'accelerator',
    'Bruce Test',
    'active',
    now()
  )
  RETURNING id, name, type, status, start_date
`;

console.log(`\nCreated engagement:`);
console.table(created);

console.log("\n✅ Setup complete.");
console.log("Visit /portal/action-items to create test items.");
