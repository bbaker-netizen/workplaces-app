/**
 * Reconcile Bruce's master-admin identity after a Clerk PRODUCTION
 * instance cutover (e.g. moving Clerk onto builder.4workplaces.com).
 *
 * The problem this fixes
 * ----------------------
 * Clerk production instances are entirely separate from development
 * instances: every user id and org id is new. The Builder's database
 * still holds the OLD dev-instance ids:
 *
 *   - `orgs.clerk_org_id` for the master "Workplaces" org points at the
 *     old dev org id.
 *   - `user_profiles.clerk_user_id` for Bruce's master_admin row (the
 *     one the `coaches` record links to) points at his old dev user id.
 *
 * So when Bruce signs in on the production instance, `ensureUserProfile`
 * can't find his profile (clerk_user_id is UNIQUE and doesn't match), and
 * first-visit provisioning creates a brand-new row defaulted to
 * `client_employee` — which lands him in the client portal instead of the
 * coach console.
 *
 * What this script does
 * ---------------------
 *   1. Looks up Bruce's CURRENT (production) Clerk user by email.
 *   2. Finds or creates the "Workplaces" master Clerk Org and makes Bruce
 *      an org:admin member with publicMetadata.app_role = "master_admin".
 *   3. Points the master `orgs` row at the real production Clerk Org id.
 *   4. Re-points Bruce's canonical master_admin `user_profiles` row at his
 *      production clerk_user_id (deleting any stray client_employee row
 *      that first-visit provisioning created under the new id).
 *   5. Ensures a `coaches` row links to that profile.
 *
 * SAFE BY DEFAULT: runs read-only and prints the live state. Pass --fix to
 * apply changes. Idempotent — re-running on a healed database is a no-op.
 *
 * Run (diagnose):  node scripts/fix-master-admin.mjs
 * Run (repair):    node scripts/fix-master-admin.mjs --fix
 *
 * Override the email if needed:  BRUCE_EMAIL=you@example.com node scripts/...
 */

import fs from "node:fs";
import { resolve } from "node:path";

// ---- env load (same inline parser as the other ops scripts) ----
const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Prefer the owner connection for writes (bypasses RLS); fall back to
// DATABASE_URL, matching migrate-on-deploy.mjs.
const DB_URL = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL;
if (!DB_URL) {
  throw new Error(
    "DATABASE_URL (or DATABASE_URL_OWNER) is not set — point it at PRODUCTION.",
  );
}
if (!process.env.CLERK_SECRET_KEY) {
  throw new Error(
    "CLERK_SECRET_KEY is not set — use the PRODUCTION secret key (sk_live_…).",
  );
}

const EMAIL = (process.env.BRUCE_EMAIL || "4workplaces@gmail.com").toLowerCase();
const APPLY = process.argv.includes("--fix");
const WORKPLACES_ORG_NAME = "Workplaces";
const MASTER_ROLE = "master_admin";

const { neon } = await import("@neondatabase/serverless");
const { createClerkClient } = await import("@clerk/backend");

const sql = neon(DB_URL);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const isLive = process.env.CLERK_SECRET_KEY.startsWith("sk_live_");
console.log("— fix-master-admin —");
console.log(`mode:  ${APPLY ? "FIX (will write)" : "DIAGNOSE (read-only)"}`);
console.log(`email: ${EMAIL}`);
console.log(`clerk: ${isLive ? "PRODUCTION (sk_live)" : "development (sk_test)"}`);
if (!isLive) {
  console.log(
    "  ⚠️  This is a development Clerk key. For the production cutover you\n" +
      "      want the sk_live_… key. Continuing anyway.",
  );
}
console.log("");

// ===================================================================
// DIAGNOSE
// ===================================================================

// --- Clerk: who is Bruce on the CURRENT instance? ---
const userList = await clerk.users.getUserList({ emailAddress: [EMAIL] });
const bruceUser = userList.data[0] ?? null;

if (!bruceUser) {
  console.error(
    `No Clerk user found with email ${EMAIL} on this instance.\n` +
      `Make sure you've signed in at least once on builder.4workplaces.com,\n` +
      `and that CLERK_SECRET_KEY is the production key.`,
  );
  process.exit(1);
}
const bruceClerkUserId = bruceUser.id;
const bruceFullName =
  bruceUser.fullName ||
  [bruceUser.firstName, bruceUser.lastName].filter(Boolean).join(" ") ||
  EMAIL;
console.log("Clerk user (production):");
console.log(`  id:    ${bruceClerkUserId}`);
console.log(`  name:  ${bruceFullName}`);

// --- Clerk: the Workplaces org + Bruce's membership ---
const orgListRes = await clerk.organizations.getOrganizationList({
  query: WORKPLACES_ORG_NAME,
});
let workplacesOrg =
  orgListRes.data.find((o) => o.name === WORKPLACES_ORG_NAME) ?? null;

const myMemberships = await clerk.users.getOrganizationMembershipList({
  userId: bruceClerkUserId,
});
console.log(`\nClerk org memberships for this user (${myMemberships.data.length}):`);
for (const m of myMemberships.data) {
  const appRole = (m.publicMetadata || {}).app_role ?? "(none)";
  console.log(
    `  • ${m.organization.name}  [${m.organization.id}]  ` +
      `clerkRole=${m.role}  app_role=${appRole}`,
  );
}
console.log(
  workplacesOrg
    ? `\nWorkplaces Clerk Org exists: ${workplacesOrg.id}`
    : `\nWorkplaces Clerk Org does NOT exist yet on this instance.`,
);

// --- DB: orgs + Bruce's profile(s) ---
const dbOrgs = await sql`
  SELECT id, clerk_org_id, name, type FROM orgs ORDER BY type DESC, name
`;
console.log(`\nDB orgs (${dbOrgs.length}):`);
console.table(dbOrgs);

const masterOrgs = dbOrgs.filter((o) => o.type === "master");
if (masterOrgs.length !== 1) {
  console.error(
    `Expected exactly 1 orgs row with type='master', found ${masterOrgs.length}. Aborting.`,
  );
  process.exit(1);
}
const masterOrg = masterOrgs[0];

const dbProfiles = await sql`
  SELECT up.id, up.clerk_user_id, up.org_id, up.email, up.full_name, up.role,
         o.name AS org_name, o.type AS org_type,
         (c.id IS NOT NULL) AS is_coach
  FROM user_profiles up
  JOIN orgs o ON o.id = up.org_id
  LEFT JOIN coaches c ON c.user_profile_id = up.id
  WHERE lower(up.email) = ${EMAIL} OR up.clerk_user_id = ${bruceClerkUserId}
  ORDER BY up.role
`;
console.log(`\nDB user_profiles matching this email or production user id:`);
console.table(
  dbProfiles.map((p) => ({
    role: p.role,
    org: `${p.org_name} (${p.org_type})`,
    clerk_user_id: p.clerk_user_id,
    matches_prod_id: p.clerk_user_id === bruceClerkUserId,
    is_coach: p.is_coach,
  })),
);

// --- Verdict ---
const healthyProfile = dbProfiles.find(
  (p) =>
    p.clerk_user_id === bruceClerkUserId &&
    p.role === MASTER_ROLE &&
    p.org_id === masterOrg.id &&
    p.is_coach,
);
const orgMapped = masterOrg.clerk_org_id === (workplacesOrg && workplacesOrg.id);

console.log("\n— Verdict —");
console.log(
  `  master org mapped to production Clerk org: ${orgMapped ? "YES" : "NO"}`,
);
console.log(
  `  Bruce has a master_admin+coach profile on the production id: ` +
    `${healthyProfile ? "YES" : "NO"}`,
);

if (healthyProfile && orgMapped) {
  console.log(
    "\n✅ Already healthy. If you still land in a client portal, sign out\n" +
      "   and back in, and clear the 'portal_preview' / 'selected_engagement_slug'\n" +
      "   cookies for builder.4workplaces.com.",
  );
  process.exit(0);
}

if (!APPLY) {
  console.log(
    "\nRead-only run complete. Nothing was changed.\n" +
      "Review the tables above, then re-run with --fix to repair:\n\n" +
      "    node scripts/fix-master-admin.mjs --fix\n",
  );
  process.exit(0);
}

// ===================================================================
// FIX
// ===================================================================
console.log("\n— Applying repair —");

// 1. Ensure the Workplaces Clerk Org exists.
if (!workplacesOrg) {
  console.log(`Creating "${WORKPLACES_ORG_NAME}" Clerk Org...`);
  workplacesOrg = await clerk.organizations.createOrganization({
    name: WORKPLACES_ORG_NAME,
    createdBy: bruceClerkUserId,
  });
  console.log(`  created ${workplacesOrg.id} (Bruce auto-added as admin)`);
}

// 2. Ensure Bruce is an admin member with app_role=master_admin.
const memberOfWorkplaces = myMemberships.data.find(
  (m) => m.organization.id === workplacesOrg.id,
);
if (!memberOfWorkplaces) {
  console.log("Adding Bruce as org:admin of Workplaces...");
  await clerk.organizations.createOrganizationMembership({
    organizationId: workplacesOrg.id,
    userId: bruceClerkUserId,
    role: "org:admin",
  });
} else if (memberOfWorkplaces.role !== "org:admin") {
  console.log("Upgrading Bruce to org:admin...");
  await clerk.organizations.updateOrganizationMembership({
    organizationId: workplacesOrg.id,
    userId: bruceClerkUserId,
    role: "org:admin",
  });
}
console.log("Setting membership publicMetadata.app_role = master_admin...");
await clerk.organizations.updateOrganizationMembershipMetadata({
  organizationId: workplacesOrg.id,
  userId: bruceClerkUserId,
  publicMetadata: { app_role: MASTER_ROLE },
});

// 3. Map the master orgs row to the production Clerk org id.
if (masterOrg.clerk_org_id !== workplacesOrg.id) {
  console.log(
    `Updating orgs.clerk_org_id: ${masterOrg.clerk_org_id} → ${workplacesOrg.id}`,
  );
  await sql`
    UPDATE orgs SET clerk_org_id = ${workplacesOrg.id}, updated_at = now()
    WHERE id = ${masterOrg.id}
  `;
}

// 4. Reconcile Bruce's user_profiles row.
//    Pick the canonical row: prefer the existing master_admin row in the
//    master org (it owns the coaches link + all historical FKs); else any
//    profile in the master org with this email.
const masterOrgProfiles = dbProfiles.filter((p) => p.org_id === masterOrg.id);
const canonical =
  masterOrgProfiles.find((p) => p.role === MASTER_ROLE) ||
  masterOrgProfiles.find((p) => p.is_coach) ||
  masterOrgProfiles[0] ||
  null;

// A stray row may exist under the production id (the client_employee that
// first-visit provisioning created). If it's NOT the canonical row, remove
// it so we can free the UNIQUE clerk_user_id for the canonical row.
const stray = dbProfiles.find(
  (p) =>
    p.clerk_user_id === bruceClerkUserId &&
    (!canonical || p.id !== canonical.id),
);
if (stray) {
  console.log(
    `Deleting stray auto-provisioned profile (${stray.role} in ${stray.org_name}, id=${stray.id})...`,
  );
  await sql`DELETE FROM user_profiles WHERE id = ${stray.id}`;
}

let canonicalId;
if (canonical) {
  console.log(
    `Updating canonical profile ${canonical.id}: clerk_user_id → ${bruceClerkUserId}, role → ${MASTER_ROLE}`,
  );
  await sql`
    UPDATE user_profiles
    SET clerk_user_id = ${bruceClerkUserId},
        role = ${MASTER_ROLE},
        email = ${EMAIL},
        full_name = ${bruceFullName},
        updated_at = now()
    WHERE id = ${canonical.id}
  `;
  canonicalId = canonical.id;
} else {
  console.log("No existing profile in master org — inserting a fresh one...");
  const inserted = await sql`
    INSERT INTO user_profiles (clerk_user_id, org_id, email, full_name, role)
    VALUES (${bruceClerkUserId}, ${masterOrg.id}, ${EMAIL}, ${bruceFullName}, ${MASTER_ROLE})
    RETURNING id
  `;
  canonicalId = inserted[0].id;
}

// 5. Ensure a coaches row links to the canonical profile.
const existingCoach = await sql`
  SELECT id FROM coaches WHERE user_profile_id = ${canonicalId} LIMIT 1
`;
if (existingCoach.length === 0) {
  console.log("Creating coaches row for Bruce...");
  await sql`
    INSERT INTO coaches (org_id, user_profile_id, status)
    VALUES (${masterOrg.id}, ${canonicalId}, 'active')
  `;
}

// --- Verify ---
const after = await sql`
  SELECT up.role, up.clerk_user_id, o.name AS org, o.clerk_org_id,
         (c.id IS NOT NULL) AS is_coach
  FROM user_profiles up
  JOIN orgs o ON o.id = up.org_id
  LEFT JOIN coaches c ON c.user_profile_id = up.id
  WHERE up.id = ${canonicalId}
`;
console.log("\nFinal state:");
console.table(after);

console.log(
  "\n✅ Repair complete.\n\n" +
    "Next: sign out of builder.4workplaces.com and sign back in. Clerk will\n" +
    "activate the Workplaces org (your only one) and you'll land in the coach\n" +
    "console at /business-builder as master_admin.\n\n" +
    "If a stale session still drops you on /portal, clear the\n" +
    "'portal_preview' and 'selected_engagement_slug' cookies for the domain.",
);
