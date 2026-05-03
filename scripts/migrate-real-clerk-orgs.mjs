/**
 * One-shot migration: replace Phase 0's personal-org placeholder with a
 * real Clerk Organization called "Workplaces".
 *
 * Phase 0 stored `clerk_org_id = clerk_user_id` (the user's id, prefixed
 * `user_…`) as a placeholder while Clerk Organizations weren't being
 * used. Phase 1.1 cuts over to real Orgs. This script:
 *
 *   1. Finds the existing master orgs row (type='master').
 *   2. Confirms it's still on the Phase 0 placeholder (clerk_org_id
 *      starts with 'user_'); if it's already 'org_…', exits clean.
 *   3. Finds or creates a Clerk Organization named "Workplaces".
 *   4. Ensures Bruce is an admin member of it.
 *   5. Updates orgs.clerk_org_id to the real Clerk Org id.
 *
 * Idempotent — re-running on already-migrated state is a no-op.
 *
 * Run: node scripts/migrate-real-clerk-orgs.mjs
 */

import fs from "node:fs";
import { resolve } from "node:path";

// Load .env.local — same inline parser as drizzle.config.ts.
const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local.");
}
if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY is not set — copy .env.example to .env.local.");
}

const { neon } = await import("@neondatabase/serverless");
const { createClerkClient } = await import("@clerk/backend");

const sql = neon(process.env.DATABASE_URL);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const WORKPLACES_ORG_NAME = "Workplaces";

console.log("— migrate-real-clerk-orgs —\n");

// ---------- 1. Find the master orgs row ----------

const masterOrgs = await sql`
  SELECT id, clerk_org_id, name, type
  FROM orgs
  WHERE type = 'master'
  LIMIT 1
`;

if (masterOrgs.length === 0) {
  console.log("No row in orgs with type='master'. Nothing to migrate.");
  process.exit(0);
}

const masterOrg = masterOrgs[0];
console.log(`Master orgs row: id=${masterOrg.id}, name="${masterOrg.name}"`);
console.log(`  current clerk_org_id: ${masterOrg.clerk_org_id}`);

// ---------- 2. Check migration state ----------

if (masterOrg.clerk_org_id.startsWith("org_")) {
  console.log("\nAlready migrated — clerk_org_id is a real Clerk Org id. No-op.");
  process.exit(0);
}
if (!masterOrg.clerk_org_id.startsWith("user_")) {
  console.error(
    `\nUnexpected clerk_org_id format: ${masterOrg.clerk_org_id}\n` +
      `Expected either 'user_…' (Phase 0 placeholder) or 'org_…' (already migrated). Aborting.`,
  );
  process.exit(1);
}

const bruceClerkUserId = masterOrg.clerk_org_id;
console.log(`  → Phase 0 placeholder. Bruce's Clerk user id: ${bruceClerkUserId}`);

// ---------- 3. Find or create the Workplaces Clerk Organization ----------

console.log(`\nLooking for existing "${WORKPLACES_ORG_NAME}" Clerk Org...`);
const orgListRes = await clerk.organizations.getOrganizationList({
  query: WORKPLACES_ORG_NAME,
});
const matchingOrg = orgListRes.data.find((o) => o.name === WORKPLACES_ORG_NAME);

let workplacesOrg;
if (matchingOrg) {
  workplacesOrg = matchingOrg;
  console.log(`  found existing Clerk Org: ${workplacesOrg.id}`);
} else {
  console.log(`  not found — creating...`);
  workplacesOrg = await clerk.organizations.createOrganization({
    name: WORKPLACES_ORG_NAME,
    createdBy: bruceClerkUserId,
  });
  console.log(`  created: ${workplacesOrg.id} (Bruce auto-added as creator/admin)`);
}

// ---------- 4. Ensure Bruce is an admin member ----------

console.log(`\nEnsuring Bruce is admin of "${WORKPLACES_ORG_NAME}"...`);
const memberships = await clerk.organizations.getOrganizationMembershipList({
  organizationId: workplacesOrg.id,
});
const bruceMembership = memberships.data.find(
  (m) => m.publicUserData?.userId === bruceClerkUserId,
);

if (bruceMembership) {
  console.log(`  membership exists — role: ${bruceMembership.role}`);
  if (bruceMembership.role !== "org:admin") {
    console.log(`  upgrading to org:admin...`);
    await clerk.organizations.updateOrganizationMembership({
      organizationId: workplacesOrg.id,
      userId: bruceClerkUserId,
      role: "org:admin",
    });
    console.log(`  upgraded.`);
  } else {
    console.log(`  already admin — no change.`);
  }
} else {
  console.log(`  adding as admin...`);
  await clerk.organizations.createOrganizationMembership({
    organizationId: workplacesOrg.id,
    userId: bruceClerkUserId,
    role: "org:admin",
  });
  console.log(`  added.`);
}

// ---------- 5. Update orgs.clerk_org_id ----------

console.log(
  `\nUpdating orgs.clerk_org_id: ${masterOrg.clerk_org_id} → ${workplacesOrg.id}`,
);
await sql`
  UPDATE orgs
  SET clerk_org_id = ${workplacesOrg.id}
  WHERE id = ${masterOrg.id}
`;
console.log(`  done.`);

// ---------- 6. Verify ----------

const verify = await sql`
  SELECT id, clerk_org_id, name, type, updated_at
  FROM orgs
  WHERE id = ${masterOrg.id}
`;
console.log(`\nFinal orgs row:`);
console.table(verify);

console.log("\nNext step: Bruce signs out and back in. The Clerk session will");
console.log("auto-activate the Workplaces org (it's his only one), and");
console.log("ensureUserProfile will resolve to his existing user_profile via");
console.log("the new clerk_org_id mapping.\n");

console.log("✅ Migration complete.");
