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

## Active Phase

**Phase 2 kickoff — TBD.** Phase 1 is feature-complete on the modules in `Phase-1-Plan.md`. Phase 2 candidates (per CLAUDE.md and `docs/decisions.md`):
- **Coach-aware tenant helper** — fix the cross-org GUC gap so Bruce can post / view / edit in client orgs from the master org session. Documented as "Coach cross-org gap" in 1.2/1.3/1.4/1.5/1.6 acceptance notes.
- **Scheduling module** — Calendly-style booking, Google Calendar sync, Reclaim/Motion-style auto-scheduling. Elevated from deferred to Phase 2 per the 2026-05-09 reference-apps decision.
- **Soul File vector embeddings + semantic search** — pgvector + Voyage AI (or another embedding vendor).
- **Hiring Pipeline module** — gap report ingest → interview → assessment → offer → onboarding. CLAUDE.md "Hiring Pipeline — External + Internal Split" is the spec.
- **Inngest + scheduled functions** for richer background jobs (Fireflies auto-extract, daily summaries, etc.).
- **Webhooks for Clerk** — replace the first-visit auto-provision with `user.created` + Org events for production correctness.

Pick at the next session kickoff with Bruce.

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
