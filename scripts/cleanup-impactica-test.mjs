/**
 * One-shot cleanup: remove the Impactica TEST engagement created during
 * Sub-Phase 1.1 verification. Phase 1.7 will create the real Impactica
 * engagement with the actual client lead's email — having a test row
 * around would collide on name and clutter Clerk dashboard.
 *
 * Deleting the Clerk Org via Backend API automatically revokes any
 * pending invitations, so no separate revoke step.
 *
 * Run: node scripts/cleanup-impactica-test.mjs
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
const { createClerkClient } = await import("@clerk/backend");

const sql = neon(process.env.DATABASE_URL);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const rows = await sql`
  SELECT id, clerk_org_id, name
  FROM orgs
  WHERE name = 'Impactica' AND type = 'client'
`;

console.log("Targets:");
console.table(rows);

for (const r of rows) {
  await sql`DELETE FROM orgs WHERE id = ${r.id}`;
  console.log(`  deleted DB row ${r.id} (cascades engagements)`);
  try {
    await clerk.organizations.deleteOrganization(r.clerk_org_id);
    console.log(`  deleted Clerk Org ${r.clerk_org_id} (auto-revokes pending invitations)`);
  } catch (e) {
    console.warn(`  Clerk delete failed: ${e.message?.slice(0, 200)}`);
  }
}

console.log("\n--- Final orgs state ---");
const remaining = await sql`
  SELECT id, clerk_org_id, name, type FROM orgs ORDER BY type, name
`;
console.table(remaining);
console.log("Cleanup complete.");
