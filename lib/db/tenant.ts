/**
 * Tenant-scoped database access for The Builder runtime.
 *
 * Every server action, server component, or route handler that touches
 * tenant-scoped tables must go through `withTenantContext`. Centralizing
 * the role + GUC setup here keeps Postgres RLS as a single audit point —
 * sprinkled `SET LOCAL` calls across the codebase are exactly the
 * regression we want to prevent.
 *
 * See:
 *   - lib/db/migrations/0001_rls_policies.sql — RLS policies
 *   - lib/db/migrations/0002_app_role.sql     — workplaces_app role
 *   - docs/decisions.md                        — Dual-role pattern
 */

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

// neon-serverless's Pool driver speaks Postgres over a WebSocket.
// Node 20 (our Netlify target) doesn't ship a stable global WebSocket,
// so we provide one explicitly via the `ws` package.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — copy .env.example to .env.local and fill it in.",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Drizzle database handle. Internal — application code should NOT import
 * this directly; reach the database through `withTenantContext()` so
 * tenant scoping is enforced at the boundary. Migrations and admin
 * scripts that legitimately need owner privileges construct their own
 * Pool elsewhere.
 */
const db = drizzle(pool);

// Extract the transaction-callback's tx parameter type from Drizzle's
// signature. The tx itself isn't generic over the callback return type,
// so this resolves to a concrete Drizzle PgTransaction.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run a callback inside a Postgres transaction with tenant context set:
 *
 *   1. `SET LOCAL ROLE workplaces_app` — drops to the NOBYPASSRLS role
 *      so RLS policies actually bind. neondb_owner has BYPASSRLS by
 *      default and would otherwise see all tenants' rows.
 *   2. `set_config('app.current_org_id', orgId, true)` — feeds the GUC
 *      that `auth.org_id()` reads in every RLS policy predicate.
 *   3. Callback runs against `tx`. All queries inside see the role +
 *      GUC and are filtered by RLS to the active tenant.
 *
 * Both settings are transaction-scoped (SET LOCAL, is_local=true) so
 * they reset at COMMIT/ROLLBACK and never leak across pooled connections.
 *
 * @example
 *   import { engagements } from "@/lib/db/schema";
 *   export async function listEngagements(orgId: string) {
 *     return withTenantContext(orgId, (tx) =>
 *       tx.select().from(engagements),
 *     );
 *   }
 */
export async function withTenantContext<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE workplaces_app`);
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Bootstrap a brand-new tenant. Functionally identical to
 * `withTenantContext`, but named to make intent clear at the orgs-row
 * creation call site: `newOrgId` is a UUID generated in app code that
 * will become the new tenant's `id`. Setting the GUC to that UUID first
 * lets the orgs INSERT pass `WITH CHECK (id = auth.org_id())`.
 */
export const withBootstrapContext = withTenantContext;

/**
 * System-context helper — runs the callback inside a transaction WITHOUT
 * the role drop. The active role stays `neondb_owner` (BYPASSRLS), so
 * RLS does NOT bind. Use ONLY for legitimate pre-tenant-context
 * operations where there is no orgId to scope to:
 *
 *   - First-time provisioning lookups (find user_profile by clerk_user_id
 *     before we know which org to scope to).
 *   - Admin scripts and one-off maintenance.
 *
 * Never reach for this in tenant-data queries. `withTenantContext` is
 * the audit point for RLS enforcement; this helper is the deliberate,
 * narrow exception.
 */
export async function withSystemContext<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
