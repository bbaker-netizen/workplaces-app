# Decisions Log

Running record of architectural decisions and future-state notes for The
Builder. Append-only — newest at the top. Each entry: date, context,
decision, follow-up (if any).

---

## 2026-05-02 — Trigger drift: new tenant-scoped tables need `set_updated_at`

**Context.** The shared `set_updated_at()` trigger function and per-table
`<table>_set_updated_at` triggers were appended manually to migration
`0000_shallow_northstar.sql` after `drizzle-kit generate`. They live
outside Drizzle's snapshot system (`lib/db/migrations/meta/`), which only
tracks what's in `lib/db/schema.ts`. Drizzle won't drop them on subsequent
generates (it doesn't know they exist), but it also won't add them to new
tables.

**Decision.** When introducing a new tenant-scoped table in any future
migration, hand-append a `CREATE TRIGGER <table>_set_updated_at BEFORE
UPDATE ON "<table>" FOR EACH ROW EXECUTE FUNCTION set_updated_at();`
to the generated SQL. The shared function already exists in the database
from migration 0000 — never re-create it.

**Follow-up.** If we end up doing this for more than ~3 tables, write a
`pnpm db:add-trigger <table>` helper script that takes a table name and
appends the trigger to the latest migration. Don't write the helper yet
— premature.

---

## 2026-05-02 — Phase 0 schema: defer `started_at` / `contract_signed_at` on engagements

**Context.** Phase 0 minimum schema for `engagements` includes `start_date`,
`end_date`, plus `created_at` / `updated_at`. `start_date` is the planned
or scheduled engagement start, set by the coach. `created_at` is row-creation
time.

**Gap.** There's no field that captures the moment the engagement
*actually became active* in the methodology sense — the contract signing
or the formal start of work. For reporting (cohort analyses, time-to-active,
churn timing) we'll want to distinguish "record exists" from
"engagement is live."

**Decision.** Don't add the field in Phase 0. Add it as a one-line
`ALTER TABLE engagements ADD COLUMN started_at timestamptz` in Phase 1 or
Phase 2 when the first reporting use case surfaces. Likely name:
`started_at` (with `contract_signed_at` as an alternate if we end up
tracking the legal moment separately from the operational moment).

**Why defer.** Adding it now means filling it for every test row with
plausible values; better to introduce it when the reporting need is
concrete. Non-blocking — we can backfill from Adobe Sign envelope timestamps
or contract metadata when we get there.

---

## 2026-05-02 — Phase 0 schema: `updated_at` enforced via Postgres trigger

**Context.** Every tenant-scoped table has `updated_at timestamptz NOT NULL
DEFAULT now()`. Postgres doesn't update this column on subsequent UPDATEs
unless something explicitly sets it.

**Options considered.**
- **A.** Database trigger on each table → one shared `set_updated_at()`
  function plus a per-table trigger.
- **B.** Drizzle `$onUpdate(() => new Date())` at the column level
  (app-layer only).
- **C.** Manual `updated_at = now()` in every mutation.

**Decision.** Option A. The shared function lives in the initial migration,
each tenant-scoped table gets its own `<table>_set_updated_at` trigger.

**Why.** Audit fields should be enforced at the lowest layer that can
guarantee them. App-layer enforcement (B) breaks if anything bypasses
Drizzle — drizzle-kit's own dashboard tools, raw SQL, future scripts.
Trigger-based enforcement is invariant under writer.

**Cost.** ~10 SQL lines added to the migration. No application-side
changes needed.

---

## 2026-05-02 — Dual-role pattern: `neondb_owner` for DDL, `workplaces_app` for runtime

**Context.** RLS policies were applied in migration `0001_rls_policies.sql`
with `FORCE ROW LEVEL SECURITY` so even the table owner is bound. First
verification run still showed cross-tenant rows leaking through. Root
cause: Neon's `neondb_owner` role has the `BYPASSRLS` role attribute by
default, and `BYPASSRLS` beats `FORCE`. The current connection user was
silently bypassing every policy.

**Decision.** Two roles. `neondb_owner` retains `BYPASSRLS` and is used
only for DDL — migrations, drizzle-kit, the occasional admin script. A
new role `workplaces_app` (created in `0002_app_role.sql`) is `NOBYPASSRLS
NOLOGIN`, granted to `neondb_owner`, with SELECT / INSERT / UPDATE / DELETE
on the public schema and EXECUTE on `auth.org_id()`. Every tenant-scoped
runtime transaction does `SET LOCAL ROLE workplaces_app` immediately
before `set_config('app.current_org_id', uuid, true)` — the role drop
removes the bypass for the duration of the txn, the GUC feeds the policy
predicate, and `SET LOCAL` resets both at COMMIT/ROLLBACK so nothing
leaks across the connection pool.

**Single audit point: `withTenantContext`.** All runtime DB access for
tenant-scoped tables goes through `lib/db/tenant.ts`. The helper opens a
Drizzle transaction, runs the role drop and GUC set, then invokes the
caller's callback against the transaction handle. Server actions, server
components, and route handlers must use this helper — never `drizzle()` or
raw SQL clients directly. Centralising the role/GUC setup means RLS can't
be silently bypassed by future contributors copy-pasting the wrong
pattern.

**Why not separate connection strings (`DATABASE_URL_APP`).**
Considered. Strictest separation but introduces password management
(rotation, env hygiene, Netlify dashboard sync) for marginal benefit
once the `withTenantContext` boundary is enforced. The role-drop
approach uses one connection string and gets equivalent RLS binding.
Re-evaluate when there's a concrete reason to physically separate
read/write paths.

**Verification.** `scripts/verify-rls.mjs` exercises five scenarios end-
to-end: bootstrap, positive isolation, negative read, negative write
(asserting `42501`), and cleanup. Pre-flight cleanup runs as
`neondb_owner` (no role drop) so stale `test_clerk_%` rows from prior
failed runs get swept idempotently.

---

## 2026-05-02 — Multi-tenancy: Clerk Organizations + Postgres RLS via session GUC

**Context.** Two viable patterns for tenant scoping with Clerk: (1) app-managed
orgs with Clerk treating users as flat, plus a session-level GUC to feed
the tenant id into RLS; (2) Clerk Organizations as the source of truth, with
the app's `org` table mapping via `clerk_org_id` and the JWT carrying the
active org.

**Decision.** Hybrid leaning on (2). Clerk Organizations own identity and
membership. The `orgs` table holds domain-specific fields (name, type,
methodology metadata to come) and a `clerk_org_id` foreign reference. At
request boundary, Next.js middleware reads `orgId` from the Clerk session
and runs `SET LOCAL app.current_org_id = '<id>'` on the connection. RLS
policies use a Postgres function `auth.org_id()` that reads the GUC.

**Why.** Clerk Organizations gives us membership management, invites, and
SSO mechanics without rebuilding any of it. The session GUC is still the
right RLS shape because (a) it works for any direct DB access path, not
just Clerk-mediated ones, and (b) it cleanly supports the cross-org
visibility we'll need for coaches in Phase 1 (set the GUC to the *active*
org, not necessarily the user's home org).

**Phase 0 scope.** RLS predicate is `org_id = auth.org_id()` — strict
single-tenant per request. Coach cross-org reads are a Phase 1 addition,
likely via an `engagement_membership` junction.
