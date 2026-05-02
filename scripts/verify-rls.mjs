/**
 * Phase 0 RLS verification.
 *
 * Five scenarios end-to-end against Neon, proving the policies in
 * 0001_rls_policies.sql actually bind once we drop into the
 * workplaces_app role created in 0002_app_role.sql:
 *
 *   1. Bootstrap two orgs (A, B) with a user_profile, coach, and
 *      engagement each.
 *   2. Positive isolation: GUC=A returns exactly A's row in each table.
 *   3. Negative read: GUC=B sees zero of A's rows.
 *   4. Negative write: GUC=B inserting org_id=A fails with 42501.
 *   5. Cleanup: DELETE each org with its own GUC; FKs CASCADE descendants.
 *
 * Every test-scenario transaction:
 *   - SET LOCAL ROLE workplaces_app  (drop to NOBYPASSRLS — RLS binds)
 *   - set_config('app.current_org_id', uuid, true)  (transaction-scoped GUC)
 *
 * The pre-flight cleanup at startup runs as neondb_owner WITHOUT the
 * role drop. neondb_owner has BYPASSRLS, so it can sweep stale
 * `test_clerk_%` rows from prior failed runs without needing to know
 * their org ids. This is idempotent: running the script twice is a no-op
 * for the database state.
 *
 * Run: node scripts/verify-rls.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// Load .env.local — same inline parser as drizzle.config.ts.
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local.");
}

const sql = neon(process.env.DATABASE_URL);

// ---------- Test scaffolding ----------

let passed = 0;
let failed = 0;

function pass(label, detail) {
  passed++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function expect(cond, label, detail) {
  if (cond) {
    pass(label);
  } else {
    failed++;
    console.log(`  ✗ ${label} — ${detail}`);
    throw new Error(`Assertion failed: ${label}: ${detail}`);
  }
}

// ---------- Per-run unique identifiers ----------

const runId = Date.now();
const ids = {
  orgA: randomUUID(),
  orgB: randomUUID(),
  userA: randomUUID(),
  userB: randomUUID(),
  coachA: randomUUID(),
  coachB: randomUUID(),
  engA: randomUUID(),
  engB: randomUUID(),
};

console.log(`Run ${runId}`);
console.log(`  Org A: ${ids.orgA}`);
console.log(`  Org B: ${ids.orgB}`);

// ---------- 0. Idempotent pre-flight cleanup ----------
// As neondb_owner with BYPASSRLS — sweeps any stale test rows from
// prior runs (failed or otherwise). Not a "scenario" — just hygiene.
console.log("\n0. Pre-flight cleanup (sweep stale test_clerk_% rows)");
{
  const stale = await sql`
    SELECT id FROM orgs WHERE clerk_org_id LIKE 'test_clerk_%'
  `;
  if (stale.length > 0) {
    await sql`DELETE FROM orgs WHERE clerk_org_id LIKE 'test_clerk_%'`;
    pass(`swept ${stale.length} stale org(s) and descendants (CASCADE)`);
  } else {
    pass("no stale test rows to sweep");
  }
}

// ---------- 1. Bootstrap ----------
console.log("\n1. Bootstrap two orgs with descendants");

async function bootstrap(org, user, coach, eng, suffix) {
  await sql.transaction([
    sql`SET LOCAL ROLE workplaces_app`,
    sql`SELECT set_config('app.current_org_id', ${org}, true)`,
    sql`INSERT INTO orgs (id, clerk_org_id, name, type)
        VALUES (${org}, ${`test_clerk_${suffix}_${runId}`},
                ${`Test Org ${suffix.toUpperCase()}`}, 'client')`,
    sql`INSERT INTO user_profiles (id, clerk_user_id, org_id, email, full_name, role)
        VALUES (${user}, ${`test_user_${suffix}_${runId}`}, ${org},
                ${`${suffix}@test.invalid`}, ${`Test ${suffix.toUpperCase()}`},
                'master_admin')`,
    sql`INSERT INTO coaches (id, org_id, user_profile_id)
        VALUES (${coach}, ${org}, ${user})`,
    sql`INSERT INTO engagements (id, org_id, coach_id, type)
        VALUES (${eng}, ${org}, ${coach}, 'accelerator')`,
  ]);
}

await bootstrap(ids.orgA, ids.userA, ids.coachA, ids.engA, "a");
pass("Org A + descendants inserted");
await bootstrap(ids.orgB, ids.userB, ids.coachB, ids.engB, "b");
pass("Org B + descendants inserted");

// ---------- 2. Positive isolation ----------
console.log("\n2. Positive isolation (GUC=A returns exactly A's rows)");

{
  const [, , orgsRows, userRows, coachRows, engRows] = await sql.transaction([
    sql`SET LOCAL ROLE workplaces_app`,
    sql`SELECT set_config('app.current_org_id', ${ids.orgA}, true)`,
    sql`SELECT id FROM orgs`,
    sql`SELECT id FROM user_profiles`,
    sql`SELECT id FROM coaches`,
    sql`SELECT id FROM engagements`,
  ]);

  expect(
    orgsRows.length === 1 && orgsRows[0].id === ids.orgA,
    "orgs returns only Org A",
    `got ${JSON.stringify(orgsRows)}`,
  );
  expect(
    userRows.length === 1 && userRows[0].id === ids.userA,
    "user_profiles returns only A's user",
    `got ${JSON.stringify(userRows)}`,
  );
  expect(
    coachRows.length === 1 && coachRows[0].id === ids.coachA,
    "coaches returns only A's coach",
    `got ${JSON.stringify(coachRows)}`,
  );
  expect(
    engRows.length === 1 && engRows[0].id === ids.engA,
    "engagements returns only A's engagement",
    `got ${JSON.stringify(engRows)}`,
  );
}

// ---------- 3. Negative isolation — read ----------
console.log("\n3. Negative isolation — read (GUC=B sees zero of A's rows)");

{
  const [, , ups, cs, es] = await sql.transaction([
    sql`SET LOCAL ROLE workplaces_app`,
    sql`SELECT set_config('app.current_org_id', ${ids.orgB}, true)`,
    sql`SELECT id FROM user_profiles WHERE id = ${ids.userA}`,
    sql`SELECT id FROM coaches WHERE id = ${ids.coachA}`,
    sql`SELECT id FROM engagements WHERE id = ${ids.engA}`,
  ]);

  expect(ups.length === 0, "cross-tenant user_profiles read", `got ${ups.length} rows`);
  expect(cs.length === 0, "cross-tenant coaches read", `got ${cs.length} rows`);
  expect(es.length === 0, "cross-tenant engagements read", `got ${es.length} rows`);
}

// ---------- 4. Negative isolation — write ----------
console.log("\n4. Negative isolation — write (GUC=B insert org_id=A → 42501)");

{
  let writeError = null;
  try {
    await sql.transaction([
      sql`SET LOCAL ROLE workplaces_app`,
      sql`SELECT set_config('app.current_org_id', ${ids.orgB}, true)`,
      sql`INSERT INTO user_profiles (clerk_user_id, org_id, email, full_name, role)
          VALUES (${`hacker_${runId}`}, ${ids.orgA},
                  ${"hack@test.invalid"}, 'Hacker', 'prospect')`,
    ]);
  } catch (e) {
    writeError = e;
  }

  expect(writeError !== null, "INSERT was blocked", "expected error, transaction succeeded");
  const code = writeError?.code ?? "";
  const msg = writeError?.message ?? "";
  const looksLikeRls = code === "42501" || /row-level security/i.test(msg);
  expect(
    looksLikeRls,
    "error matches RLS violation",
    `code=${code}, message=${msg.slice(0, 120)}`,
  );
  console.log(`    detail: code=${code}, message=${msg.slice(0, 120)}`);
}

// ---------- 5. Cleanup ----------
console.log("\n5. Cleanup (DELETE each org under its own GUC; CASCADE descendants)");

for (const [org, suffix] of [
  [ids.orgA, "A"],
  [ids.orgB, "B"],
]) {
  await sql.transaction([
    sql`SET LOCAL ROLE workplaces_app`,
    sql`SELECT set_config('app.current_org_id', ${org}, true)`,
    sql`DELETE FROM orgs WHERE id = ${org}`,
  ]);
  pass(`Org ${suffix} deleted`);
}

// ---------- Summary ----------
console.log("\n" + "=".repeat(60));
if (failed === 0) {
  console.log(`✅ ${passed} checks passed — RLS verified end-to-end`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} of ${passed + failed} checks failed`);
  process.exit(1);
}
