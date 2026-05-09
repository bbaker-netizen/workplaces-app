# Decisions Log

Running record of architectural decisions and future-state notes for The
Builder. Append-only — newest at the top. Each entry: date, context,
decision, follow-up (if any).

---

## 2026-05-09 — Reference apps for The Builder + scheduling elevated to Phase 2

**Context.** Bruce shared three reference apps as ongoing inspiration for The Builder:
- **Motion** (usemotion.com) — AI-powered project + task management with auto-scheduling tasks into the calendar
- **Reclaim.ai** (reclaim.ai) — smart calendar assistant; habits, focus blocks, smart 1:1s, buffer time
- **CoachAccountable** (coachaccountable.com) — purpose-built coaching platform; closest direct analog to The Builder

**Decisions.**

1. **CoachAccountable is the validation lens for Phase 2/3 modules.** Its feature set (client portal, goals, worksheets, courses, scheduling, billing, forms, multi-coach) maps almost 1:1 onto our planned module library. When a Phase 2/3 module ships, before declaring it done compare its polish to CoachAccountable's equivalent — if ours is materially thinner, flag before tagging.

2. **Scheduling/Calendar elevated from "deferred" to a Phase 2 module.** Two of Bruce's three references (Motion, Reclaim) are scheduling-first products; CoachAccountable has session scheduling baked in. Previously Phase-1-Plan.md parked "Scheduling & Calendars" in the Phase 2+ deferred list with no explicit slot. Now slated as a Phase 2 module — equal-footing with BBS Sessions, Soul File, Goals, Projects, Hiring, Person Profiles, Forms, Deliverables. Specific scope (Calendly-style booking link? Native calendar UI? Sync to Google Calendar?) to be designed when the sub-phase opens.

3. **AI auto-scheduling (Motion-style) stays deferred to Phase 3+.** Heavy build (calendar diffing, conflict resolution, priority modeling, multi-user scheduling). Basics need to land first — basic calendar viewing, manual booking, sync — before the AI layer makes sense.

**How future sessions should apply.** When Bruce describes a feature ambiguously ("can we add X like Y…"), default to the reference apps' UX as the mental model unless he specifies otherwise. Memory note `project_reference_apps.md` carries the same context for sessions that don't read this log first.

---

## 2026-05-09 — Communication module: MS Teams parity scope

**Context.** Bruce asked whether messaging could mimic Microsoft Teams — rich text toolbar, emojis, file attachments, reactions, etc. Surveyed the gap and split features by effort, then locked the next session's scope so the deferred items have a documented home and don't get forgotten.

**Locked next session: Sub-Phase 1.3.5 — Composer UX upgrades.**

1. **Rich text toolbar in the composer.** Replace the plain `<textarea>` with a Tiptap-based WYSIWYG editor (same library the HR app uses, so we have a working reference). Toolbar: bold / italic / strike / link / bullet list / numbered list / blockquote / inline code. Output stored as Markdown in `messages.body` so the existing `MarkdownBody` renderer keeps working without changes; reads stay backwards-compatible with messages typed under 1.3's plain-textarea regime.
2. **Emoji picker.** A 😀 button in the composer opens a searchable picker; selection inserts the unicode glyph into the editor at cursor. Library: `emoji-picker-react` (already proven in similar apps; no Giphy/sticker pulls). Renderer needs no changes — Markdown handles unicode natively.
3. **Emoji reactions on messages.** Hover a message → "+ reaction" button surfaces a quick-pick row of common reactions (👍 ❤️ 😂 🎉 👀 ✅) plus an "Other" button that opens the full picker. Reactions render as small pill chips below the message body with author names on hover and a count when more than one person uses the same emoji. Click your own reaction to remove it. New table: `message_reactions(message_id, user_profile_id, emoji)` with a composite PK preventing duplicate reactions, RLS via the parent message's `org_id`. Migration `0005_message_reactions.sql`.

**Deferred to Phase 1.5 (Documents Module): file attachments on messages.** The original Phase-1-Plan.md already slates the Netlify Blobs upload pipeline for 1.5. Folding message attachments into 1.5 means we build the upload + preview surface once and use it both as standalone Documents and as message attachments — paperclip icon in the composer triggers the same upload flow that powers `/portal/documents`. Doing it earlier means duplicating the Blobs work.

**Deferred to Phase 2+: reply-to-specific-message** (sub-threads inside a thread). Adds a `parent_message_id` column to `messages` plus a UI for indented replies. Useful but not on the path to running one BBS through The Builder.

**Out of scope (no current plans):**
- **Read receipts** ("Seen by Bruce 2 min ago") — needs a per-recipient tracking table, complicates the schema for marginal value at one pilot client.
- **Typing indicators** ("Bruce is typing…") — needs real-time WebSocket / Postgres LISTEN/NOTIFY plumbing. CLAUDE.md already names that infrastructure for SSE; surfacing typing on top of it is non-trivial UI work for a low-payoff feature.
- **GIFs / Giphy / stickers** — third-party API + content moderation surface; not aligned with the heritage-industrial brand.
- **Voice / video calls** — out of scope; The Builder is not a Slack/Teams replacement, just a coaching ops surface.

**How to apply.** When the next session kicks off, the Active Phase section of CLAUDE.md will point at 1.3.5. After 1.3.5 ships, Active Phase moves to 1.4 (@mentions + Resend wiring per the original Phase-1-Plan.md). 1.5 picks up the documents module + message attachments together.

---

## 2026-05-09 — Sub-Phase 1.3: Communication Module + Contextual Conversations

**Context.** Building threaded messaging on top of the `messages` table introduced in 1.1. Bruce expanded the original Phase-1-Plan.md scope mid-session: rather than a single engagement-wide thread, he required role-based audience compartmentalization from day one. Specifically: when a client eventually invites managers/employees to the engagement, there must be a private channel just between coach and owner/lead that team members can't see. Original plan called the general thread `parent_entity_type='engagement'`; the audience requirement forced a richer model.

**Decisions locked.**

1. **Three-way audience model.** Threads come in three flavours, discriminated by `messages.parent_entity_type`:
   - `engagement_leadership` — `master_admin` / `coach` / `client_lead` / `client_manager`. Hidden from `client_employee`.
   - `engagement_team` — everyone in the engagement.
   - `action_item` — everyone in the engagement (Phase 1.3). Per-item audience flag deferred to Phase 2 once team members are routinely on engagements.

   Audience helpers live in `lib/communication/audience.ts` (`canViewThread`, `canPostInThread`). Single source of truth used by queries (filter), server actions (gate), and pages (tab visibility). For Impactica today (just Bruce + client lead), both audiences resolve to the same set of people — the wall has nobody to keep out yet but is in place for the day team members arrive.

2. **WhatsApp-style soft-delete tombstone** (Bruce's call). Deleted messages stay in the thread as `[Message deleted]` so the conversation flow remains readable past them. Implemented as a sentinel string `TOMBSTONE_BODY` written into `body`; the renderer keys off it. Author or any leadership role may delete; tombstoned rows hide further edit/delete actions and are idempotent on repeat delete.

3. **Inline edit drawer** for messages (mirrors 1.2's "fast path inline" pattern for action item status pills). Native `confirm()` for delete — Phase 1.3 stays dependency-free for confirmations.

4. **Markdown rendering with sanitization.** `react-markdown` + `remark-gfm` + `rehype-sanitize`. Renderer is shared (`components/markdown/MarkdownBody.tsx`) and used for both message bodies and action item description previews on cards (per the Phase-1-Plan.md "same renderer" note). Sanitize plugin is the security boundary — every message body is multi-tenant UGC, so raw HTML in input is stripped against the default safe schema.

5. **No new migration.** The `messages` table from 1.1 is already shaped for everything 1.3 needs. The `parent_entity_type` text column accepts the three new discriminators without schema change.

**"use server" export-only-async constraint surfaced.** Initial draft of `lib/actions/messages.ts` co-located the `TOMBSTONE_BODY` constant and `isTombstone()` helper with the server actions. Next.js (14.2.35) refused to build: "Only async functions are allowed to be exported in a 'use server' file." Split into `lib/communication/tombstone.ts`. Same shape as the HR app's prior fix ("Fix Netlify build: split 'use server' files"). Rule going forward: any `"use server"` file holds only `async function` exports — constants and sync helpers live in a sibling non-server module.

**Stale `docs/CLAUDE.md` removed.** Root `CLAUDE.md` and `docs/CLAUDE.md` had drifted out of sync (root v3 was current, docs v3 still claimed Active Phase = Phase 0). Root is canonical; deleted the duplicate to remove the bookkeeping trap.

**Coach cross-org gap continues** (same as 1.2). `withTenantContext(profile.orgId)` binds to the caller's home org. When Bruce (in the master org) views a thread in a CLIENT org, RLS would filter to nothing. Phase 1.3 testing lives entirely in the master org's "Bruce Test" engagement, so the gap doesn't bite yet. Phase 1.7 will introduce a coach-aware tenant helper that resolves `parent_entity_id`'s home org and binds to it.

**Acceptance gap, documented.** Live receive-side test (a real `client_lead` viewing the audience boundary in their browser) is still blocked by the single-phone Clerk verification constraint that's been carried since Phase 0 Step 5. Verified via code review and `pnpm build` static analysis (15 routes compile clean). Real exercise happens in Phase 1.7 with the actual Impactica client lead.

**New deps.** `react-markdown@^10`, `remark-gfm@^4`, `rehype-sanitize@^6`. ~80kb gzipped on the message-rendering pages.

**New top-level package.json script.** `pnpm typecheck` (`tsc --noEmit`) — should have been there since Phase 0 but slipped through. Added in 1.3 because 1.3 was the first sub-phase complex enough to warrant it as a standalone CI gate distinct from `pnpm build`.

---

## 2026-05-03 — Sub-Phase 1.2: Action Items module — UX + structural decisions

**Context.** Building the first portal module on top of the `action_items` table from 1.1. Five clarifying questions resolved up front; a sixth (schema gap) surfaced once I read the table definition.

**Decisions locked.**

1. **Form defaults** (Q1, option b): new action items default to `status='open'`, `due_date=+14 days from today`, `assignee=client_lead` resolved via fallback chain (engagement's `client_lead` → first non-coach member → current user). Bruce's solo-test scenario hits the third rung — assignee defaults to himself.

2. **List structure** (Q2, option a): single chronological list with filter chips above. Counts on each chip. Tabs and section headers were rejected — chips are the most mobile-friendly and the most compact. Implemented in `components/action-items/FilterChips.tsx`.

3. **Sort** (Q3, option b): overdue items pinned at the top with Safety Vest Orange (`#E87722`) left-border treatment, then due-date ascending, then no-due-date items at the bottom. "Done" items never count as overdue regardless of due date. Pure server-side sort in `components/action-items/sort.ts`; client doesn't re-sort after filters change.

4. **Status update UX** (Q4, option c): both. Status pill click on a card opens an inline native `<select>` dropdown (fast path for the most common interaction); full card click navigates to the edit page (everything else — title, description, assignee, due, flags, delete). Native `<select>` instead of a custom Radix popover keeps Phase 1.2 dependency-free; mobile-friendly without extra effort.

5. **Portal routing pattern** (Q5, option a): module-per-route. `/portal/page.tsx` is a thin dashboard with welcome + module quick-links; each module gets its own sub-route (`/portal/action-items`, `/portal/notifications`, future `/portal/communication` and `/portal/documents`). EngagementSlug-scoped routing deferred to Phase 2+ when a user can belong to multiple engagements. The new `/portal/layout.tsx` holds the shared shell (brand wordmark, nav links, notification bell, sign out).

**Schema gap fixed in `0004_action_items_title.sql`.** The 1.1 schema had `description text NOT NULL` as the action's only text field. The 1.2 form needs both a short `title` (required) and an optional markdown `description`. Added `title text NOT NULL`; dropped `NOT NULL` on `description`. Zero rows in the table at migration time, so no backfill / default value required.

**Coach edit cross-org gap.** `updateActionItem` / `deleteActionItem` use `withTenantContext(profile.orgId)`, which works for same-org users (client roles in their own org, or Bruce in his master org's "Bruce Test" engagement). For a coach editing an item in a CLIENT org (Phase 1.7+), the GUC won't match the item's `org_id` and RLS would block. Phase 1.2 testing happens entirely in the master org (the test engagement lives there), so the gap doesn't bite. Phase 1.7 will need either: per-action lookup of the item's org_id and `withTenantContext(item.orgId)`, or a coach-aware variant of the helper. Defer.

**Notifications scope for 1.2.** Only `action_item_assigned`, `sent_via='in_app'`. Self-assignments don't fire notifications (kickoff explicit). Per-item read tracking is Phase 2 polish; for now `MarkAllReadOnMount` on the notifications page clears all unread on visit. Email triggers wait for Phase 1.4 + Resend.

**Test setup.** `scripts/setup-bruce-test-engagement.mjs` creates a "Bruce Test" engagement directly in the master org. Doesn't go through `/coach/engagements/new` because that creates a fresh client Clerk Org — overkill for solo-coach testing where Bruce just needs a local writable engagement. Idempotent; re-runs are no-ops.

**New deps:** none. `lucide-react` (Bell icon), `date-fns` (formatting), `clsx`/`tailwind-merge` (already installed for shadcn) all carry their weight here. No new package additions in 1.2.

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
