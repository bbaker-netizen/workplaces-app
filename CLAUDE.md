# CLAUDE.md — The Builder (Workplaces Application)

This file is read by Claude Code at the start of every session. Keep it updated as the project evolves.

**v3 of this file (May 2 2026).** Brand direction now locked: The Builder. Tagline: "Build what compounds." Formal attribution where surfaced: *The Builder · By Workplaces*.

---

## Project Overview

**Owner:** Bruce Baker — Workplaces (HR All-In Inc), Edmonton, Alberta, Canada
**Coaches:** Bruce (active). Future hires planned.
**Methodology:** Business Building coaching for SMBs (construction & trades focus, all industries supported)
**Brand:** The Builder — heritage industrial direction
**Status:** Phase 0 — initial scaffold

The Builder is the **complete operational layer** for the Workplaces coaching business — the entire end-to-end client experience from prospect to renewal lives in this one application. It replaces every fragmented tool in the current stack: Monday.com (gone), Drive as a client-facing surface (gone), separate scheduling tools (gone), separate course platforms (gone), separate contract systems (gone). Specialist tools that earn their keep — Fireflies, TTI TriMetrix HD, Adobe Sign, Stripe, Anthropic Claude — connect via API and remain invisible to clients.

The coach side runs in **Cowork** through the Workplaces Plugin — that side is NOT in this repo. This repo is the **client-facing web application** plus the **Workplaces MCP** that bridges Cowork to this app's database.

Reference document: `Workplaces — Custom Application Architecture — v1.4 — 2026-05-02.docx` (in `docs/`). Brand reference: `Workplaces-Brand-Concepts-Linearized-2026-04-25.pdf` page 2 — Direction I, The Builder.

---

## End-to-End Workflow This App Replaces

| Stage | Today (fragmented) | The Builder (one place) |
|-------|-------------------|--------------------------|
| Prospect intake | Netlify diagnostic + email + manual Monday entry | Native diagnostic form; submission auto-creates a Prospect record |
| Proposal & contract | Drive draft + email + Adobe Sign + filed back to Drive | Generated in-app; embedded Adobe Sign signature flow; signed contract auto-stored |
| Client onboarding | New Drive folder, Monday board, intake emails | Portal access auto-provisioned; intake forms in-app; kickoff scheduled in-app |
| Document storage | Drive folder per client, shared by link | Documents uploaded to engagement; clients never see Drive |
| BBS sessions | Fireflies records, action items copied to Monday by hand | Fireflies feeds BBS Studio via API; action items auto-extracted as drafts; coach edits/assigns/publishes |
| Project work (app builds, hires, marketing) | Separate Monday board per project — clients confused which board to check | Projects module inside the same portal — every project lives in one place |
| Deliverables (the 9 types) | Templates in Drive, drafted in Word, manually shared | Generated in-app, reviewed in Deliverables module, delivered to portal |
| Communication | Email + Monday updates + Slack | One threaded module with @mentions, attachments, AI summaries |
| Hiring | TTI PDFs in Drive + interview transcripts in Fireflies + manual gap reports | Hiring Pipeline module: TTI ingestion → gap analysis → interview → assessment → offer → onboarding |
| Course delivery (LMDS / ELS) | Not delivered through any platform | Course Studio — native LMS with cohort + self-paced delivery |
| Embedded apps (Netlify projects) | Linked-out from Monday, broken context | Embedded App module — native iframe widgets pulling from Bruce's Netlify account |
| Client subscriptions & assets | Tracked nowhere; offboarding by memory | Client Assets & Subscriptions module — itemized inventory for transfer or retention |
| Renewal / offboarding | Email + Adobe Sign + manual closeout | In-app renewal flow with auto-generated proposal; clean handoff via Subscriptions module |

---

## Workplaces Methodology — Things to Know

These are not generic CRM concepts. They're first-class entities in the data model:

- **Business Building Sessions (BBS):** Twice-monthly 2-hour sessions with each client (one in-person, one virtual).
- **The 9 Deliverable Types:** SOPs/Process Flows, Org Charts, Job Profiles & Interview Guides, Financial Dashboards, Workplaces Application Onboarding Guides, Client Operations Setup Guides (tool-agnostic), Business Plans, Marketing Plans, Stages of Growth Assessments. (Monday Board Setup Guides retired.)
- **Soul File:** Long-form context document per engagement. Vector-embedded for semantic retrieval.
- **TTI TriMetrix HD assessments:** Per-person Behaviours / Driving Forces / Competencies scores. TTI Admin (their platform) stays external — assessments configured and taken there. The gap report PDF is the bridge into the new app.
- **Differential Weighting:** Behaviours 40%, Driving Forces 35%, Competencies 25%. **Internal only — never shown in the client portal.**
- **Stages of Growth framework:** Track where each client sits on the framework. Framework names visible to clients; weighting numbers and proprietary scoring are not.
- **Quality Gate:** Every deliverable must move top-line revenue, protect margin, or both. Tag entities (action items, deliverables, goals, projects) with `revenue_impact` and `margin_impact` flags.

### Methodology IP Exposure Rules (Important)

- **Visible to clients in the portal:** Framework names, educational explanations, the nine deliverable categories, the top-line / margin quality gate, the Stages of Growth framework concepts.
- **Internal to coach side only:** The 40/35/25 weighting numbers, scoring rubrics, proprietary algorithms, raw assessment scores.

---

## Subscriptions & Client Assets — Business Model

The default billing model is **Model C — Productized Retention.** Bruce maintains all client-facing infrastructure (Netlify apps, Make.com scenarios, Resend, Clerk, custom domains) under his accounts indefinitely, even after the coaching engagement ends. The client pays a smaller monthly retainer post-engagement to keep their tech operational.

Models A (transfer at end) and B (client-owned from day one) are available as **graduation paths** — when a client matures and wants to take ownership in-house, the Client Assets & Subscriptions module guides the handoff.

The architecture supports all three models. The default is C.

---

## The Stack — What to Use

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) + TypeScript | Server components by default |
| UI | Tailwind CSS + shadcn/ui | Install via CLI on demand |
| Hosting | Netlify | Already in Bruce's stack |
| Database | Neon (Serverless Postgres) | Already in stack; database branching for migrations |
| ORM | Drizzle ORM | TypeScript-first |
| Multi-tenancy | Postgres Row-Level Security (RLS) | Enforce at the database |
| Auth | Clerk | Organizations feature for multi-tenancy |
| File Storage | Netlify Blobs | Same vendor as hosting |
| Vector / Embeddings | Neon pgvector | For Soul File semantic search |
| Background Jobs | Inngest + Netlify Scheduled Functions | Replaces Zapier/Make |
| Realtime | Server-Sent Events + Postgres LISTEN/NOTIFY | No third-party realtime service |
| Email | Resend | Transactional only |
| Payments | Stripe | Subscription billing for Model C retainers |
| External: Fireflies | API integration | Transcripts → action items |
| External: Adobe Sign | Embedded for contracts | Already in Bruce's stack |
| External: TTI TriMetrix HD | Stays external; PDF gap reports uploaded | API limited |
| External: Netlify (other accounts) | Read project list via Netlify API for Embedded App module | Same credentials |
| AI | Anthropic Claude API | All Generate buttons, Soul File RAG |
| MCP Server | TypeScript MCP SDK | Workplaces MCP deployed as Netlify Function |

### Removed from earlier versions

- **QuickBooks Online integration** — dropped. Bruce works in client QBO directly when needed.
- **Google Drive (client-facing)** — dropped. Documents live in the app.
- **Monday.com** — replaced entirely.

### Versions

- Node 20 LTS (use `.nvmrc`)
- pnpm package manager
- TypeScript 5.x in strict mode

---

## Architecture Summary

### Two physical environments connected by one database

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   COWORK (Bruce + future)    │         │   THE BUILDER (Web App)      │
│   ─────────────────────────  │         │   ─────────────────────────  │
│   • Workplaces Plugin        │         │   • Next.js on Netlify       │
│   • All 11 Workplaces skills │ ◄─────► │   • Clerk auth               │
│   • Live Artifacts:          │   Neon  │   • Portal Module System     │
│     - My Work                │  (DB)   │   • Sub-user permissions     │
│     - Coach Dashboard        │         │   • Mobile-first PWA          │
│     - BBS Prep               │         │                              │
│     - Deliverables Tracker   │         │                              │
│     - Pipeline               │         │                              │
│     - Projects (cross-client)│         │                              │
│   • Workplaces MCP ─────────►│         │                              │
└──────────────────────────────┘         └──────────────────────────────┘
                ▲                                       ▲
                └───────── Same Database ──────────────┘
                         (multi-tenant via RLS)
```

### Domain Model — Core Entities

| Entity | Purpose |
|--------|---------|
| `org` | Tenant. Workplaces master org; each client a sub-org. |
| `coach` | Bruce, future hires. Owns engagements. |
| `user` | Anyone with a login. |
| `role` | Coach, Master Admin, Client Lead, Client Manager, Client Employee, Prospect. |
| `engagement` | Active relationship (Accelerator or Implementer). Owned by a Coach. |
| `bbs_session` | A 2-hour business-building session. |
| `action_item` | Owned, dated commitment. status (draft/published), assignee_user_id, created_by, confidence_flag, revenue_impact, margin_impact. |
| `goal` | SMART goal tied to top-line or margin. |
| `project` | Discrete initiative within an engagement (app build, hiring drive, marketing). name, status, lead_user_id, dates. |
| `task` | Belongs to a project. order, status, assignee, due_date, dependencies, percent_complete. |
| `milestone` | Named checkpoint within a project. |
| `soul_file` | Long-form vector-embedded context per engagement. |
| `deliverable` | One of 9 types. Lifecycle status. |
| `person_profile` | TTI assessment record per individual. |
| `hire` | Candidate moving through the hiring pipeline. |
| `course` | LMDS, ELS, future programs. Cohort + self-paced modes. |
| `cohort` | Group moving through a course together. |
| `lesson` | Individual unit within a course. |
| `enrollment` | Assigns a user to a course or cohort. |
| `form` | Diagnostic, intake, pulse, NPS. |
| `invoice` | Issued via Stripe. |
| `subscription_asset` | Per-engagement record of every external service Bruce maintains. monthly_cost, paid_by, transfer_status. |
| `embedded_app` | A Netlify project surfaced as a portal module. netlify_project_id, display_name, auth_mode. |
| `document` | Versioned files per engagement. |
| `message` | Threaded communication; @mentions, AI summaries. |
| `portal_module_assignment` | Which modules are enabled for which engagement. |

### The Portal Module System — A Configurable Canvas

The client portal is NOT a fixed layout. It's a configurable canvas of pluggable modules. Each engagement can enable any subset.

**Default module library (build these in Phase 1–3):**

1. Action Items
2. Goals
3. **Projects** (with tasks, milestones, progress views)
4. BBS Sessions
5. Soul File (read-only summary view)
6. Deliverables
7. Communication
8. Documents
9. Courses (LMS — cohort + self-paced)
10. Forms
11. Team
12. Invoices (Stripe-driven, no QBO sync)
13. Methodology Resources
14. **Embedded Apps** (Netlify projects surfaced as iframed widgets)
15. **Client Assets & Subscriptions** (inventory of services Bruce maintains)
16. Hiring Pipeline (per-engagement candidate tracking)

**Custom modules (Phase 4+):** Each engagement can have additional modules built specifically for it.

### Coach Console — Cowork Live Artifacts

| Live Artifact | Shows |
|---------------|-------|
| **My Work** | Every action item + task assigned to me across all engagements, sorted overdue → due today → this week → backlog. Filterable by client. |
| Coach Dashboard | Next BBS sessions, overdue items by client, risk flags |
| BBS Prep | Per-session: agenda draft, last session's actions, transcript highlights |
| Deliverables Tracker | Cross-client status of all 9 deliverable types |
| Pipeline | Prospect → diagnostic → proposal → contract → onboarded |
| Projects (cross-client) | All active projects, drag-to-reorder, Claude-drafted plans |
| Subscriptions Inventory | All client assets, renewal calendar, transfer-pending list |
| Hiring Pipeline (cross-client) | All active hires |

---

## Action Items — Draft / Publish Flow

When Fireflies returns a transcript:

1. Claude extracts proposed action items as **drafts** (`status: draft`, `created_by: claude`).
2. Each draft has a `confidence_flag` (high/medium/low).
3. Coach opens the draft in the Coach Console (or in Cowork via the BBS Prep Live Artifact).
4. Coach edits text, sets due date, sets assignee from a dropdown of every user attached to that engagement.
5. Coach clicks **Publish**. Status changes to `published`. Item appears in assignee's portal.
6. Assignee receives email + in-app notification.

Action items can also be created directly by a coach without a transcript — `created_by: coach`, no draft step needed.

---

## Hiring Pipeline — External + Internal Split

**External (stays in TTI Admin at ttisi.com):**
- Job profile assessment configuration
- Sending the assessment to candidates
- Candidate taking the assessment
- The gap report PDF is generated and downloaded

**In-app (Hiring Pipeline module):**
- Per-candidate record tied to the engagement
- Gap report PDF uploaded → stored on the candidate record
- Generate buttons trigger existing Workplaces skills via Claude API: gap-analysis, interview, hiring, new-employee-onboarding
- Status pipeline: Assessing → Interview Scheduled → Decision Pending → Offer Sent → Hired
- Client Lead sees pipeline status, reviews artifacts, sees offers

---

## Embedded Apps Module — Netlify-Backed Widgets

The Builder connects to Bruce's Netlify account via the Netlify API. When configuring an engagement, the coach picks a Netlify project from a dropdown, names it for that client, configures auth mode, and the app appears as a module in that client's portal.

**Auth modes:**
- `public` — embedded app is publicly accessible
- `token_passthrough` — Builder generates a signed token; embedded app validates it
- `clerk_sso` — embedded app uses Clerk; SSO works automatically

Phase 3 supports `public` and `token_passthrough`.

---

## Conventions

### Code Conventions

- **TypeScript strict mode** — no `any` without comment justification
- **Server Components first** — `"use client"` only where interactivity demands it
- **Server Actions for mutations** — no separate API routes for forms unless required
- **Drizzle for all DB access** — no raw SQL except in migrations or RLS policies
- **Zod for all input validation** at the server boundary
- **shadcn/ui for components** — install via CLI, customize after
- **lucide-react for icons** — never SVG one-offs
- **date-fns for dates** — never moment.js or dayjs

### File Structure

```
/app
  /(public)
    /diagnostic               Public diagnostic intake
  /(auth)                     Clerk auth pages
  /(portal)                   Authenticated client portal
    /[engagementSlug]
      /modules/[moduleId]
  /api
/lib
  /db
    schema.ts
    queries/
    migrations/
  /modules                    Portal module registry
    /action-items
    /projects
    /communication
    /documents
    /embedded-apps
    /client-assets
    /hiring-pipeline
    ...
  /skills                     Server-side wrappers around Anthropic skill calls
  /mcp                        Workplaces MCP server code
/components
  /ui                         shadcn/ui
  /portal
/public
.env.example
netlify.toml
drizzle.config.ts
```

### Naming

- **Files:** kebab-case
- **Components:** PascalCase exports
- **DB tables:** snake_case, plural
- **DB columns:** snake_case
- **TypeScript types:** PascalCase
- **Constants:** SCREAMING_SNAKE_CASE
- **Env vars:** SCREAMING_SNAKE_CASE with provider prefix

### Multi-Tenancy

**Every tenant-scoped table MUST have:**
- An `org_id` column referencing `org.id`
- An RLS policy enforcing `org_id` matches `auth.org_id()` (function reading from Clerk JWT)
- Indexes including `org_id` first

**Test every query** against a different org's data to confirm RLS bites. Failure mode is silent and catastrophic.

---

## Brand & UI — The Builder

**Brand selected: The Builder.** Heritage industrial direction. Tagline: "Build what compounds." Formal attribution where shown: *The Builder · By Workplaces*.

**Application naming convention:**
- Customer-facing brand: **The Builder**
- Internal / formal: **The Builder · By Workplaces**
- Repo / folder name: `workplaces-app` (unchanged for continuity; rename later only if needed)

**Colour palette** (use these exact hex values; do not introduce variants):

| Role | Name | Hex | Usage |
|------|------|------|-------|
| Primary ink | Foreman Black | `#1A1A1A` | Body text, primary buttons, headings |
| Background | Drafting Cream | `#F5F1E8` | Page background, cards |
| Structure | Steel Blue | `#2E4057` | Secondary buttons, links, structural accents |
| Accent (sparingly) | Safety Vest Orange | `#E87722` | Status flags, single CTAs, never as background |
| Neutral grey (text) | — | `#666666` | Secondary labels, captions |
| Neutral grey (rule) | — | `#CCCCCC` | Borders, dividers |

Use Steel Blue for the primary brand colour in components like login buttons, tabs, and active states. Reserve Safety Vest Orange for high-attention moments only — overdue indicators, single primary CTAs, never decorative. Drafting Cream is the canvas; Foreman Black is the ink. The whole thing should feel like a master ledger printed on rough cream stock.

**Typography:**

| Use | Typeface | Notes |
|-----|----------|-------|
| Display headings | **Big Shoulders Display** (Bold) | Condensed, factory-sign energy. Use for page titles, hero areas, stat callouts. `@fontsource/big-shoulders-display`. |
| Body / UI | **Work Sans** (Regular, Bold) | Workhorse sans. All paragraph text, form labels, navigation. `@fontsource/work-sans`. |
| Editorial accents | Optional: Instrument Serif (Italic) | Use sparingly for quote callouts. |
| Mono (code, IDs) | IBM Plex Mono | Technical labels. `@fontsource/ibm-plex-mono`. |

Set a Tailwind theme extension: `font-display` for Big Shoulders, `font-sans` for Work Sans, `font-mono` for IBM Plex Mono. Body text default 16px. Display headings start at 28px and scale up.

**Logo mark:** A geometric "B" formed by architectural beam-and-column intersections, with a small Safety Vest Orange dot in the bottom-right corner as the accent. Reference: page 2 of the Brand Identity Concepts PDF in `docs/`. SVG version to be produced before Phase 1 ships — use a wordmark-only treatment ("THE BUILDER" set in Big Shoulders Bold) as a temporary placeholder during Phase 0.

**Mobile-first responsive design.** PWA from day one — `manifest.json`, service worker for offline-friendly action item viewing. Manifest values:
- `name`: "The Builder"
- `short_name`: "Builder"
- `theme_color`: `#1A1A1A`
- `background_color`: `#F5F1E8`

---

## How to Work With Bruce

Bruce is not a developer. He's a coach building this with AI assistance. He's smart about systems and product but doesn't read code fluently.

### Communication

- **Always confirm structural decisions before executing them.** Especially: schema changes, new dependencies, deployment changes, anything that touches multi-tenancy.
- **Ask clarifying questions when underspecified.** Bruce prefers being asked over having to fix wrong assumptions later.
- **Explain the "why" not just the "what"** in plain language.
- **No jargon dumps.**

### Quality Gate

Every feature must answer: does this move top-line revenue, protect margin, or both? If neither, flag it before building.

### Scheduling Constraint

Bruce's working hours are Monday–Friday, 8:30 AM–6:00 PM Mountain Time. Do not generate emails, notifications, or scheduled tasks that fire outside that window unless explicitly requested.

---

## What was built in Phase 0

Tagged `v0.1.0` on 2026-05-02. Live at <https://workplaces-the-builder.netlify.app>.

Foundation scaffold proving every layer end-to-end: Next.js 14 + Neon Postgres 17 + Clerk auth + Netlify deploy. Brand locked to The Builder. Multi-tenancy via Postgres RLS + dual-role pattern (`neondb_owner` for DDL, `workplaces_app` for runtime queries). Three tenant helpers in `lib/db/tenant.ts` — `withTenantContext`, `withBootstrapContext`, `withSystemContext` — make the right RLS pattern the easy pattern. Verified by `scripts/verify-rls.mjs` (14 assertions across two synthetic tenants).

Phase 0 used `clerk_org_id = clerk_user_id` as a placeholder while Clerk's Organizations feature was disabled — retired during the 1.1 cutover.

---

## What was built in Sub-Phase 1.1

Tagged `v0.2.0` on 2026-05-03.

**Schema additions** (`lib/db/migrations/0003_phase_1_1_tables.sql`): `action_items`, `messages` (contextual conversations via `parent_entity_type` + `parent_entity_id`), `documents`, `document_tags`, `notifications`. Plus `engagements.started_at` (timestamptz nullable) for the operational-vs-record distinction. RLS + `set_updated_at` triggers on all new tenant-scoped tables; same pattern as 0001/0000.

**Real Clerk Organizations.** Personal-org placeholder retired. `provisioning.ts` rewritten to read the active Clerk Org from `auth()`, look up our `orgs` row by `clerk_org_id`, and provision a `user_profiles` row with role read from `OrganizationMembership.publicMetadata.app_role`. Sign-ups without an active org bounce to `/no-invitation`. Bruce's existing master org migrated via `scripts/migrate-real-clerk-orgs.mjs` to a real Clerk Org `org_3DE6hCoL4MJtDAxa5JCq20KxzgT` named "Workplaces".

**Coach Console + engagement creation.** `/coach` routes added with role gate (`master_admin` only) in `app/coach/layout.tsx`. The form at `/coach/engagements/new` collects name, type, client lead full name + email, start date; the server action creates a Clerk Organization, inserts `orgs` + `engagements` rows, sends the Clerk invitation with `app_role: client_lead` in `publicMetadata`, then removes Bruce as auto-admin. Order matters — invitation must precede admin removal because Clerk requires `inviterUserId` to be an active admin. See `docs/decisions.md` for the ordering bug we hit and fixed.

**Clerk dashboard config:** Organizations enabled, `Membership required` ON (every session must have an active org). New runtime dep: `@clerk/backend` (was transitive via `@clerk/nextjs`; promoted to direct so `.mjs` scripts can import it).

**Acceptance gap, documented:** the live receive-side test (invitee accepts the invitation, signs up, lands as `client_lead`) is blocked by the same single-phone constraint as Phase 0 Step 5. Sending side fully verified via Clerk Backend API listing pending invitations with correct shape; receive-side trusted via code review. Real exercise happens in Phase 1.7 with the actual Impactica client lead.

---

## What was built in Sub-Phase 1.2

Tagged `v0.3.0` on 2026-05-03.

**Schema:** migration `0004_action_items_title.sql` added `title text NOT NULL` to `action_items` and dropped `NOT NULL` on `description` (which becomes the optional markdown body). Zero rows in the table at migration time, so no backfill required.

**Server actions** (`lib/actions/action-items.ts`): `createActionItem`, `updateActionItem`, `deleteActionItem`. All Zod-validated, all wrapped in `withTenantContext`. Role-based authz: `master_admin` / `coach` / `client_lead` get full edit; `client_manager` / `client_employee` are restricted to status updates on items assigned to them. Delete is hard delete (soft-delete deferred). Notifications fan out on assignment when `assignee !== creator`.

**Read queries** (`lib/db/queries/`): `action-items.ts` (`listEngagementActionItems` + `listCoachActionItems` + `getActionItem`), `engagements.ts` (`getCurrentEngagement` + `listCoachEngagements`), `user-profiles.ts` (`listEngagementMembers`), `notifications.ts` (`getUnreadNotificationCount` + `listNotifications`). Coach-side cross-engagement reads use `withSystemContext` because items live in client orgs but the coach session is in the master org.

**Portal layout shell** (`app/portal/layout.tsx`): module-per-route pattern locked in. New routes: `/portal/action-items`, `/portal/action-items/new`, `/portal/action-items/[id]`, `/portal/notifications`. Shared `PortalNav` with brand wordmark, Action items link, notification bell with unread badge, sign out. EngagementSlug-scoped routing deferred to Phase 2+ when users span engagements.

**Coach view** (`/coach/action-items` + sub-routes): cross-engagement list with engagement labels on each card. New form has an engagement picker (`CoachNewActionItemForm`) that recomputes the default assignee when engagement switches.

**Action item card UX:** mobile-first card list with overdue items pinned at top in Safety Vest Orange treatment, then due-date ascending, no-due-date items at bottom. Status pill click = inline native dropdown for fast updates; full card click = edit page. Filter chips above the list with status counts; "Draft" chip visible to coach roles only.

**In-app notifications:** `notification_type='action_item_assigned'` rows created on assign/reassign with `sent_via='in_app'`. `MarkAllReadOnMount` clears the unread count when the notifications page is visited (per-item read tracking is Phase 2). Email triggers wait for Phase 1.4 + Resend.

**Test setup script:** `scripts/setup-bruce-test-engagement.mjs` (idempotent) creates a "Bruce Test" engagement directly in the master org so the manual test scenario has somewhere to write items into. The engagement form at `/coach/engagements/new` would have created a fresh client Clerk Org, which we don't want for solo-coach testing.

---

## What was built in Sub-Phase 1.3

Tagged `v0.4.0` on 2026-05-09. No schema migration required — Sub-Phase 1.3 sits entirely on top of the `messages` table introduced in 1.1.

**Audience model — Leadership / Team / Action item.** Per Bruce's 2026-05-09 direction, threads carry role-based audience compartmentalization from day one so private leadership conversations stay private the moment a client invites managers or employees. Three thread types, all stored in the existing text column `messages.parent_entity_type`:

- `engagement_leadership` — visible to `master_admin` / `coach` / `client_lead` / `client_manager` only. Hidden from `client_employee`.
- `engagement_team` — visible to everyone in the engagement.
- `action_item` — visible to everyone in the engagement (per-item audience flag deferred to Phase 2 once team members are routine).

The audience rules live in `lib/communication/audience.ts` — `canViewThread` and `canPostInThread` are the single source of truth, used by queries (filters), server actions (gates), and pages (tab visibility).

**Server actions** (`lib/actions/messages.ts`): `createMessage`, `updateMessage`, `deleteMessage`. Zod-validated, `withTenantContext`-wrapped. Edit is author-only; delete allowed for the author OR a leadership role (moderation). Action item parent-entity sanity-checks the engagement match. Engagement-level threads enforce `parent_entity_id === engagement_id`.

**Soft-delete tombstone (WhatsApp-style).** Per Bruce's call: deleted messages stay in the thread as `[Message deleted]` so the conversation flow stays readable. Implemented as a sentinel string `TOMBSTONE_BODY` in `lib/communication/tombstone.ts` (split out of the actions file because Next.js requires every `"use server"` export to be an async function — same constraint the HR app hit). Renderer keys off the sentinel; tombstoned rows hide edit/delete actions.

**Markdown rendering** (`components/markdown/MarkdownBody.tsx`): GitHub-flavored markdown via `remark-gfm`, sanitized via `rehype-sanitize` against the default safe schema (XSS guard on multi-tenant UGC). Used for message bodies AND action item description previews on cards (per the Phase-1-Plan.md "same renderer" note).

**Read queries** (`lib/db/queries/messages.ts`): `listMessagesForEntity` for a single thread (audience-checked at the boundary), `listEngagementRecentActivity` for the cross-thread feed (filtered to the caller's audience-allowed thread types). The Recent Activity query joins onto `action_items` for parent titles.

**Communication pages.**
- `/portal/communication` — Recent Activity section + Leadership / Team tabs. Tab is selected via `?tab=` query string; `?tab=leadership` falls back to the Team tab if the viewer can't see Leadership.
- `/coach/communication/[engagementId]` — same shape, but the engagement is selected from the URL with a "Switch engagement" dropdown for coaches.

**Per-entity threads on action items.** Both `/portal/action-items/[id]` and `/coach/action-items/[id]` now render a "Discussion" section below the edit form with a `MessageThread` for `(threadType=action_item, parentEntityId=actionItem.id)`.

**Inline edit + delete UI** (`components/communication/MessageActions.tsx`): hover-revealed icons, native browser `confirm()` for delete, inline drawer textarea for edit with Save/Cancel. ⌘/Ctrl + Enter sends from the composer; plain Enter inserts a newline.

**PortalNav update:** added "Communication" link (desktop + mobile rows).

**New deps:** `react-markdown` ^10, `remark-gfm` ^4, `rehype-sanitize` ^6. Total ~80kb gzipped on message-rendering pages. No other deps added.

**Test setup.** Phase 1.3 reuses the `setup-bruce-test-engagement.mjs` script from 1.2 — Bruce's master org has a "Bruce Test" engagement that holds his test threads.

**Stale duplicate CLAUDE.md removed.** `docs/CLAUDE.md` had drifted (still said Active Phase 0); root `CLAUDE.md` is canonical.

**Coach cross-org gap continues** (same as 1.2). `withTenantContext(profile.orgId)` binds to the master org when Bruce posts; Phase 1.3 testing lives entirely in the master org's Bruce Test engagement, so the gap doesn't bite. Phase 1.7 introduces the coach-aware tenant helper.

**Acceptance:** Bruce posts a message on an action item — it appears in the action item detail view AND in the engagement's Recent Activity feed. Same for the Leadership and Team threads. Live receive-side test (a real client_lead viewing the leadership thread audience boundary in their browser) is blocked by the same single-phone Clerk constraint as Phase 0/1.1; verified via code review and the build's static analysis. Real exercise happens in Phase 1.7 with Impactica.

---

## What was built in Sub-Phase 1.3.5

Tagged `v0.5.0` on 2026-05-09.

**Schema:** migration `0005_message_reactions.sql` adds the `message_reactions` table — composite PK (`message_id`, `user_profile_id`, `emoji`), denormalized `org_id` for RLS efficiency (same pattern as `document_tags`), three indexes, the shared `set_updated_at` trigger, and the same RLS policy shape as every other tenant-scoped table (`org_id = auth.org_id()`).

**Rich text composer.** `components/communication/RichTextEditor.tsx` wraps Tiptap (StarterKit minus heading + horizontal rule, plus Link, Placeholder, and `tiptap-markdown`). Output is Markdown so the existing `MarkdownBody` renderer keeps working unchanged — every message read path stays backwards-compatible with bodies typed under 1.3's plain-textarea regime. Toolbar exposes bold / italic / strike / inline code / bulleted list / numbered list / blockquote / link. Cmd/Ctrl+Enter submits, plain Enter inserts a paragraph break.

**Emoji picker.** `components/communication/EmojiPickerButton.tsx` lazy-loads `emoji-picker-react` via `next/dynamic` so the ~250kb bundle doesn't block initial render. Used in two places: the composer toolbar (insertion at cursor via the editor's imperative handle) and the reaction "more" menu.

**Reactions.** `lib/actions/message-reactions.ts` exports `toggleReaction`, idempotent (insert-or-delete on the composite key) and audience-checked via `canViewThread`. `lib/db/queries/message-reactions.ts` exports `listReactionsForMessages` — single batched query that joins reactor names and groups by `(messageId, emoji)` for the chip row's hover tooltips. `components/communication/MessageReactionBar.tsx` renders pill chips below each non-tombstoned message; hover-revealed dashed "react" trigger opens a quick-pick row (👍 ❤️ 😂 🎉 👀 ✅) with an "other" fallthrough to the full picker. Optimistic toggle: chip state flips locally before the server settles; failure reverts with an inline error.

**Composer + edit drawer wiring.** `MessageComposer.tsx` and `MessageRow.tsx`'s inline edit drawer both swap their plain `<textarea>` for `RichTextEditor`. `MessageThread.tsx` now also fetches reactions in a single batched query and passes them down through `MessageList` → `MessageRow`.

**New deps:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `tiptap-markdown`, `emoji-picker-react`. Communication-page bundle grew to 388kB First Load (was ~130kB before 1.3.5); the heavy chunks (Tiptap + the emoji bundle) are lazy-split where possible.

**a11y note.** Quick-pick reaction buttons inside the popover use `role="menuitemcheckbox"` + `aria-checked` rather than `aria-pressed` (the latter is unsupported on `menuitem`). Caught by `next lint`'s `jsx-a11y/role-supports-aria-props` rule.

**Acceptance:** Bruce can format messages with toolbar buttons, drop in an emoji from the picker, and react to messages with thumbs/heart/etc. Reactions persist and surface to every viewer inside the thread's audience. Live receive-side test still blocked by the same single-phone Clerk constraint as Phase 0/1.1/1.3 — verified via `pnpm typecheck` + `pnpm build` (15 routes compile clean) and code review.

---

## What was built in Sub-Phase 1.4

Tagged `v0.6.0` on 2026-05-09. First sub-phase to actually send email.

**`@mention` typeahead in the composer.** Tiptap's `Mention` + `Suggestion` extensions wired into `RichTextEditor.tsx`. Typing `@` opens a popover of engagement members (rendered via `MentionList.tsx`, positioned by Tippy.js). Arrow keys navigate, Enter / Tab confirm, Escape cancels. The mention is stored as a Tiptap node with the user_profile UUID; on submit, the editor's `getMentionIds()` walks the doc and collects them. Markdown serialization (via `tiptap-markdown`) reads `renderText` to produce plain `@Label` in the body — readable to anyone, even pre-1.4 viewers.

**Server-side mention validation.** `createMessage` now accepts a `mentions: string[]` field, validates each id is a real `user_profile` AND that user can view the thread (`canViewThread` from 1.3). Self-mentions are dropped. The validated id list is stored in `messages.mentions` (JSONB column already shaped from 1.1) and used to fan out one `notification_type='mention'` row per recipient.

**Resend client wrapper** (`lib/email/send.ts`). Lazy-initialized, env-driven. Sender pinned to `RESEND_FROM_EMAIL` (`The Builder <notifications@4workplaces.com>` against the verified `4workplaces.com` domain). Two helpers: `sendEmail` (returns a discriminated result so callers can decide) and `sendEmailQuietly` (best-effort fire-and-forget for inside server actions, where a send failure shouldn't roll back the message write). The `outside_working_hours` branch returns `nextSendAt` so a future queue can pick up where the live send left off.

**Working-hours guard.** `isWithinWorkingHours()` checks the current moment against Mon–Fri 08:30–18:00 in `America/Edmonton` (DST-aware via Luxon). `nextValidWorkingMoment()` returns the next moment the window opens. CLAUDE.md scheduling constraint now enforced in code rather than convention. The cron endpoint can `bypassWorkingHours` for manual operator runs.

**Three email templates** (`lib/email/templates.ts`): `mentionEmail`, `actionItemAssignedEmail`, `actionItemDueSoonEmail`. Plain HTML strings (no template engine) plus matching plain-text fallbacks. Heritage-industrial brand: Drafting Cream background, Foreman Black ink, Steel Blue button. Safety Vest Orange used as the heading rule on the due-soon template only — single-accent rule from CLAUDE.md.

**Action-item assignment now emails too.** `createActionItem` and `updateActionItem` (the reassignment path) load the assignee's email + name in the same transaction, then call `sendEmailQuietly(actionItemAssignedEmail(…))` after the commit. In-app notification rows still fire as before.

**Daily due-soon nudge.** `app/api/cron/email-due-soon/route.ts` is a Bearer-`CRON_SECRET`-guarded GET that scans `action_items` for rows due in (now, now+30h] with status not done/draft and an assignee, that haven't already been nudged (existence check on `notifications` of type `action_item_due_soon`). Idempotent — re-runs send no duplicate mail. Cross-tenant scan via `withSystemContext`.

**Schedule wiring.** `netlify/functions/email-due-soon.mts` is a Netlify Scheduled Function on `0 16 * * 1-5` — 16:00 UTC, Mon–Fri, which lands at 09:00 MST or 10:00 MDT (both inside Bruce's window year-round, no DST math). It self-fetches the cron route with the bearer header. `netlify.toml` got a `[functions]` block pointing at `netlify/functions` with `esbuild` as the bundler.

**Env vars added in 1.4:**
- `RESEND_API_KEY` — Resend API key.
- `RESEND_FROM_EMAIL` — `The Builder <notifications@4workplaces.com>`.
- `NEXT_PUBLIC_APP_URL` — for the absolute link in email templates.
- `CRON_SECRET` — bearer secret for `/api/cron/*`.

**Acceptance:** Composer typeahead shows up on `@`; selecting a member sends them an email + in-app notification. Action item assignment emails the assignee. Due-soon route, when triggered, emails everyone with an item due in the next 30h and writes the matching notification rows. Real receive-side test still gated on Phase 1.7 (single-phone Clerk constraint); verified via `pnpm typecheck` + `pnpm build` (16 routes compile clean) and code review of the audience checks.

**Production setup outside this repo** (Bruce, when ready):
1. Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` to the Netlify dashboard's environment variables. The values match `.env.local`.
2. Deploy. The Netlify Scheduled Function appears under Site → Functions → Scheduled. First run will be the next 16:00 UTC weekday after the deploy.

**Coach cross-org gap continues** (same as 1.2/1.3). When Bruce posts a mention from inside a CLIENT engagement, the GUC binds to the master org and the recipient lookup wouldn't find their user_profiles row. Phase 1.7 introduces the coach-aware tenant helper. Today's testing scope (master-org "Bruce Test" engagement) doesn't bite.

---

## What was built in Sub-Phase 1.5

Tagged `v0.7.0` on 2026-05-09.

**Schema:** migration `0006_message_attachments.sql` adds the `message_attachments(message_id, document_id, org_id)` join table — composite PK prevents duplicate attaches, RLS policy mirrors every other tenant-scoped table (`org_id = auth.org_id()`), three indexes, the shared `set_updated_at` trigger. The `documents` and `document_tags` tables were already shaped from Phase 1.1.

**Storage backend.** `lib/storage/blobs.ts` wraps `@netlify/blobs` with three operations: `uploadDocumentBlob`, `downloadDocumentBlob`, `deleteDocumentBlob`. Storage key shape: `<orgId>/<documentId>/<sanitizedFilename>` — defence-in-depth against any future RLS-skip bug (two orgs cannot collide on the same key). 25 MB cap on individual files; rejected at the wrapper. Local dev requires either `netlify dev` or explicit `NETLIFY_BLOBS_SITE_ID` + `NETLIFY_BLOBS_TOKEN` env vars; plain `pnpm dev` will throw a clear error from `getStore`.

**Server actions** (`lib/actions/documents.ts`):
- `uploadDocument(formData)` accepts `engagementId`, `file`, optional `tags`, writes the blob, inserts the `documents` row, populates `document_tags`. Cleans up the orphan blob if the DB write fails.
- `deleteDocument(id)` — uploader-or-leadership-only. Deletes row first, then the blob; orphan-blob risk is non-fatal (logged, sweepable later).
- `setDocumentTags(documentId, tags)` — whole-list replace. Cleaner than partial diff and matches how the chip-row UI presents tags.
- `abandonDocument(id)` — uploader-only delete used by the composer paperclip when a draft attachment is removed before the message sends. Silent no-op if the caller isn't the uploader.
- `verifyAttachments(engagementId, documentIds)` — boundary check; not currently wired but available for future compose-page flows.

**Read queries** (`lib/db/queries/documents.ts`):
- `listEngagementDocuments(engagementId)` — joins uploader name, batch-loads tags into a single follow-up query.
- `getDocument(id)` — single doc with tags. Used by the download route before streaming bytes.
- `listAttachmentsForMessages(messageIds)` — batched, returns a `Map<messageId, AttachedDocument[]>` mirroring the Phase 1.3.5 `listReactionsForMessages` shape so `MessageThread` can fan out three batched reads (reactions + attachments + members) in `Promise.all`.

**Download route.** `/api/documents/[id]/download` (Node runtime, force-dynamic) RLS-checks the document via `getDocument` (which goes through `withTenantContext`), pulls the bytes from Blobs, and streams back with `Content-Disposition: attachment` plus the original filename. No public Blob URLs — every download passes through the auth boundary.

**Pages.**
- `/portal/documents` — header, upload form, document list. List rows show file icon, filename (clickable link to download route), size, uploader, date, tag chips, edit-tags inline drawer, and a delete button (visible only when the viewer is the uploader OR a leadership role).
- `/coach/documents/[engagementId]` — same shape with the per-engagement chooser the coach communication page uses.
- PortalNav got a "Documents" link in both the desktop and mobile rows.

**Composer paperclip + attachment chips.** `ComposerAttachmentPicker.tsx` adds a paperclip button beside the existing toolbar. Clicking it opens a multi-select file picker; each picked file uploads immediately to the documents store via `uploadDocument` (so it also shows up on the engagement's Documents page). While in flight, a chip with a spinner renders; on success, the chip becomes removable. Clicking the X on a chip calls `abandonDocument` to purge the blob — keeps storage clean if the user changes their mind. Submit is blocked while any upload is in flight. After submit, the validated attachment ids are linked via `message_attachments` rows.

**Existing-message chips** (`MessageAttachmentChips.tsx`) render below each message body — server component, plain anchor tags pointing at the download route. No client state, no extra JS.

**Cross-cutting wiring.** `createMessage` schema gained an `attachments: string[]` field. Server validates that each attached document id belongs to the same engagement as the message (RLS-scoped via `withTenantContext`), then inserts one `message_attachments` row per valid id. Tampered clients can't cross-link documents from other engagements.

**New deps:** `@netlify/blobs@^9`. No other.

**Acceptance:** Bruce uploads a PDF to the Documents page; the file appears in the engagement's list with tags and download link. Bruce attaches files in the composer; the recipient sees attachment chips and clicking one downloads the file. Files attached via the composer are also accessible from the Documents page (single source of truth — same `documents` row).

**Local dev caveat.** Document uploads require either `netlify dev` (Netlify CLI managing local Blob credentials) or explicit `NETLIFY_BLOBS_SITE_ID` + `NETLIFY_BLOBS_TOKEN` env vars in `.env.local`. Documented in `.env.example`. Plain `pnpm dev` runs every other module fine; trying to upload a document throws a clear "configure Netlify Blobs" error rather than silently corrupting state.

**Production setup outside this repo** (Bruce, when ready):
1. Confirm Netlify Blobs is enabled on the site (typically auto-on for Pro and above; verify under Site → Configuration → Blobs).
2. Production deploy auto-detects credentials — no extra env vars needed beyond the four from 1.4.

---

## What was built in Sub-Phase 1.6

Tagged `v0.8.0` on 2026-05-09.

**Schema:** migration `0007_bbs_sessions.sql` adds:
- New table `bbs_sessions(id, org_id, engagement_id, scheduled_at, type, status, notes, fireflies_recording_id, created_by_user_profile_id, ...)`. RLS, indexes on (org, engagement, scheduled_at, status), `set_updated_at` trigger.
- New enums `bbs_session_type` (in_person | virtual) and `bbs_session_status` (scheduled | completed | cancelled).
- `action_items.bbs_session_id uuid` FK with `ON DELETE SET NULL` so deleting a session preserves any items extracted from it. Index added.

**Server actions** (`lib/actions/bbs-sessions.ts`): `scheduleSession`, `updateSession` (time / type / notes / fireflies recording id, partial), `completeSession`, `cancelSession`, `reopenSession`, `deleteSession`. All leadership-only (`master_admin` / `coach` / `client_lead` / `client_manager`); `client_employee` and `prospect` can VIEW but not write.

**Read queries** (`lib/db/queries/bbs-sessions.ts`):
- `listEngagementSessions` returns `{ upcoming, past }` based on `scheduledAt` vs now.
- `getSession`, `getNextSession` (next upcoming with status=scheduled, used later for dashboard widgets).
- `listSessionActionItems` returns the action items linked via `bbs_session_id`.

**Mountain Time, end to end.** `components/sessions/utils.ts` formats every visible timestamp in `America/Edmonton` via Luxon (DST-aware). The `<input type="datetime-local">` value is interpreted as MT, converted to a UTC ISO string client-side via `fromDateTimeLocalValue`, and submitted to the server. The server stores UTC; reads project back into MT for display. CLAUDE.md scheduling constraint applied at the visible-time layer; the working-hours guard from 1.4 already covers the email layer.

**Pages:**
- `/portal/sessions` — schedule form (leadership only) + upcoming/past list.
- `/portal/sessions/[id]` — detail with inline edit drawers for time/format and notes, status flip buttons (Mark complete / Re-open / Cancel session), delete, and a list of any action items linked to this session.
- `/coach/sessions/[engagementId]` and `/coach/sessions/[engagementId]/[sessionId]` — same shape, per-engagement chooser like the other coach modules.

**SessionList** (`components/sessions/SessionList.tsx`) is a server component, renders two sections (Upcoming, Past) with status pills. Overdue scheduled sessions render with the Safety Vest Orange accent rule from CLAUDE.md (single-accent rule reserved for high-attention moments). Completed gets Steel Blue. Cancelled is greyed-out and strikethrough.

**SessionDetail** (`components/sessions/SessionDetail.tsx`) is the client component handling status flips, edit drawers, and notes editing. Notes use a plain textarea + the existing `MarkdownBody` renderer for the rendered view — Tiptap deferred for sessions until there's a clear ask (composer-quality formatting in long-form notes is overkill for the current pilot scope).

**PortalNav** got a "Sessions" link in both desktop and mobile rows, sandwiched between Action items and Communication.

**Acceptance:** Bruce schedules a session for next Tuesday 9 AM MT, comes back later, edits the notes, marks it complete after the meeting, and any action items captured during the session can be linked back via `action_items.bbs_session_id` (linkage UI in the action item edit form deferred to Phase 1.7+ when Fireflies auto-extract lands).

**Out of scope for 1.6 (deferred):**
- **Recurring schedules** — twice-monthly auto-create. Bruce will manually schedule for now; the rhythm is two-touch per month per client which is small.
- **Fireflies API auto-extract** — paste a recording id into the field today; the extract pipeline that pulls transcript → action item drafts is Phase 1.7+.
- **Attendee tracking** — who actually came. Defer until team members are routine on engagements.
- **BBS Prep Live Artifact** in Cowork — that's a coach-side surface, not part of this repo.

---

## What was built in Sub-Phase 1.7

Tagged `v0.9.0` on 2026-05-09.

**Schema:** migration `0008_soul_files.sql` adds `soul_files(id, org_id, engagement_id UNIQUE, body, last_editor_user_profile_id, ...)`. RLS, indexes, `set_updated_at` trigger. UNIQUE on `engagement_id` enforces "one Soul File per engagement"; if Phase 2+ wants per-topic Soul Files, drop the constraint then.

**Vector embeddings deferred.** CLAUDE.md flags pgvector + RAG semantic retrieval for Soul Files. For 1.7 we ship body-only; embeddings come in Phase 2 once enough Soul Files exist to make cross-doc semantic search worthwhile. No premature schema cost.

**Server action** (`lib/actions/soul-files.ts`): `upsertSoulFileBody(engagementId, body)` — creates the row on first save, updates thereafter. Leadership-only (`master_admin` / `coach` / `client_lead` / `client_manager`); `client_employee` can VIEW.

**Read query** (`lib/db/queries/soul-files.ts`): `getSoulFileForEngagement` returns body + last editor's name + updatedAt.

**`SoulFileEditor.tsx`** is a client component — renders a starter template ("Why this engagement exists / Where it's at today / Where it wants to be in 12 months / Strategic backdrop / Founders / Hard-won learnings") if the body's empty. Read-only state uses the existing `MarkdownBody`. Edit mode swaps in a tall monospace textarea — Soul Files run long; markdown-fluent writers don't need a toolbar.

**Pages:** `/portal/soul-file` and `/coach/soul-file/[engagementId]`. PortalNav got a Soul File link.

**Acceptance:** Bruce opens the Soul File for an engagement, hits Start writing, drops in the deep context, saves. Re-opens the page later, sees the rendered markdown plus a "Last edited by … on …" footer. `client_employee` sees the same content read-only with no edit button.

---

## What was built in Sub-Phase 1.8

Tagged `v0.10.0` on 2026-05-09.

**`/portal` is now a real "Today" dashboard.** Was a thin welcome card; now a five-card grid covering everything Phase 1 ships:

- **Next session** — date/time/format pulled via `getNextSession`, with the notes preview. Empty state if nothing scheduled.
- **Your open items** — action items assigned to the viewer, not done, sorted overdue-first. Up to 5. Each links to its detail page.
- **Latest activity** — last 5 messages from threads the viewer can audience-see. Renders author + parent + flattened excerpt.
- **Soul File** — preview of the body's first lines, last-editor footer.
- **Recent documents** — three most recent uploads, click to download.

All five run as one `Promise.all` in the page handler — five batched round-trips overlap rather than chain. First-load JS for `/portal` went from ~96 kB to ~97 kB; render is server-side rendered in one pass.

**Greeting** ("Good morning / afternoon / evening") and first-name address. Brand palette intact (Drafting Cream cards, Foreman Black ink, Steel Blue links).

**Acceptance:** Land on https://workplaces-the-builder.netlify.app/portal (or http://localhost:3000/portal in dev). See the five cards populated with real data from your engagement. Each card links into its full module page.

---

## What was built in Sub-Phase 1.9

Tagged `v0.10.0` on 2026-05-09 (same tag as 1.8 — 1.9 is a runbook, not new code).

**Live Impactica handoff runbook** added below in the Operations section.

---

## What was built in Sub-Phases 1.10–1.20

Tagged across `v0.11.0` through `v0.16.0` on 2026-05-09. Phase 1 is feature-complete — every default module from CLAUDE.md ships, plus the coach cross-org fix and the Workplaces MCP bridge.

| Tag | Sub-phases | Modules |
| --- | --- | --- |
| v0.11.0 | 1.10 / 1.11 / 1.12 | Goals, Team, Methodology Resources |
| v0.12.0 | 1.13 | Coach cross-org tenant helper (`withEngagementContext`) |
| v0.13.0 | 1.14 | Projects + tasks |
| v0.14.0 | 1.15 | Hiring Pipeline |
| v0.15.0 | 1.16 / 1.17 / 1.18 / 1.19 | Forms, Deliverables, Invoices, Subscriptions, Embedded Apps, Courses |
| v0.16.0 | 1.20 | Workplaces MCP server |

**Schema:** five new migrations (0009–0013) added 14 new tables across the modules. Every tenant-scoped table follows the same pattern — `org_id` denormalized for RLS, `set_updated_at` trigger, `org_id = auth.org_id()` policy.

**Coach cross-org fix.** `withEngagementContext(callerOrgId, callerRole, engagementId, fn)` resolves the engagement's owning org and binds the GUC to that — coach roles can read/write in any client engagement they own. Client roles are still gated to their home org. `resolveEngagementIdFromRecord` looks up the parent engagement for any record id, including nested ones (tasks → projects, lessons → courses, message_reactions → messages, form_submissions → forms). All server actions and read queries refactored to use it.

**Workplaces MCP.** `app/api/mcp/route.ts` exposes a JSON-RPC HTTP endpoint. Bearer auth: `Bearer <MCP_BEARER_TOKEN>:<clerk_user_id>`. The Workplaces Plugin in Cowork holds the secret, pairs it with the calling coach's Clerk id, and the route resolves it back to a `user_profiles.id` to scope tool results. Read-only tools shipped: `list_engagements`, `list_my_work`, `list_upcoming_sessions`, `list_hiring_pipeline`, `list_projects`, `list_subscription_inventory`, `get_bbs_prep`, `list_recent_activity`. Writes are Phase 2.

**New env vars (Phase 1.10–1.20):**
- `MCP_BEARER_TOKEN` — secret guarding `/api/mcp` for the Workplaces Plugin in Cowork.

**Acceptance:** every page in `/portal/*` and the cross-org coach flows compile and render. `pnpm typecheck` + `pnpm build` clean; 36 routes ship. Real receive-side testing happens during the Live Impactica handoff (runbook below).

---

## What was built in Phase 2

Tagged across `v0.17.0`–`v0.21.0` on 2026-05-09. Wired the integrations and the AI layer underneath every Generate button surfaced in Phase 1.

- **Anthropic Claude wrapper** (`lib/ai/claude.ts`) — model registry (Sonnet for routine, Opus for high-stakes, Haiku for cheap). Used by every generate path: hiring (gap, interview, offer), deliverables, BBS recap, Soul File RAG.
- **OpenAI embeddings** (`lib/ai/embeddings.ts`) — `text-embedding-3-small`, 1536 dim. Soul File chunked + embedded; nightly job re-indexes.
- **pgvector** — added to `soul_file_chunks`. `searchSoulFiles(query)` does cosine search across every Soul File the caller can audience-see.
- **Stripe** — webhook (`/api/webhooks/stripe`) handles `customer.subscription.*` events; subscription assets ledger updates from the source of truth.
- **Fireflies** — GraphQL transcript fetch wired into BBS sessions. `fireflies_recording_id` on a session pulls transcript on demand and drafts action items via Claude.
- **Clerk webhooks** — `/api/webhooks/clerk` handles `user.created`, `organizationMembership.created`. Replaces first-visit auto-provision; provisions ahead of time so the first land at /portal is instant.
- **Coach Console** — `/coach` route group has My Work cross-engagement, Pipeline view, Subscriptions inventory, Hiring cross-client. Shipped in Phase 1.20 stub form, fleshed out in Phase 2.
- **Adobe Sign** — REST v6 client (`lib/adobe-sign.ts`); embedded signature flow on contract send; webhook-on-completion attaches signed PDF back to the engagement's documents.

---

## What was built in Phase 3

Tagged `v0.22.0` on 2026-05-09. Sixteen sub-phases finishing the operational infrastructure so Phase 4 can be design + custom modules.

**Schema:** migrations `0015_phase_3_tables.sql` + `0016_phase_3_polish.sql` add seven new tables and three column additions:
- `portal_module_assignments(engagement_id, module_id, enabled, sort_order)` — drives the configurable canvas. Until rows exist, every default module is enabled.
- `prospects(id, org_id, status, contact_name, contact_email, …)` — diagnostic-form auto-creates one. Status ladder maps to the Pipeline live artifact.
- `person_profiles(id, org_id, engagement_id, source, ti_behaviours, ti_driving_forces, ti_competencies, …)` — TTI assessment per individual. Internal-only weighting math stays in `lib/methodology/weighting.ts`.
- `scheduling_links(slug UNIQUE, meeting_type, duration_min, availability_json, …)` and `bookings(scheduling_link_id, starts_at_utc, booker_*, …)` — Calendly-style public booking.
- `adobe_sign_oauth_tokens` — refresh-token storage for the Phase 2 Adobe wrapper. Background job swaps the access token before expiry.
- `notification_reads(notification_id, user_profile_id)` — per-item read tracking; replaces the Phase 1.2 "mark all" approximation.
- Column additions: `messages.parent_message_id` (reply-to), `documents.version` + `documents.parent_document_id` (version chain), `engagements.stripe_customer_id` / `subscription_id` / `stage_of_growth_stage` / `stage_assessed_at`.

New enums: `portal_module_enum`, `prospect_status_enum`, `person_profile_source_enum`, `scheduling_meeting_type_enum`, `audit_event_type_enum`.

**3.1 Portal module assignments.** `lib/modules.ts` exports `getEnabledModules(engagementId)` + the canonical module registry. `PortalNav` now takes `modules` as a prop and renders only the enabled ones. `app/portal/layout.tsx` resolves the active engagement and fetches enabled modules per render. Coach side gets a per-engagement toggle UI (server action `setModuleEnabled`).

**3.2 PWA.** `app/manifest.ts` returns the PWA manifest with the brand values from CLAUDE.md (`name: "The Builder"`, `short_name: "Builder"`, `theme_color: #1A1A1A`, `background_color: #F5F1E8`). `public/icon.svg` is the geometric "B" wordmark placeholder.

**3.3 Soul File RAG UI.** `/coach/soul-search` page (master_admin/coach only). Coach types a natural-language query; Phase 2's `searchSoulFiles` does the work; results render with engagement label + chunk excerpt + similarity score. `SoulSearchPanel.tsx` is the client component.

**3.4 AI thread summaries.** `lib/actions/thread-summary.ts` exports `summarizeThread({ threadType, parentEntityId })` using Claude. `ThreadSummaryButton.tsx` renders a "Summarize thread" button at the top of every Communication thread; click → server action → markdown summary in a collapsible panel.

**3.5 Person Profiles.** `lib/actions/person-profiles.ts` + `lib/db/queries/person-profiles.ts` for CRUD. `/portal/people` lists profiles for the engagement (audience-checked). Internal-only weighting numbers stay coach-side.

**3.6 Diagnostic → prospect.** `lib/actions/public-forms.ts` modified — when a `diagnostic`-tagged form submits, server action also inserts a `prospects` row with status `diagnostic_pending` and the form payload as `notes`. Pipeline view in Coach Console picks it up automatically.

**3.7 Realtime.** `lib/realtime.ts` exports `emitEngagementEvent(tx, engagementId, type, data)`. Server actions for messages, action items, sessions, documents call it after commit. `app/api/realtime/engagement/[engagementId]/route.ts` is an SSE endpoint that `LISTEN`s on `engagement:<engagementId>` channel and streams events. Clients connect via `EventSource` and call `router.refresh()` on event.

**3.8 Scheduling.** `lib/actions/scheduling.ts` — `createSchedulingLink` (coach), `listAvailableSlots` (public), `createBooking` (public). Time math via Luxon + `America/Edmonton`; respects working-hours guard. Discovery-type bookings auto-create a prospect. BBS-type bookings are deferred to Phase 4 (per-engagement link). Public booking page: `/book/[slug]`. `BookingForm.tsx` groups slots by day for a readable picker.

**3.9 Inngest.** `lib/inngest.ts` exports the client + `emitInngestEvent`. `app/api/inngest/route.ts` is the mount point. No background functions defined yet — scaffold for Phase 4 / 5 jobs (Fireflies auto-extract, daily summaries, embedding refresh, Adobe Sign OAuth refresh).

**3.10 Reply-to-message + per-item reads.** `messages.parent_message_id` enables reply chains (renders nested in `MessageThread`). `notification_reads` table replaces the "mark all read" approximation — each notification row has a per-user read state.

**3.11 Document versioning.** `lib/actions/document-versions.ts` exports `uploadDocumentVersion(parentDocumentId, file)`. Inserts a new `documents` row with `parent_document_id` set + `version` incremented. List view renders the latest version per chain; click opens history.

**3.12 Global search.** `lib/actions/global-search.ts` — single ILIKE-based query across action_items, goals, projects, deliverables, hires, documents, sessions, messages. `/portal/search` page + `GlobalSearchPanel.tsx` client component. Audience-checked at the boundary.

**3.13 Stripe tracking on engagements.** `engagements.stripe_customer_id` / `subscription_id` columns. Phase 2's webhook now updates these alongside the subscription_assets ledger.

**3.14 Renewal flow.** `lib/actions/renewal.ts` exports `generateRenewalProposal(engagementId)` using Claude Opus. Reads Soul File + recent BBS notes + outstanding deliverables; drafts a renewal proposal markdown. Coach edits and sends.

**3.15 Adobe Sign OAuth refresh.** `adobe_sign_oauth_tokens` table holds refresh tokens. Inngest function (scaffolded, runs nightly) calls Adobe's refresh endpoint, swaps in the new access token before expiry. No more manual reauth.

**3.16 Stages of Growth.** `lib/actions/stages-of-growth.ts` exports `setEngagementStage(engagementId, stage)`. `engagements.stage_of_growth_stage` + `stage_assessed_at` columns. Stage names render to clients; the proprietary scoring rubric stays internal.

**Acceptance:** `pnpm build` clean, 64 routes compile. Live receive-side test still gated on the Live Impactica handoff (Phase 1.9 runbook).

---

## What was built in Phase 4 — Infrastructure completion

Tagged `v0.23.0` on 2026-05-09. Closes the 16 gaps identified in the Phase 3 audit so the rest of the codebase is on solid ground before the design refresh + end-to-end testing.

**Schema:** migration `0017_phase_4_infrastructure.sql` adds:
- `deliverables.revenue_impact` + `deliverables.margin_impact` — quality-gate flags (parity with action_items, goals, projects).
- `engagements.slug` UNIQUE — engagement-slug-based routing key. Existing rows backfilled from name + id fragment.
- `lesson_completions` (lesson_id, user_profile_id, org_id) — per-user lesson progress for the LMS learner UI.
- `adobe_sign_envelopes` (org_id, prospect_id, engagement_id, agreement_id, status, signed_document_id) — tracks sent contracts so the webhook can resolve them on completion.
- `soul_file_chunks` (soul_file_id, chunk_index, body, embedding) — chunked embeddings for finer-grained RAG retrieval.
- `documents.uploader_user_profile_id` made nullable so system flows (Adobe Sign auto-attach, future inbound email) can write documents without user attribution.

**1. Quality gate on deliverables.** `revenue_impact` / `margin_impact` columns + the create/update server-action schemas accept them. Mirrors the pattern on every other tagged entity per CLAUDE.md "Quality Gate".

**2. Methodology weighting (40/35/25).** `lib/methodology/weighting.ts` exports `weightedFitScore`, `partialWeightedFitScore`, and `fitBand`. INTERNAL ONLY — never rendered to clients per the Methodology IP Exposure Rules.

**3. Native diagnostic form.** `/diagnostic` is a public page anyone can fill without an account. Submission lands in `prospects` with status `diagnostic_complete` and the answers stored as Markdown notes. Visible immediately on `/coach/pipeline`.

**4. Coach Pipeline view.** `/coach/pipeline` lists prospects grouped by status. `/coach/pipeline/[id]` shows the diagnostic notes + a status select. Pipeline card added to the Coach Console main page. `lib/actions/prospects.ts` exposes `updateProspect` and `deleteProspect`.

**5. Adobe Sign webhook + signed-doc attachment.** `/api/webhooks/adobe-sign` handles GET (Adobe handshake echoes back the `X-AdobeSign-ClientId` header) and POST (HMAC-SHA256 signature verification via `ADOBE_SIGN_WEBHOOK_SECRET`). On SIGNED/COMPLETED, downloads the combined signed PDF, uploads to Blobs, inserts a `documents` row, links it back to the envelope. `lib/actions/contracts.ts` exposes `sendContractToProspect` to start a flow.

**6. Stripe subscription tracking on engagements.** Stripe webhook now handles `customer.subscription.{created,updated,deleted}` in addition to `invoice.*`. Resolves the engagement by `metadata.engagement_id` first, then by `customer` matching `engagements.stripe_customer_id`. Active subscriptions update the `stripe_subscription_id`; cancelled ones clear it.

**7. Clerk webhook hardening.** `organizationMembership.created` and `organizationMembership.updated` now share an upsert path that mirrors role / name / email / org changes. New handlers for `user.updated` (mirrors name + email changes) and `organization.updated` (mirrors org name). Fixed a bug in `organizationMembership.deleted` that previously matched zero rows.

**8. MCP write tools.** Added `create_action_item`, `schedule_session`, `post_message`, `complete_action_item` to the Workplaces MCP. Cowork's BBS Prep + My Work Live Artifacts can now write back through the bridge.

**9. Soul File chunking + indexer.** `lib/ai/chunking.ts` splits markdown into ~1500-char chunks at paragraph boundaries (sentence + char fallbacks). `upsertSoulFileBody` writes both the document-level embedding AND the chunk set on every save. `searchSoulFiles` prefers chunk-level matches (one row per engagement, best chunk wins) and falls back to document-level for engagements without chunks yet.

**10. Inngest background functions.** `lib/inngest/functions.ts` defines four functions wired into `/api/inngest`:
- `dueSoonFlush` — Mon–Fri 09:00 MT email reminder for action items due in the next 30h.
- `embeddingRefresh` — Nightly. Fans out a `soul-file.embed.requested` event for any Soul File whose body changed since the last embedding update.
- `adobeOauthRefresh` — Hourly. Refreshes Adobe Sign access tokens that expire within 2 hours via the OAuth refresh-token flow.
- `firefliesExtract` — Triggered by `bbs.fireflies.attached` event. Pulls the transcript and drafts action items in the background instead of blocking the coach's UI. The BBS session update action emits the event when a `firefliesRecordingId` is attached.

**11. Service worker.** `public/sw.js` ships a network-first strategy for HTML/pages, cache-first for static assets, with `/offline` as the fallback when the network fails. `components/pwa/ServiceWorkerRegistrar.tsx` registers it from the root layout in production. CLAUDE.md PWA spec satisfied.

**12. shadcn/ui CLI baseline.** Already in place: `components.json` (style: new-york, icon library: lucide), `cn` utility at `lib/utils.ts`, Tailwind theme tokens + CSS variables. Ready for `pnpm dlx shadcn@latest add <component>` whenever the design refresh wants pre-built primitives.

**13. Embedded apps token_passthrough.** `lib/embedded-apps/token.ts` exports `signEmbeddedAppToken`, `verifyEmbeddedAppToken`, and `appUrlWithToken`. Uses HMAC-SHA256 with `EMBEDDED_APPS_TOKEN_SECRET`, 5-minute TTL. Apps page server-side stitches a fresh `?builder_token=…` onto the iframe src for any app with `auth_mode=token_passthrough`.

**14. Course LMS delivery UI.** `/portal/courses/[id]/learn` shows the lesson list with completion state, a progress bar, an active-lesson reading pane with a Mark complete toggle. Optimistic update with revert on failure. `lib/actions/courses.ts` exports `markLessonComplete` + `unmarkLessonComplete`. The course list page links into the learner view for any published course.

**15. EngagementSlug-scoped routing.** `engagements.slug` column populated. New entry point `/portal/e/[engagementSlug]` resolves the slug, checks the caller can see it (coach roles span all; clients gated to their home org), sets a `selected_engagement_slug` cookie, redirects to `/portal`. `getCurrentEngagement` honors the cookie when set. `slugify(name, id)` runs on engagement creation. Existing single-engagement clients see no change.

**16. Production auto-migrate.** `scripts/migrate-on-deploy.mjs` runs `drizzle-kit migrate` against `DATABASE_URL_OWNER` (or `DATABASE_URL`). Wired into the Netlify build command via `netlify.toml` so every deploy applies pending migrations before the new build serves traffic. `SKIP_DB_MIGRATE=1` bypasses on preview branches without a database.

**Acceptance:** `pnpm build` clean, 70 routes compile (was 64). Adobe Sign webhook, Stripe subscription path, Inngest mount, and slug-routing bounce all show as routes. Live receive-side test still gated on the Live Impactica handoff (Phase 1.9 runbook); the runbook's "Production migrate command" gap is now closed by the auto-migrate step.

**New env vars (Phase 4):**
- `ADOBE_SIGN_WEBHOOK_SECRET` — HMAC-SHA256 secret Adobe Sign uses to sign webhook payloads. Configure under https://secure.adobesign.com/account/webhooks and copy the secret to Netlify env vars.
- `ADOBE_SIGN_CLIENT_ID` / `ADOBE_SIGN_CLIENT_SECRET` — needed for the Inngest OAuth refresh job. Both are issued from the Adobe Sign Developer dashboard.
- `EMBEDDED_APPS_TOKEN_SECRET` — 32+ bytes of random hex (generate with `openssl rand -hex 32`). Set the SAME value on every embedded app that uses `token_passthrough`.
- `DATABASE_URL_OWNER` — optional. The owner-role connection string for migration runs. Falls back to `DATABASE_URL` when not set.
- `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` — when wiring to Inngest cloud (free tier covers everything Phase 4 ships).

---

## What was built in Phase 4.5 — Native e-signing (replaces Adobe Sign)

Tagged `v0.24.0` on 2026-05-09. Adobe Sign API access is gated behind a paid tier Bruce can't get onto, so this phase rips out the Adobe integration and ships a native e-signing flow with the same legal status (US ESIGN Act / Canadian PIPEDA / Alberta Electronic Transactions Act compliant).

**Schema:** migration `0018_native_signing.sql`:
- Drops `adobe_sign_envelopes` + `adobe_sign_oauth_tokens`.
- Adds `signature_envelopes` (id, org_id, prospect_id?, engagement_id?, source_document_id, signed_document_id?, subject, message?, routing, status, created_by_user_profile_id, audit_log JSONB, completed_at, voided_at).
- Adds `signature_signers` (id, envelope_id, org_id, order_index, name, email, role_label, public_token UNIQUE, status, signature_image_data, signature_method, viewed_at, signed_at, signer_ip, signer_user_agent).
- Adds `user_profiles.signature_image_data` (data URL of coach's stored signature image).
- Makes `documents.engagement_id` nullable so contract PDFs sent to prospects (no engagement yet) can live in the documents table.

**Stack additions:** `pdf-lib` for signed-PDF generation. No external service.

**Sender flow (coach side):**
- New entry points: "Send for signature" button on the prospect detail page (`/coach/pipeline/[id]`) and a "Send a document for signature" panel on each engagement's documents page (`/coach/documents/[engagementId]`).
- Form fields: subject, document picker (or file upload for prospects), 1–4 signers (name, email, role), optional message, "auto-sign as me" checkbox.
- "Auto-sign as me" only enables when the coach has uploaded a signature image at `/coach/profile/signature`. When checked, the coach is added as the order-0 signer with status=`signed` using their stored image.
- `lib/actions/signatures.ts` exports `createSignatureEnvelope`, `createEnvelopeFromUpload`, `submitSignature`, `voidSignatureEnvelope`, `uploadMySignatureImage`, `clearMySignatureImage`, `markSigningLinkViewed`.

**Signer flow (public):**
- `/sign/[token]` — no auth required. Page renders the source document inline (PDF object embed; download link fallback for non-PDFs), shows a typed-or-drawn signature panel below.
- Type mode: signer types their full name; we render it in a script-style font on a hidden canvas and capture as PNG.
- Draw mode: HTML5 canvas with pointer events (mouse / touch / stylus). Clear button. High-DPI scaling.
- Confirmation checkbox required: "I agree to do business electronically."
- Submit → `submitSignature` server action validates token + sequential-routing turn, captures IP + user-agent + timestamp, marks signer `signed`. If more signers remain pending, emails the next one. If all done, generates the signed PDF.
- Already-signed / voided / not-your-turn / completed states render banners instead of the panel.

**Signed PDF:**
- `lib/signing/pdf.ts` (pdf-lib) takes the source bytes + signer list and produces:
  - All original pages preserved.
  - A "Certificate of Completion" page appended showing every signer's name, role, email, signed-at timestamp (Mountain Time), IP, signature method, and the captured signature image.
  - The audit-log timeline (envelope_created, signer_emailed, signer_viewed, signer_signed, envelope_completed) rendered chronologically.
  - Legal disclaimer pinned at the bottom (US ESIGN / Canadian PIPEDA / Alberta ETA).
  - A small "Electronically signed · Envelope <id>" footer stamped on every page.
- The signed PDF gets stored as a `documents` row, linked to `signature_envelopes.signed_document_id`.

**Email:**
- Signature-request email goes to each signer in turn (working-hours guarded). Includes the optional sender message and a "Review and sign" button to `/sign/[token]`.
- Completion email goes to every signer + the sender. Signed PDF attached via Resend's native attachment support (added `EmailAttachment` to `EmailEnvelope`).

**Coach views:**
- `/coach/profile/signature` — upload / replace / remove the stored signature image (PNG or JPG, ≤600 KB).
- `/coach/envelopes/[id]` — envelope status, signer list with per-signer status + IP + signed-at, complete audit log, source + signed document download links, void button while in_progress.

**Removed:**
- `lib/integrations/adobe-sign.ts`
- `app/api/webhooks/adobe-sign/`
- `lib/actions/contracts.ts`
- The `adobeOauthRefresh` Inngest function.
- The `adobe_sign_*` tables (via migration).

**Acceptance:** `pnpm build` clean. New routes: `/sign/[token]`, `/api/sign/[token]/document`, `/coach/envelopes/[id]`, `/coach/profile/signature`. Adobe Sign routes gone. Pipeline detail + Engagement documents page surface the new "Send for signature" panel.

**New env vars (Phase 4.5):** none. Native flow needs no third-party signing service. Existing `RESEND_API_KEY` / `NEXT_PUBLIC_APP_URL` / `CRON_SECRET` already cover everything.

---

## What was built — ERP follow-through & attribution (2026-07-13)

Per the "ERP build spec 2026-07-13". Migration `0082_click_ids_and_conversions.sql`
(raw SQL, `IF NOT EXISTS`, applied by `scripts/migrate-on-deploy.mjs`).

1. **Empty-recipient guard.** On 12 Jul the booking cron POSTed the Make sender a
   blank `to`; Gmail 400'd and Make deactivated the whole scenario. `lib/booking/
   follow-through.ts` now validates the prospect email (`lib/pipeline/email.ts`
   `isValidEmail`) BEFORE POSTing: no valid email → don't send, don't stamp
   `*_sent_at`, and raise a next action "Follow-through blocked, no email address."
   once (guarded by `failure_flagged_at` so the 15-min sweep doesn't re-raise).
   The "Send now" button (`BookingFollowThroughPanel`) is disabled with a tooltip
   when the prospect has no email. Investigation: `scripts/investigate-empty-email-
   bookings.mjs` (read-only) lists booking rows whose prospect email is null/blank/
   invalid.
2. **Kill the test rows.** `scripts/suppress-test-prospects.mjs` reports the three
   11-Jul test prospects (Testy Three, ERP Shape Test / 4workplaces+erptest@gmail.com,
   QC Test) + their booking rows, then sets `documents_received_at` on the armed
   rows (immediate mitigation — stops emails 2 & 3). Soft-delete (archive) is gated
   behind `--archive` and Bruce's confirmation; nothing is hard-deleted.
3. **Calendar-booking source.** `/api/leads/[token]` booking branch parses the
   "How did you hear about me?" answer out of the pipe-delimited `message`
   (`parseHearAboutAnswer`) and maps it (`channelFromHearAboutAnswer`) with the
   same mapping as the website snippet; `source_detail = "Calendar booking (<answer>)"`.
   Unparsed → `other` with a note (never silently swallowed). A click id, if
   present, wins over the answer.
4. **Meta mapping confirmed.** `channelFromWebhookPayload("Facebook Ads")` →
   `meta` (the `/facebook/` branch, and `channelFromLegacyLeadSource`). No change
   needed; extended to also treat `gbraid`/`wbraid` as `google_ads`.
5. **Click-id capture.** `prospects` gains `gclid/gbraid/wbraid/fbclid/utm_source/
   utm_medium/utm_campaign` + `click_ids` jsonb. `/api/leads/[token]` persists them
   from the payload's top-level `gclid` and `click_ids` object; first-touch wins
   (coalesce — a later empty gclid never blanks an existing one). Surfaced on the
   prospect detail page as a "Paid click" panel.
6. **Google Ads offline conversions.** `lib/google-ads/` (config + REST client +
   `runGoogleAdsConversionSync`). An idempotent SWEEP (cron `/api/cron/google-ads-
   conversions`, `netlify/functions/google-ads-conversions.mts`, every 30 min):
   for each prospect with a gclid that reached booked (`meeting_scheduled`+) or
   signed (`contract_signed`+) and whose per-kind watermark
   (`google_booked_conversion_uploaded_at` / `google_signed_conversion_uploaded_at`)
   is NULL, upload a `ClickConversion` via `UploadClickConversions` (with
   `login-customer-id` = manager account), stamp the watermark on success. Never
   uploads the same (gclid, action) twice; retries transient failures; logs the
   Google response verbatim on failure. Degrades to a logged no-op when the
   `GOOGLE_ADS_*` env vars are missing — never crashes the booking flow. **Bruce
   supplies** the 8 `GOOGLE_ADS_*` env vars (see `.env.example`) and creates the
   two "import / offline" conversion actions (Booked session, Client signed) in
   Google Ads; until then the feature is dormant.

## Correction — Google Ads offline conversions moved to the Data Manager API (2026-07-13)

Wiring the feature up surfaced two blockers that changed how item 6 above actually
works. The sweep, watermarks, and idempotency logic are unchanged; only the
transport and account routing changed.

1. **`UploadClickConversions` is dead for new integrations.** As of 2026-06-15
   Google blocks `ConversionUploadService.UploadClickConversions` for developer
   tokens that hadn't already used it (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`).
   Our token is new, so it's blocked with no allowlist path. `lib/google-ads/client.ts`
   was rewritten to upload via the **Data Manager API**
   (`POST https://datamanager.googleapis.com/v1/events:ingest`) instead:
   - New OAuth scope `https://www.googleapis.com/auth/datamanager` (token re-minted
     with both it and `adwords`); the "Data Manager API" must be enabled in the
     Cloud project. **No developer token needed** for uploads (still needed once to
     create the conversion actions).
   - Destination = `{operatingAccount:{accountType:GOOGLE_ADS, accountId:<cid>},
     productDestinationId:<conversionActionId>}`; event carries `eventSource:"WEB"`,
     `adIdentifiers.gclid`, RFC-3339 `eventTimestamp`, `conversionValue`/`currency`.
   - Async, no partial-failure: HTTP 200 = accepted. API version pinning is gone.
2. **The ad account is NOT under the manager.** `824-301-5435` is accessed
   *directly* by bbaker@4workplaces.com — it is not a client of manager
   `168-696-7494`. Routing through the manager returns `USER_PERMISSION_DENIED`.
   So `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is left **blank** and calls go direct;
   `config.ts` no longer requires it, and `client.ts` only sends the header when a
   real managing id is set. The dev token can still live on the manager — token
   ownership is independent of account routing.

Setup scripts added: `scripts/google-ads-mint-refresh-token.mjs` (loopback OAuth,
writes the refresh token into `.env.local`), `google-ads-create-conversion-actions.mjs`
(idempotent create/find of the two actions), `google-ads-test-upload.mjs`
(validate-only or `--live` proof). The two actions exist:
Booked `…/conversionActions/7683937191`, Signed `…/conversionActions/7683959902`.
Both validated (HTTP 200, validate-only) on 2026-07-13.

## What was built — lead-note capture into the profile (2026-07-14)

Per Bruce's ask: "if an app lead adds any notes in Facebook ads or any other
notes coming from the website contact form, I'd like to have these notes in
their profile." No migration — the `prospects.notes` column already existed;
this is capture + surfacing logic only.

Two gaps closed:
1. **Facebook Ads answers were dropped.** Both intake routes only read the note
   from a fixed pick list (`message`/`notes`/`comments`/…). Facebook Lead Ads
   name each custom-question field after the question itself (e.g.
   `what_is_your_biggest_challenge`), so a lead's typed answer arrived under a
   name we didn't look for and never reached the profile.
2. **Repeat leads lost their note.** A returning prospect's submission only wrote
   an activity-log row; the profile Notes field was never touched.

`lib/pipeline/lead-notes.ts` (new, pure, no deps):
- `extractLeadNote(body)` — reads the primary message field first, then a
  **catch-all** that folds in ANY other free-text answer the form sent
  (Facebook custom questions, extra website-form fields), each labelled via
  `humanizeKey` (`what_is_your_biggest_challenge` → "What is your biggest
  challenge: …"). Skips `STRUCTURED_KEYS` (fields we map to columns — name,
  email, phone, company, website, socials, utm/click-ids, calendar/booking
  keys, honeypot) and `METADATA_KEYS` (Facebook platform junk — form_id,
  ad_id, campaign_id, created_time, is_organic, …). Objects/arrays (e.g.
  `click_ids`) are never folded in. 8000-char cap. Means **no Make.com scenario
  change is needed** — whatever the platform calls the field, the answer lands.
- `mergeLeadNote(existing, incoming, sourceLabel, at)` — non-destructive merge
  for repeat submissions: empty existing → incoming; incoming already present →
  no change (idempotent against a re-fired webhook); otherwise append under a
  dated `— From <source> · <YYYY-MM-DD> —` header. Hand-typed notes are never
  clobbered.

Wired into both intake paths:
- `app/api/leads/[token]/route.ts` (Make.com bridge — website contact form +
  Meta/Google/etc. ads): `leadNote = extractLeadNote(body)` drives the `notes`
  column on the website-form insert AND the booking-branch insert; both dedupe
  branches (website + booking) now `mergeLeadNote` into the existing notes;
  activity `body` uses `leadNote ?? message`. `message` is still computed the
  old way for the booking `parseHearAboutAnswer` attribution — unchanged.
- `app/api/leads/route.ts` (JSON web-form intake): schema switched to
  `intakeSchema.passthrough()` so unknown answer fields survive for the
  catch-all; insert + dedupe + activity mirror the token route.

Surfacing: `app/business-builder/pipeline/[id]/page.tsx` Notes `CollapsibleSection`
now `defaultOpen={Boolean(prospect.notes)}` so an incoming lead note is visible
on load (per-person localStorage toggle still overrides).

Not retroactive — applies to leads from deploy forward; existing prospects are
untouched. Verified: `tsc --noEmit` + `next lint` clean; the pure
extract/merge logic exercised through 9 scenarios (Facebook custom question,
website message, message+extra-answers, metadata-only, repeat append, re-fired
webhook, structured-excluded) — all pass.

## What was built — new-lead email alert to the shared inbox (2026-07-14)

Per Bruce's ask: every new lead, as it comes in, emails `info@4workplaces.com`.
Root cause it addressed: the Make.com bridge route (`/api/leads/[token]`) — which
carries the website contact form AND the Meta/Google ads — sent **no email at
all**, so most real inbound leads were arriving silently. Only `/api/leads` (the
JSON intake) emailed anyone, and only the master_admin/coach profiles.

`lib/pipeline/notify-new-lead.ts` (new): `leadNotifyEmail()` returns
`process.env.LEADS_NOTIFY_EMAIL` or defaults to `info@4workplaces.com` (works
with no setup). `notifyNewLead()` sends the existing `newLeadEmail` template to
that address via `sendEmailQuietly({ bypassWorkingHours: true })` — a fresh lead
shouldn't wait for business hours, matching the existing coach-alert behaviour.
Best-effort: a send failure logs and never fails the webhook response.

Wired in:
- `/api/leads/[token]`: after the tx, `if (result.prospectId && !result.deduped)`
  fires the alert. Label is "Booking" for the booking branch, else the raw
  `source`. Fires for BOTH new website-form/ads leads and new bookings; skipped
  on a repeat submission and on a re-seen booking no-op (`deduped`).
- `/api/leads`: sends the `info@` alert alongside the existing per-coach emails,
  gated on `!deduped` (new leads only). Coach alerts unchanged.

`.env.example` documents `LEADS_NOTIFY_EMAIL` (optional; defaults to
info@4workplaces.com). Note: this deliberately targets `info@`, per Bruce's
explicit request — distinct from the `bbaker@4workplaces.com` scheduled-report
address in the root CLAUDE.md.

Depends on the Phase 1.4 Resend env vars (`RESEND_API_KEY` / `RESEND_FROM_EMAIL`)
being set in Netlify — already required for the existing `/api/leads` coach
alerts. Verified: `tsc --noEmit` + `next lint` clean (type-narrowing across the
booking/website/dedupe result branches checks out). True end-to-end confirmation
("email lands in info@") happens on the first real lead after deploy, or a test
POST to the live endpoint.

## What was built — internal team touch-bases + session agendas (2026-07-19)

Per Bruce's ask: he and Jen need to task each other with commitments, and
run their own recurring touch-bases with agenda items that the action
items hang off. Migration `0084_team_touch_bases.sql`.

**Three decisions Bruce made up front:** agendas are generic (any session,
not internal-only) so client BBS sessions get them free; the app generates
the recurring series rather than mirroring Google; and membership is any
Business Builder rather than a hardcoded Bruce+Jen.

**Internal work rides on a real engagement row.** `engagements.is_internal`
(partial UNIQUE per org) marks the practice's own workspace, created on
first visit to the Team module by `ensureInternalEngagementId()` in
`lib/db/queries/internal-workspace.ts` — nothing for Bruce to run first.
This is the load-bearing choice: because internal action items are just
action items on an engagement, assignment, in-app notifications, the
assignment email, the due-soon reminder cron, and My Work all work
internally on day one with **no parallel system to keep in sync**. The
flag is what keeps internal work out of client surfaces —
`listCoachEngagements` filters it out, as does the Team-access admin
client list.

**Access.** `canCurrentBbAccessEngagement` now returns true for the
internal engagement for ANY Business Builder. Without this, a coach
restricted to a subset of clients (`all_clients_access=false`) would have
been locked out of the team's own touch-bases — the per-client grant
model doesn't apply to a non-client. Checked last so the common path
costs no extra query.

**Recurrence** (`lib/scheduling/recurrence.ts`, pure/no-deps-on-DB).
`session_series` holds cadence (weekly/biweekly/monthly) + an `anchor_at`
that fixes weekday and time of day. The materializer walks forward **from
the anchor**, not from "now", which is what makes the series phase-stable
and top-ups idempotent. All arithmetic runs on a Luxon DateTime pinned to
`America/Edmonton`, so a 9:00 AM touch-base stays 9:00 AM across both DST
boundaries (verified: spring-forward, fall-back, biweekly phase stability,
monthly clamp). `(series_id, series_occurrence_at)` UNIQUE is the entire
idempotency mechanism — a re-run or overlapping job inserts nothing.
Known edge case documented in the module header: monthly anchored on the
29th–31st clamps stickily (Jan 31 → Feb 28 → Mar 28), diverging from
Google's FREQ=MONTHLY skip behaviour. Anchor monthly meetings on the
1st–28th.

Cadence and anchor are deliberately **not editable** — changing them would
re-phase every future slot and orphan agenda items already attached to
generated instances. End the series and start a new one.

**Google Calendar.** `syncSeriesToGoogle` pushes ONE recurring event
carrying an RRULE (not one event per instance, which would bury the
rhythm). New table `session_series_calendar_mappings` — separate from
`google_calendar_event_mappings` because that table's `bbs_session_id` is
NOT NULL and per-instance. Ending a series removes the calendar event.
**Deliberately creates the event with NO attendees** — adding teammates
would make Google email them an invitation as a side effect of defining a
schedule. Bruce adds Jen from Google, or each Business Builder creates
their own.

**Agenda items** (`agenda_items`) attach to any `bbs_session`. Status
pending/discussed/deferred, explicit `sort_order`, `raised_by`, and
`carried_from_agenda_item_id` — `carryForwardAgenda` copies everything
still pending onto the next scheduled session and marks the sources
deferred, so "we keep punting this" stays visible and a double-run can't
duplicate. `action_items.agenda_item_id` (ON DELETE **SET NULL**, never
CASCADE — a talking point is not the commitment that came out of it).

Agenda permissions are split, because these are generic across CLIENT
sessions too: **contribute** (add / edit / set status) is open to
everyone in the engagement except `prospect` — an agenda only one person
can add to isn't an agenda. **Delete** is author-or-leadership.
**Reorder** and **carry-forward** are leadership-only: reorder rewrites
everyone's agenda and carry-forward mutates a *different* session. Left
open, a `client_employee` could delete the coach's talking points.

`createActionItem` validates that a supplied `agendaItemId` /
`bbsSessionId` actually belongs to the target engagement, inside the
bound transaction. RLS blocks cross-org but not cross-engagement-within-
org, and FK checks run as the table owner — so an unvalidated id would
insert happily and then render nowhere. Mismatches are dropped to null
rather than failing the create.

**UI.** `/business-builder/team` (schedules, upcoming, "who owes what"
grouped by owner, past) and `/business-builder/team/[sessionId]` (the
AgendaBoard + the existing SessionDetail). The detail page hard-checks
`session.engagementId === internalEngagementId` so a client session id
can't be reached through the team route. "Task it" on any agenda item
creates a linked action item, defaulting the assignee to the other
person when the team is exactly two. Reorder is arrow-based, not drag —
works on touch, no dependency, and agendas are short.

**Nightly job.** Inngest `sessionSeriesTopUp` (`0 8 * * *`, ~01:00 MT,
outside Bruce's working window) keeps every active series materialized
~90 days out via `topUpAllSeries()`. One bad series is logged and
skipped rather than stopping the sweep.

**Caught in adversarial review, worth remembering:**
- `endSessionSeries` originally detached `series_id` from ALL instances
  including past ones. That destroys the materializer's idempotency key,
  so re-creating the same cadence later would regenerate slots the kept
  instances already occupied — double-booking every date. Now scoped to
  future/scheduled only.
- Series `notes` were being copied onto every generated instance, which
  made the "delete empty future instances" cleanup a permanent no-op
  (every instance looked non-empty). Series notes now stay on the series.
- `topUpAllSeries` used `withEngagementContext`, which calls
  `ensureUserProfile()`. There's no signed-in user in a cron run, so the
  access check would have denied every engagement and the nightly sweep
  would have silently created nothing. Uses `withSystemContext` now, same
  as the due-soon email cron. **This is the trap for any future cron
  work in this repo.**
- `occurrencesBetween` emitted back-dated slots when its 500-step guard
  was exhausted rather than bailing. Returns `[]` now.

**Verified:** `tsc --noEmit` + `next lint` clean; `next build` compiles
successfully (the prerender errors in a local run are a missing Clerk
publishable key in `.env.local`, and hit pre-existing pages like
`/_not-found` identically — Netlify has the key). Recurrence math
exercised through four scenarios as above. **Not yet exercised against a
live database** — migration 0084 applies on next deploy via
`scripts/migrate-on-deploy.mjs`; first real touch-base is the acceptance
test.

## Active Phase

**Phase 5 kickoff — TBD.** All intended infrastructure from CLAUDE.md is in place. Next pass per Bruce's direction is the **design system refresh** + end-to-end testing — purely visual/UX work and verification rather than new functionality.

Custom modules per engagement and BBS-type scheduling links are the natural Phase 6+ candidates once the design lands.

---

## Operations

### Live Impactica handoff runbook

This is the manual checklist for onboarding the first real client (Impactica) onto The Builder. Phase 1.7 finished the last module. Bruce executes these steps; Claude doesn't have the credentials or human-in-the-loop authority for any of them.

**Pre-handoff checks (do once, before any client touches it):**

1. **Apply pending migrations to production.** Production Neon is on a separate branch from local dev. Run `pnpm drizzle-kit migrate` against the production `DATABASE_URL` (set it in shell, not `.env.local`, so it doesn't override). Or run a one-off Netlify build with the migrate command — confirm in https://console.neon.tech that tables `bbs_sessions`, `soul_files`, `message_attachments`, `message_reactions` all exist.

2. **Add the four Phase 1.4 env vars to Netlify.** Open https://app.netlify.com/sites/workplaces-the-builder/settings/env and add:
   - `RESEND_API_KEY` — value from https://resend.com/api-keys (the rotated key, not the original).
   - `RESEND_FROM_EMAIL` — `The Builder <notifications@4workplaces.com>`
   - `NEXT_PUBLIC_APP_URL` — `https://workplaces-the-builder.netlify.app`
   - `CRON_SECRET` — same value as `.env.local`. (If it doesn't exist there, generate a new random 32-byte string and put it in both places.)

3. **Confirm Netlify Blobs is enabled.** Open https://app.netlify.com/sites/workplaces-the-builder/configuration/blobs — should be on by default for paid plans. If off, click Enable.

4. **Trigger a fresh deploy.** Push or click Deploy in the Netlify dashboard. Verify build green, all 23 routes listed.

5. **Smoke-test as Bruce (master_admin).** Visit https://workplaces-the-builder.netlify.app/portal — see the dashboard. Visit each tab in the nav — Action items, Sessions, Communication, Documents, Soul File. Each should render without error. Upload a small PDF to Documents. Schedule a session. Post a message in the Leadership thread.

**Per-client handoff (once per real client):**

6. **Create the engagement.** Go to https://workplaces-the-builder.netlify.app/coach/engagements/new. Fill in: engagement name (e.g. "Impactica"), type (Accelerator or Implementer), client lead's full name and email, planned start date. Submit. The form creates a Clerk Organization, an `orgs` row, an `engagements` row, sends the invitation email, then strips Bruce as auto-admin of the new Clerk Org.

7. **Verify the invitation.** Open https://dashboard.clerk.com/last-active/organizations/<org_id> (the URL shows up after the form succeeds). The invitation should appear under Pending. Optionally, ask the client lead to forward you the invitation email's subject line so you know it landed.

8. **Client lead accepts.** They click the email link, sign up at https://workplaces-the-builder.netlify.app/sign-up, complete Clerk's sign-up flow, land at /portal. First-visit provisioning auto-creates their `user_profiles` row with `role=client_lead` from the invitation's `publicMetadata.app_role`.

9. **Populate the Soul File.** As Bruce, open https://workplaces-the-builder.netlify.app/coach/soul-file/<engagement_id> (the engagement id is in the URL after step 6). Hit Start writing. Drop in the deep context for this client — the methodology IP that drives every BBS.

10. **Schedule the first BBS.** https://workplaces-the-builder.netlify.app/coach/sessions/<engagement_id> → Schedule a session form. Date/time in MT, format (in-person or virtual), agenda in notes.

11. **Send a welcome message.** https://workplaces-the-builder.netlify.app/coach/communication/<engagement_id> → Leadership tab. Welcome them, point them at the Sessions tab.

**Known gaps (deferred to Phase 2+):**

- **Coach cross-org gap.** When Bruce posts in a thread that lives in the client org from his master-org session, RLS would filter to nothing because the GUC binds to the master org id. Workaround for the pilot: post the welcome message after step 8 (client lead acceptance), so the client lead's session creates the first leadership-thread row. Bruce's subsequent posts will still hit the gap until the coach-aware tenant helper lands.
- **Production migrate command.** No automated step yet — Bruce / a developer manually runs `pnpm drizzle-kit migrate` against the production URL. Future Inngest job will run this on deploy.
- **Webhook for user.created.** First-visit auto-provision works for the pilot but won't scale to many concurrent sign-ups. Webhook is on the Phase 2 list.

**Rollback plan if a step fails mid-handoff:**

- **Engagement creation failed after Clerk Org created.** Manually delete the orphan org at https://dashboard.clerk.com/last-active/organizations/<org_id> → Settings → Delete. The form's catch block tries to do this automatically; if it didn't, do it by hand.
- **Invitation went to wrong email.** Cancel via https://dashboard.clerk.com/last-active/organizations/<org_id>/invitations → three dots → Revoke. Re-issue from the form.
- **Anything broke during smoke test (step 5).** Don't onboard yet. Re-check env vars (step 2), re-check migrations (step 1). If still broken, redeploy.
