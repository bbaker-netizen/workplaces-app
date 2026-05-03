# Decisions Log

Running record of architectural decisions and future-state notes for The
Builder. Append-only — newest at the top. Each entry: date, context,
decision, follow-up (if any).

---

## 2026-05-03 — Sub-Phase 1.1 cutover: real Clerk Organizations replace personal-org placeholder

**Context.** Phase 0 stored `orgs.clerk_org_id = clerk_user_id` (a `user_…`-prefixed placeholder) because Clerk's Organizations feature wasn't enabled. Phase 1.1 enables Organizations, migrates Bruce's master org row to a real Clerk Org id (`org_…`), and routes every new engagement through Clerk's invitation flow. Personal-org auto-creation in `provisioning.ts` is retired entirely.

**Decisions.**

1. **One Clerk Organization per engagement.** "Workplaces" is the master Org (Bruce admin). Each client engagement gets its own Clerk Org; the client lead is an `org:admin` of *their* org only. Bruce is *not* a member of client orgs (auto-removed after the invitation goes out — see ordering decision below). This keeps `user.organizationMemberships` clean and keeps Clerk's session model unambiguous about which org is active.

2. **`Membership required` ON in Clerk dashboard.** Personal accounts disabled. Every authenticated session must have an active org context. Backed by app-level enforcement in `ensureUserProfile` (no active org → return `{ status: 'no_invitation' }` → redirect to `/no-invitation`). Defence in depth.

3. **Roles assigned from invitation `publicMetadata.app_role`.** The engagement creation flow encodes our app's `client_lead` role in the invitation's `publicMetadata`; Clerk copies it to the resulting `OrganizationMembership.publicMetadata` when the invitee accepts. First-visit provisioning reads it via `clerkClient.users.getOrganizationMembershipList`, validates against the role enum, defaults to `client_employee` (lowest privilege) on missing/invalid input.

4. **First-visit auto-provision continues; webhook deferred to Phase 2.** Provisioning happens lazily on first portal load instead of via a Clerk `user.created` webhook. Avoids the local-dev tunneling friction (ngrok/Clerk CLI) and the `svix` dependency. Phase 2 swaps in webhooks for production correctness.

5. **`@clerk/backend` added as a direct dep.** Was transitive via `@clerk/nextjs`; pnpm's strict isolation hides transitives from `.mjs` scripts. Made it explicit so `scripts/migrate-real-clerk-orgs.mjs` and `scripts/cleanup-impactica-test.mjs` resolve it cleanly.

**One-shot migration:** `scripts/migrate-real-clerk-orgs.mjs` (idempotent — re-runs are no-ops once `clerk_org_id` starts with `org_`). Run once on 2026-05-03; created Clerk Org `org_3DE6hCoL4MJtDAxa5JCq20KxzgT`, joined Bruce as admin, updated Bruce's master orgs row.

**Acceptance gap (same shape as Phase 0 Step 5).** The receive-side of the invitation flow — invitee opens the email, signs up, lands in their portal as `client_lead` — is verified by code review and by the *sending* side ending in a correctly-shaped pending invitation (verified via Clerk Backend API listing). Live receive-side test was blocked by Bruce's single phone number for Clerk verification; same blocker as Phase 0 Step 5. The real test happens in Phase 1.7 with the actual Impactica client lead.

---

## 2026-05-03 — Engagement creation server action: step ordering

**Context.** First attempt at the engagement creation flow ordered the Clerk operations as:
1. `createOrganization({ createdBy: bruce })` — Clerk auto-adds Bruce as admin
2. `deleteOrganizationMembership(bruce)` — strip Bruce's auto-membership
3. DB inserts
4. `createOrganizationInvitation` — **403 Forbidden**

**Why it failed.** Clerk's invitation API requires `inviterUserId` to be an active admin of the org. Step 2 stripped that before step 4 needed it.

**Decision: reorder.** Final order in `app/coach/engagements/new/actions.ts`:
1. `createOrganization` (Bruce auto-admin)
2. DB inserts (orgs + engagements). On failure, attempt to delete the orphan Clerk Org so we don't leak resources.
3. `createOrganizationInvitation` (works because Bruce is still admin). On failure, surface "engagement created but invitation failed; you can resend manually" — Bruce stays admin so he has dashboard access.
4. `deleteOrganizationMembership(bruce)`. Non-fatal on failure (Bruce can clean up via dashboard).

**Side note: self-invitation also fails.** Inviting an email that belongs to the inviter's own Clerk user (e.g. Bruce inviting `bbaker@4workplaces.com` while admin of the new org) returns `400 Bad Request`. For test invitations to Bruce's inbox, use `bbaker+impactica@4workplaces.com` so Clerk treats it as a distinct user identity. Real engagements use the actual client lead's email and won't hit this.

**Error message extraction.** Initial implementation of the catch block surfaced `e.message` only — Clerk API errors set that to the bare HTTP status text ("Bad Request", "Forbidden"). Added a `clerkErrorMessage()` helper that pulls from `e.errors[0].longMessage` first, falling back to the plain message. Future Clerk failures show the actual reason in the form's error band.

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

## 2026-05-02 — Phase 0 provisioning: personal org, first-visit, master_admin, manual master flip

**Context.** Step 5 needed a way to land a new Clerk-authenticated user
on `/portal` with a row in `user_profiles`. Several shortcuts were taken
to keep Phase 0 focused on proving the loop works; each one has a Phase 1
follow-up.

**Decisions (all Phase 0 only — Phase 1 replaces).**

1. **Personal org per signup, `clerk_org_id = clerk_user_id` placeholder.**
   Each new user gets one `orgs` row with `type='client'` and
   `clerk_org_id` set to their Clerk *user* id (not a real Clerk Org id —
   Clerk Organizations isn't enabled yet). Phase 1 introduces a real
   invitation-based multi-tenant model where `clerk_org_id` references a
   genuine Clerk Organization.

2. **First-visit auto-provision, not webhook.** `lib/db/provisioning.ts`
   `ensureUserProfile` runs from `app/portal/page.tsx` on every portal
   load; if no `user_profiles` row exists for the Clerk user, it creates
   org + profile in a single bootstrap transaction. The kickoff plan
   called for a Clerk webhook (`user.created → server action`) — deferred
   to Phase 1 to avoid the local-dev tunneling friction (ngrok/Clerk CLI)
   and the `svix` dependency.

3. **`role = 'master_admin'` for every Phase 0 sign-up.** Single test
   user (Bruce) needs full visibility. Phase 1 swaps to email-conditional
   or invitation-driven role assignment.

4. **Bruce's org manually flipped to `type='master'` post-signup.** The
   provisioning handler can't know which signup is the Workplaces master
   org vs. a regular client org — it always defaults to `'client'`.
   Bruce's row needs `type='master'` for downstream coach-side queries.
   One-shot SQL, recorded here for traceability:

   ```sql
   UPDATE orgs SET type = 'master'
   WHERE name = 'bbaker@4workplaces.com';
   ```

   Run as `neondb_owner` (BYPASSRLS) on 2026-05-02. Org id
   `29af29d7-3ad1-47fd-81af-24151aa78ecf`. `updated_at` trigger
   confirmed firing.

**Phase 1 backlog** (record only — not for now):

- Clerk webhook handler (`/api/webhooks/clerk`) for `user.created` and
  Clerk Organization events; `svix` dependency.
- Real Clerk Organizations: `clerk_org_id` references a true Clerk Org;
  membership and invites managed in Clerk UI.
- Email-or-invitation-conditional role assignment.
- Replace the manual master flip with either an env-var allowlist of
  master-org emails or an admin-only flip endpoint.

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
