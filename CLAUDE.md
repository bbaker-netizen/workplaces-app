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

## Active Phase

**Sub-Phase 1.5 — Documents Module + message attachments.** Per `Phase-1-Plan.md` and the 2026-05-09 decisions log:

**Build:**
- Netlify Blobs upload pipeline (server actions wrapping `@netlify/blobs`).
- `documents` table reads + writes (schema already shipped in 1.1).
- `/portal/documents` and `/coach/documents/[engagementId]` pages — list, upload, tag, download, delete.
- Paperclip icon in the message composer hits the same upload flow; attachment metadata is stored on the message via a new `message_attachments` join table OR by adding an `attachments` JSONB column to `messages` (decide at sub-phase kickoff).

**Acceptance:** Bruce uploads a PDF to a client's documents module; the client sees and downloads it. Bruce attaches a file to a message; the recipient sees the attachment chip and can download.
