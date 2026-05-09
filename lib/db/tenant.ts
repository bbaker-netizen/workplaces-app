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

/* -------------------- Engagement-aware tenant helper -------------------- */

import { engagements } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Resolve the org id that owns a given engagement, using the system
 * context (RLS off) so coaches can find engagements in any org.
 *
 * Used by `withEngagementContext` — every server action that takes an
 * engagementId calls through this helper to produce the right tenant
 * binding. Caching: per-request, in-memory, deduplicates lookups when
 * a single action makes several queries against the same engagement.
 */
const engagementOrgCache = new Map<string, string>();
async function resolveEngagementOrgId(
  engagementId: string,
): Promise<string | null> {
  const cached = engagementOrgCache.get(engagementId);
  if (cached) return cached;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!row) return null;
    engagementOrgCache.set(engagementId, row.orgId);
    return row.orgId;
  });
}

/**
 * `withEngagementContext` — bind RLS to the org that owns an engagement,
 * not necessarily the caller's home org.
 *
 *   - Coach roles (`master_admin` / `coach`): GUC binds to the
 *     engagement's org id, regardless of the caller's home org.
 *     This is what lets Bruce post in a CLIENT engagement from the
 *     master org session.
 *   - Client roles: GUC binds to the caller's home org. If the
 *     engagement doesn't live there, throws — RLS would have filtered
 *     to nothing anyway, but throwing produces a clearer error.
 *
 * Use this helper instead of `withTenantContext(profile.orgId, ...)`
 * for every server action and read query that takes an engagementId.
 */
export async function withEngagementContext<T>(
  callerOrgId: string,
  callerRole: string,
  engagementId: string,
  fn: (tx: Tx, boundOrgId: string) => Promise<T>,
): Promise<T> {
  const isCoachLike =
    callerRole === "master_admin" || callerRole === "coach";

  let targetOrgId = callerOrgId;
  if (isCoachLike) {
    const resolved = await resolveEngagementOrgId(engagementId);
    if (!resolved) {
      throw new Error("Engagement not found.");
    }
    targetOrgId = resolved;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE workplaces_app`);
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${targetOrgId}, true)`,
    );

    if (!isCoachLike) {
      // Client roles: verify the engagement actually belongs to the
      // caller's org. RLS would filter cross-org reads to nothing, but
      // raising lets the caller surface a clear error instead of
      // looking like a missing record.
      const [row] = await tx
        .select({ orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!row) throw new Error("Engagement not found.");
      if (row.orgId !== callerOrgId) {
        throw new Error("Engagement isn't in your org.");
      }
    }

    return fn(tx, targetOrgId);
  });
}

/**
 * Resolve the engagement id for an arbitrary record (action item,
 * message, document, session, goal, soul file, …) without RLS getting
 * in the way. System context only — RLS off — so it works whether or
 * not the caller can see the row in their tenant.
 *
 * Returns null if the record doesn't exist. Caller MUST then validate
 * via `withEngagementContext`, which enforces audience rules for both
 * coach and client roles.
 */
export async function resolveEngagementIdFromRecord(
  table:
    | "messages"
    | "action_items"
    | "documents"
    | "bbs_sessions"
    | "goals"
    | "soul_files"
    | "message_reactions"
    | "projects"
    | "tasks",
  recordId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    if (table === "message_reactions") {
      const result = await tx.execute(
        sql`SELECT m.engagement_id AS "engagementId"
            FROM message_reactions r
            JOIN messages m ON m.id = r.message_id
            WHERE r.message_id = ${recordId}
            LIMIT 1`,
      );
      const rows = result.rows as Array<{ engagementId: string }>;
      return rows[0]?.engagementId ?? null;
    }
    if (table === "tasks") {
      // Tasks resolve through their project.
      const result = await tx.execute(
        sql`SELECT p.engagement_id AS "engagementId"
            FROM tasks t JOIN projects p ON p.id = t.project_id
            WHERE t.id = ${recordId}
            LIMIT 1`,
      );
      const rows = result.rows as Array<{ engagementId: string }>;
      return rows[0]?.engagementId ?? null;
    }
    const tableSql = sql.raw(`"${table}"`);
    const result = await tx.execute(
      sql`SELECT engagement_id AS "engagementId"
          FROM ${tableSql}
          WHERE id = ${recordId}
          LIMIT 1`,
    );
    const rows = result.rows as Array<{ engagementId: string }>;
    return rows[0]?.engagementId ?? null;
  });
}
