# CLAUDE.md — The Builder (Workplaces Application)

This file is read by Claude Code at the start of every session. Keep it updated as the project evolves.

**v3 of this file (May 2 2026).** Brand direction now locked: The Builder. Tagline: "Build what compounds." Formal attribution where surfaced: *The Builder · By Workplaces*.

---

## Project Overview

**Owner:** Bruce Baker — Workplaces (HR All-In Inc), Edmonton, Alberta, Canada
**Coaches:** Bruce Baker (`master_admin`) and Jen Garrison (`coach`), both active. Both currently hold `all_clients_access`. Assume two Business Builders, not one — anything that assumes a single operator (a shared storage key, an env var naming one recipient, a singular "the coach" lookup) is a live bug.
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

Tagged `v0.1.0` on 2026-05-02. Live at <https://builder.4workplaces.com>.

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

**Acceptance:** Land on https://builder.4workplaces.com/portal (or http://localhost:3000/portal in dev). See the five cards populated with real data from your engagement. Each card links into its full module page.

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

## What was built — Executive Assistant module (2026-07-25)

Per the "EA module build spec". An EA layer on top of entities that
already existed, not a new application. Migration `0086_ea_module.sql`.

**Everything outbound is a draft or a proposal.** No email leaves under
Bruce's name unread, and no calendar event appears without him asking
for it. That single rule shapes every piece below.

### Schema (0086)

`ea_digests` (one row per send; `payload` is the snapshot the email was
rendered from), `ea_time_blocks`, `ea_email_threads`, `session_recaps`,
`ea_approval_tokens`, plus `action_items.estimated_minutes` (default 60,
so every pre-existing row is usable with no backfill).

Four UNIQUE indexes carry the idempotency, all in the same spirit as
`(series_id, series_occurrence_at)` on `bbs_sessions`:
`ea_digests(user_profile_id, sent_for_date)`,
`ea_time_blocks(action_item_id, proposed_start)`,
`ea_email_threads(gmail_thread_id)`, `session_recaps(bbs_session_id)`.

### Approval without a login

`ea_approval_tokens` holds a SHA-256 of a 32-byte random token, single
use, 72-hour expiry. The plaintext exists only in the emailed URL. The
row is a verifier, not a copy of the secret.

**The approve link is two steps, not one, and this was a deliberate
departure from the spec.** GET renders "here is what this will do" with
a POST button; POST consumes the token and acts. Mail security scanners
(Outlook Safe Links, Gmail's link checker, corporate proxies) fetch the
URLs in a message before a human sees them. With a one-click GET, a
scanner would burn the single-use token — and for a session recap it
would have emailed a client under Bruce's name with nobody having
clicked. Two taps from a phone buys immunity from that. `lib/ea/tokens.ts`
`peekApprovalToken` (does not consume) vs `consumeApprovalToken` (atomic
claim, guarded on `consumed_at IS NULL`, so a double tap loses the race
rather than acting twice).

### Phase 1 — the 07:00 briefing

`eaDailyDigest`, cron `0 13 * * 1-5`.

**The daily carries only what Bruce acts on today** (his call, after
reviewing a rendered sample): today's sessions with last session's
still-open commitments, blocks that elapsed with the work still open,
time the assistant has found, his commitments (overdue / today / this
week), the next seven days, and prospects with no next step booked.

Deliverable states, what clients owe, and engagements gone quiet moved
to the Friday rollup. They are a weekly read, not a 7am one, and nine
sections was too much scrolling on a phone. A footer line in the daily
points at Friday so the move does not read as something going missing.

**"No next step booked" stayed in the daily** despite being
state-of-the-book, because it is usually two lines and it is the one
item on that list you act on the same morning: a conversation that ended
without a date decays fast, and Friday afternoon is three days too late
to ring somebody back.

`gatherDigest` still collects everything and the full set is stored in
`ea_digests.payload` — the split is a rendering decision, so the daily
snapshot stays complete and the Friday rollup reuses the same gatherer
rather than re-deriving the same four queries. The two emails cannot
disagree about the same facts.

**Sends with `bypassWorkingHours: true`.** This is the one deliberate
exception to the Mon-Fri 08:30-18:00 rule: the briefing is specified to
land at 07:00, and a briefing arriving at 08:30 has already missed the
morning it describes. Everything else the EA sends to clients goes
through the normal guarded path.

Note the DST asymmetry: `0 13 * * 1-5` is 07:00 MDT and 06:00 MST.
Inngest crons are UTC and a fixed 07:00 MT would need two schedules;
arriving an hour early in winter is the harmless side of that trade.

### Phase 2 — calendar blocks

`lib/ea/time-blocks.ts`. Slots inside 08:30-18:00 MT weekdays, nothing
within 30 minutes of a BBS session (ordinary events get no buffer; BBS
sessions do, because those are the appointments that cost something to
be late for), maximum four hours of blocks per day counting
already-approved ones, overdue items get slots first.

Retirement is the part that had to be right. Completing an item deletes
any FUTURE event from Google and marks the block completed. Past blocks
are left alone — they are a record of time actually spent. A block whose
end passes with the item still open is re-proposed with
`reschedule_count` incremented and an escalating notice: first miss is a
note, second a warning, third states plainly that it has slipped three
times and asks whether to renegotiate or kill it.

Hooked into `updateActionItem` (on status `done`) and `deleteActionItem`
— the latter runs BEFORE the row is deleted, because `ea_time_blocks`
cascades and once the item is gone we would no longer know which Google
events to clean up.

### Phase 3 — inbound triage

`eaInboxSweep`, cron `15 * * * *`. Classifies via Haiku, drafts via
`createGmailDraft` into the real thread, logs every thread either way so
classification never repeats (or bills twice) on the same one.

**Seven days, not weekdays** — the only EA schedule that runs at the
weekend. It sends nothing; it writes a draft. The weekday restriction
elsewhere protects outbound mail, and a draft disturbs nobody, whereas a
prospect asking for time on Friday evening sitting untouched until
Monday is a real conversion cost.

**Twelve-hour lookback, and the ledger is read before any body is
fetched.** `listMessageRefsSince` keeps the `threadId` Gmail already
returns on the list response, so threads already handled are filtered
out for the cost of a `Set` lookup rather than a message fetch. The
original cut fetched every message body first and filtered afterwards,
which was survivable at a 2.5-hour window and would have broken at
twelve: an hourly sweep re-lists the same mail twelve times, and the
per-run cap of 40 would have been consumed entirely by already-handled
threads, starving the new mail queued behind them.

A message sent to yourself carries BOTH `SENT` and `INBOX` in Gmail, so
self-addressed test mail is skipped twice over — by the label check and
by the sender check. Test from a different address.

**The Gmail scopes were already there, mostly.** `gmail.readonly` and
`gmail.send` were in `GOOGLE_CALENDAR_SCOPE` before this build. Only
`gmail.compose` had to be added, because `gmail.send` permits
`messages.send` and nothing else — drafts need compose. Anyone connected
before this change must disconnect and reconnect once; Google does not
widen an existing grant silently.

The draft never names a price. That is the sales protocol, not a style
choice, and it is enforced in the prompt AND in the hard-coded fallback
copy, because the fallback is what ships when the model call fails.

### Phase 4 — post-session recaps

**Transcripts attach themselves** (`lib/ea/transcript-match.ts`). This
closed a gap that made the whole phase near-useless: every
transcript-driven feature keys off
`bbs_sessions.fireflies_recording_id`, and the only thing that had ever
written it was a person pasting the id in by hand. So "hold a session,
get a recap" was really "hold a session, remember to paste an id, then
get a recap" — and the same was true of action-item drafting, which is
why that had always felt manual.

The join is **client plus time**, not the title convention the original
spec proposed. `engagement_meetings` already carries the engagement, the
transcript id, and when the meeting happened, refreshed hourly by the
existing sync — so a session held at 10:00 for a client pairs with that
client's transcript recorded near 10:00, whatever the meeting was
called. Title-based matching would have made the pipeline depend on
naming discipline forever and failed silently the first time somebody
typed something different.

Three guards against a wrong pairing: same engagement only (cross-client
matching is impossible by construction), inside a ±120-minute window
with the closest candidate winning, and a transcript already claimed by
another session is never reused. Ambiguous matches (more than one
candidate in range) are counted — a rising number means the window wants
narrowing. Capped at 5 per run, because attaching emits
`bbs.fireflies.attached` and an uncapped first run would draft a week of
action items in one burst.

Runs at the START of the recap sweep, so a newly attached transcript
produces its recap in the same pass rather than an hour later.

Rides the existing hourly `firefliesSync` cron as a second step, which
is what makes "within an hour of the transcript landing" true without a
second schedule. `lib/ea/recap-sweep.ts` has a seven-day lookback and a
five-per-run cap: without them the first run after deploy would recap
every session ever recorded and send Bruce an approval email for each.

**Claude writes the prose; the database writes the facts.** The model
returns JSON (headline, decisions, closing note). Every fact with a
consequence — who owns what, by when, when the next session is — comes
from the database, and every string is escaped on the way into the
markup. A model cannot invent an owner or inject markup into a client's
inbox. Draft action items are excluded in SQL, not by prompt: an item
Bruce has not published is a guess, and a guess in a client email reads
as a commitment.

On approval the recap is filed on the engagement's `engagement_team`
thread first, in the same transaction that moves it out of `draft`, then
emailed to `client_lead` / `client_manager` contacts. `sent_at` is
stamped only after delivery, so a send failure leaves it `approved` and
retryable rather than silently marked done.

**The recap sends from the Business Builder's own Gmail**, not from
`notifications@4workplaces.com`. A recap is a coaching artefact, not a
system receipt: from their address it reads as a note from their coach,
a client's reply reaches a human rather than a no-reply mailbox, and a
copy lands in their Sent folder with the rest of the correspondence.
Their `email_signature` is appended. Falls back to the app's
transactional sender when Google is not connected — a deliberate
degradation, because an approved recap that never leaves is worse than
one sent from the wrong address.

**The portal copy is Markdown** (`session_recaps.body_markdown`, added
in 0087). The portal renders message bodies through react-markdown with
raw HTML stripped, so HTML would have shown the client escaped tags and
plain text an unformatted wall. Markdown is the format that surface
already speaks: real headings, owners in bold, proper lists.

Agenda carry-forward needed a system-context twin
(`carryForwardAgendaAsSystem`) because the existing `carryForwardAgenda`
authorises through `ensureUserProfile()`. Same trap as `topUpAllSeries`.

### The six additions from the spec

All built. Pre-session prep, no-ghost detection, and engagement silence
detection are digest sections. Phone approval is the token design.
Client chasing is `eaClientNudge` (Monday `0 16 * * 1`, working hours
respected, draft items never chased). The Friday rollup is
`eaFridayRollup` (`0 22 * * 5`) and counts the items that moved neither
top line nor margin — that count is the number worth looking at. It also
carries the three state-of-the-book sections that came out of the daily
briefing.

### Drafted session agendas (migrations 0089 + 0090)

The briefing said what was OPEN going into a session; it never helped
decide what the session should be ABOUT. `lib/ea/agenda-draft.ts` drafts
a proposed agenda for each of the day's sessions from three inputs, in
order of weight: the last session's transcript summary (what was left
unresolved is the strongest signal), open and overdue commitments, and
deliverables in flight.

**Proposals never touch `agenda_items` until accepted.** Agenda items are
CLIENT-VISIBLE in the portal, so a model must not be able to put talking
points in front of a client unread. Drafts live in
`ea_agenda_proposals` and are copied across only when an approve link is
tapped — a pure copy of the stored text, no second model call, so what
lands cannot differ from what was reviewed.

Carried-forward items are passed to the model as "already covered" AND
filtered out of its output afterwards. Belt and braces, because a
duplicated talking point makes the carry-forward mechanism look broken.

UNIQUE on `bbs_session_id` means one proposal per session ever: a
declined agenda stays declined rather than being re-offered every
morning until the session happens. Only TODAY's sessions get one — prep
matters on the morning of, and drafting a week ahead would be noise from
stale material.

The `ALTER TYPE ... ADD VALUE` for the new approval subject is alone in
0089, separate from the table in 0090. The deploy runner sends each file
as one implicit transaction, and a newly added enum value cannot be used
in the transaction that added it. Splitting removes the question
entirely rather than relying on nothing happening to reference it.

Model calls run AFTER the digest row is claimed, not inside that
transaction — several Claude requests would otherwise pin a pooled
connection for their whole duration.

### Hours per engagement, and what they earn

`lib/ea/engagement-hours.ts`, rendered in the Friday rollup. Per
engagement, for the week and to date: session hours (sessions actually
`completed`, from `duration_min`), focus-block hours (approved or
completed blocks whose end has passed), and where a fee exists, the
effective hourly rate. Sorted lowest rate first — engagements with no fee
sort last, because no fee is an unknown rate rather than a bad one.

Deliberately conservative: only time the system can see is counted, so
email, prep, and thinking time are all missing. A rate that looks thin
here is thinner in life, which is the correct direction to err.

**The warning threshold is the practice's own median, not a number
picked in advance.** A coach selling monthly retainers has never had to
know their hourly rate, and asking them to invent one produces a figure
with nothing behind it. Anything below 60% of the median across the book
is flagged, so the benchmark calibrates itself whatever the numbers turn
out to be. Below three rated engagements the median is just one of them,
so nothing is coloured at all and the email says so — the worst-first
ordering still identifies who is eating the time, without dressing a
guess up as a warning.

`engagements.monthly_fee_cents` already existed (migration 0035) but was
only ever written at engagement creation from the originating lead,
which made it unfixable afterwards. `setEngagementMonthlyFee` plus
`EngagementFeeControl` on the engagement page close that; blank clears
it, dropping the engagement out of the rate calculation rather than
reporting a rate against a fee of zero.

### Heartbeat (migration 0088)

`ea_job_runs` — one row per background-job run, written on completion
INCLUDING failures, via `withHeartbeat` in `lib/ea/job-runs.ts`.

The failure this catches is silence. Every EA job is a cron nobody
watches; it can stop firing, lose its Google token, or throw on every
run, and the only symptom is an email that does not arrive. A missing
email is indistinguishable from a quiet week, so without a heartbeat
"the assistant has been dead for a month" and "nothing needed saying"
look identical.

Six jobs report: `ea-daily-digest`, `ea-time-blocks`, `ea-inbox-sweep`,
`ea-recap-sweep`, `ea-client-nudge`, `ea-friday-rollup`. Focus-time
proposals get their own line despite running inside the digest, because
they are the piece most likely to fail alone — a Google account that has
lost calendar access produces a briefing with no blocks, which reads as
a quiet week rather than a broken integration.

The Friday rollup renders them as one compact table at the bottom.
Anything with no successful run in 8 days goes red and carries its last
error inline. Three states have to stay distinguishable and the preview
script exercises all of them: healthy with work done, healthy but idle
(zero items is a quiet week, NOT a fault), stale-with-a-date (worked for
weeks then the token died), and never-run-at-all.

`EA_JOBS` is a hard-coded registry rather than a `SELECT DISTINCT` over
the rows. A job that has never fired writes no rows, and that is exactly
the case worth catching — deriving the list from the data would make the
worst failure invisible.

Two rules the table itself enforces. **Writes never throw** — a
heartbeat that could fail the job it only observes would be worse than
none, so every path swallows and logs. And **a stale job un-suppresses
the rollup**: the "nothing to report this week, skip the email" check
ignores emptiness when anything is red, because silence is the precise
failure being guarded against.

Deliberately NOT tenant-scoped: no `org_id`, and 0088 enables RLS with
no policy at all, so `workplaces_app` matches no rows for any command
and the table is reachable only through `withSystemContext`. Stronger
than a tenant policy — no tenant-bound query can reach operational data
even by accident.

### Previewing the emails without sending

`npx tsx scripts/preview-ea-email.ts digest|rollup [outputPath]` renders
either email to an HTML file plus its plain-text alternative, using
representative sample data that fills every section. It imports the real
template, so what lands in the file is what Resend would deliver — no
database, no keys, no network. Use it to review copy and layout before
changing anything that sends.

### Every Business Builder gets one (migration 0087)

The EA was multi-Builder in shape from the start — `listEaRecipients`
returns every master admin and coach in the master org, and
`listEngagementsForRecipient` mirrors each one's own client access
(all-clients, explicit grants, or assigned-coach). Each Builder's jobs
run against their OWN Google connection, so the calendar read, the
blocks, and the Gmail drafts are all theirs.

Three single-user shortcuts had to come out before that was true in
practice:

1. **`EA_DIGEST_TO_EMAIL` is gone.** One environment variable redirected
   every Builder's mail to one address — correct for a one-person
   practice, and wrong the moment a second Builder joined, since they
   would have received each other's briefings. Replaced by
   `user_profiles.ea_notify_email`, editable per person at Settings →
   Profile → Assistant email. NULL falls back to the account email, so
   nobody has to set anything.
2. **Recap approval routed to whoever was master admin.** It now
   resolves the engagement's own coach (`engagements.coach_id` →
   `coaches.user_profile_id`), so Jen's client produces Jen's approval
   email and sends from Jen's address. Falls back to the master admin
   only when the coach record is missing, rather than dropping the recap.
3. **`EA_BOOKING_URL` took precedence over the Builder's own link.**
   Reversed: each Builder's own `scheduling_links` row wins, and the env
   var is now only the fallback for someone who has not made a link yet.

Per-Builder setup is therefore: connect Google, set an assistant email
if the account address is not the watched one, and create a booking
link. Nothing else.

### New env vars

- `EA_BOOKING_URL` (optional) — fallback booking page for a Builder with
  no `scheduling_links` row of their own.

There is deliberately no env var for digest delivery. See point 1 above.

### Traps avoided

Every EA background job resolves its subjects through
`lib/ea/recipients.ts` under `withSystemContext`. `withEngagementContext`
and anything built on `ensureUserProfile()` assume a Clerk session; in a
cron there is none, so those helpers deny every engagement and the job
silently does nothing while reporting success. This is the same trap
`topUpAllSeries` hit in 0084.

Calendar reads happen OUTSIDE the transaction (`loadCalendarWindow`) so
a Google round trip never pins a pooled Postgres connection.

`loadCalendarWindow` returning null (not connected, or unreadable) means
no blocks are proposed at all. A proposal that double-books is worse
than no proposal.

### Verified

`tsc --noEmit` and `next lint` both clean. `next build` compiles
successfully and `/api/ea/approve/[token]` is in the output; the local
prerender errors are the pre-existing missing Clerk publishable key and
hit `/_not-found` identically.

**Not yet exercised against a live database or a real send.** Migration
0086 applies on next deploy via `scripts/migrate-on-deploy.mjs`. The
per-phase live checks in the build spec are the acceptance tests and all
of them remain outstanding.
## What was built — QuickBooks recurring retainer + onboarding merge fields (2026-07-29)

Two pieces of Jen's onboarding spec. Migration `0104`.

**Recurring retainer invoice.** Bruce's two answers: recurring MONTHLY,
created as a draft rather than sent. No re-authorisation needed — the
existing accounting scope already covers writing invoices; only the
Payments API would have needed more, and this doesn't touch it.

**`Active: false` is the safety line.** `RecurType: Scheduled` with
`Active: false` means QuickBooks holds it as a template that does not
fire and does not email anyone until a human activates it there. A bug
here must not be able to invoice a client, or invoice them twice, before
anyone has looked — that failure reaches a client's bank account, not a
screen.

0104 stores `qbo_service_item_id/name` + `qbo_tax_code_id/name` on
`orgs`. A QBO invoice line REQUIRES an `ItemRef` and the id is specific
to this QuickBooks file, so there is no sensible default and guessing
would post coaching revenue against whatever item happened to be first.
Chosen once at Settings → QuickBooks billing (master_admin only — which
revenue account coaching income posts to is the practice owner's call).
The item list is filtered to `Type='Service'`; offering inventory parts
invites billing a coaching fee against a stock item.

Every precondition refuses with a specific sentence rather than a
generic failure: no item chosen, no QBO customer linked to the lead, no
monthly fee set. Billing day clamped to 1–28 so February can't silently
shift the date. The button sits beside the monthly fee on the client
page — it bills exactly that number, and seeing the two together is what
makes the amount checkable. Two clicks, with the confirm step stating
the amount and the day.

**`{{availability_link}}`.** The last hand-step in the onboarding email:
the link existed, but reaching it meant opening the record, pressing
Generate, copying, pasting — four chances to paste the previous client's
link into this client's email.

**It is the only merge field with a side effect** — resolving it CREATES
a request row, where every other variable only reads. So it is minted
only when the template text actually references it
(`templateUsesVariable`); resolving unconditionally would leave a live
link behind every time somebody previewed an unrelated template — a URL
that submits real availability against a real client, issued by nobody
and watched by nobody.

Create-or-reuse moved to `lib/scheduling/availability-token.ts` so the
button and the merge field share one implementation. Two copies drifting
apart means a client holding a link that writes to a row the record
isn't reading. Reuse of an *unanswered* request also makes drafting the
same email twice yield the same link rather than orphaning the one
already sent. On failure the placeholder is left visibly unresolved
rather than dropped.

**Verified:** `tsc --noEmit`, `next lint`, `next build` all clean.
**Not exercised live** — the acceptance tests are a recurring invoice
appearing inactive in QuickBooks, and an onboarding draft carrying a
working availability link.

---

## What was built — PDF markup and page editing (2026-07-30)

Bruce's ask, arrived at in two steps: first "could we build a PDF Adobe Pro
type app", then the sharper version — "what I really need is to be able to
edit a PDF and mark it up", internal only, no client-facing surface.
Migration `0106`.

**Marking up is an overlay; editing text is not.** That distinction is the
whole reason this was buildable. Drawing on top of a page never touches the
content stream, so highlight / pen / typed notes / white-out are ordinary
geometry. Changing the words inside an existing paragraph so the text
reflows is the actual Acrobat engine and is not attempted. Cover-and-retype
(a white rectangle plus a text box) is provided instead, which is what
"editing" a line in a PDF amounts to visually anyway.

**Markup is stored as rows, not written into the file.** pdf.js ships its own
AnnotationEditorLayer which would have saved real PDF annotations, and it was
rejected: an annotation inside the file is no longer queryable, cannot be
reopened for editing without round-tripping the document, and could not
later be resolved or assigned. As rows in `document_annotations` they are
ordinary application data, and burning them into a PDF becomes an export
step rather than the storage format. It also avoids depending on pdf.js's
semi-internal viewer API, which moves between versions.

**Export is flattened, deliberately.** A native annotation can be dragged or
deleted by whoever opens the file, which is wrong for a marked-up document
going to a client — the markup is a statement about the document, not a
suggestion. Flattening also renders identically in Preview, a phone mail
client, and a printer, none of which agree on annotation rendering.

### The coordinate contract, which is where this silently goes wrong

`x/y/w/h` are fractions of the page's CROP BOX with a BOTTOM-LEFT origin —
normalized PDF user space, never screen pixels. Capture converts every point
through pdf.js's `viewport.convertToPdfPoint()`, so zoom level and the page's
`/Rotate` are both resolved before storage. Consequences: a mark made at 150%
lands correctly at any other zoom, and the burn step needs no rotation maths
to POSITION anything.

Crop box rather than media box because pdf.js renders the view box; on any
print-prepped PDF where the two differ, normalizing against the media box
offsets every mark by the inset.

Text is the one thing that still needs the rotation: a page with `/Rotate 90`
displays rotated clockwise, so glyphs drawn unrotated would appear sideways.
pdf-lib rotates counter-clockwise for positive degrees, so drawing at
`+angle` cancels it. Same reasoning gives the wrap width — on a quarter-turned
page the reading direction runs along the user-space Y axis, so the box
HEIGHT constrains line length.

### Page operations burn markup first

`delete` / `rotate` mutate in place (preserving form fields, outlines and
links, which pdf-lib does not model); `reorder` / `extract` rebuild via
`copyPages` and do drop those extras.

Annotations carry a page number, so deleting page 3 would leave every mark on
pages 4-plus attached to the wrong page. The three options were remapping
coordinates (only correct for reorder), refusing page ops while markup exists
(arbitrary), or baking the markup down before changing the page set. Burning
is the only one that cannot misplace a mark. The new version therefore starts
with no annotation rows and the previous version keeps both its file and its
editable markup.

**Every write is a new version.** Nothing here can overwrite an original,
which is what makes the editor safe to point at a signed contract. Mirrors
the first ground rule of the Cowork `workplaces-pdf` skill.

### Two traps that cost a build each

1. **The pdf.js worker cannot go through the bundler.**
   `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` compiles
   and webpack emits the asset — then Terser minifies that emitted file as a
   classic script and the worker's own `import.meta` is a syntax error
   (`static/media/pdf.worker.min.<hash>.mjs from Terser`). It is copied into
   `public/` by `scripts/copy-pdf-worker.mjs` from `prebuild`/`predev`
   instead, where nothing processes it. Copied rather than committed so the
   worker stays pinned to the installed library version — a mismatched pair
   fails at parse time with an unhelpful error. Gitignored.
2. **pdf.js v6 changed two APIs.** `page.render()` now wants `canvas` (not
   `canvasContext`), and `destroy()` lives on the loading task — the document
   proxy only exposes `cleanup()`, which frees parsed pages but leaves the
   worker running.
3. **pdfjs-dist is PINNED to 5.4.x, and 6.x must not be installed without a
   real browser test.** 6.2.108 calls `Map.prototype.getOrInsertComputed` —
   a method that only exists in Chrome 142 and equivalents — in BOTH its
   modern and its legacy build, with no polyfill. Below that floor the
   library throws before the first page renders, so the editor does not open
   at all rather than degrading. Nothing in the type system or the build
   catches this: `tsc`, `next lint` and `next build` were all green on
   6.2.108, and it failed the moment a browser executed it. The floor buys
   nothing either — the whole feature uses only `getDocument`, `getPage`,
   `getViewport`, `render` and the two viewport converters, all stable since
   v3.

### Smaller things worth remembering

- `toWinAnsi()` in `lib/pdf/annotations.ts` is not optional. pdf-lib's
  standard fonts are WinAnsi and THROW on anything outside it, so a single
  curly quote pasted from Word would fail an entire export.
- `parsePageRange` lives in its own `lib/pdf/ranges.ts` because the browser
  needs it and `page-ops.ts` imports pdf-lib at module scope — importing it
  from there would ship the whole PDF writing library to the client.
- `lib/documents/new-version.ts` has NO `"use server"` directive: it writes
  documents without doing its own authorization, so making its exports
  browser-reachable POST endpoints would be a hole. Same reasoning as
  `lib/integrations/fireflies-sync.ts`.
- Access is enforced by `withEngagementContext`, which already checks the
  per-Business-Builder client grants — so a coach restricted to their own
  book cannot mark up another coach's client document by pasting an id.
- Restricted to ENGAGEMENT documents. A prospect document has no engagement
  to resolve and therefore no access rule to check; deciding who may edit
  those is a separate authorization question, and `getDocument` already
  declines them for the same reason.
- Markup colours add a highlighter yellow and a correction red to the brand
  palette. A narrow, deliberate exception: these are tool colours, ink in a
  pen. All surrounding chrome stays on the brand hexes.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build` compiles
successfully with the prerender baseline unchanged (76 failures, 152
`Missing publishableKey`, zero errors of any other cause). The burn and
page-op layer was exercised through 24 assertions covering every markup
kind, non-WinAnsi text, stale page references, rotated pages, additive
rotation, sequential ops, the refusals (delete-every-page, partial reorder)
and range parsing — all pass. Burned output was also rasterized and read:
marks land on their targets, the highlighter multiplies so text shows
through, and multi-line text stacks downward in both upright and rotated
orientations.

**The coordinate contract has now been exercised in a real browser** —
headless Chromium 141 driving the actual pdf.js build through the exact
`toNorm` / `toPx` helpers from `PdfPageSurface`. Pixel→normalized→pixel
round-trips are exact to ~1e-13 px at 50/100/150/200% on both an upright and
a `/Rotate 90` page, and the same screen position resolves to bit-identical
normalized coordinates at 75% and 150% (zoom invariance). The decisive check
is visual: overlay probes positioned by the BROWSER from stored coordinates
land exactly on ink burned by the SERVER from those same coordinates, on both
page orientations — capture space and burn space are provably the same space.
That test is what caught the pdfjs-dist 6.x compatibility floor above.

**Still not exercised against a live database, and the UI itself has not been
clicked.** Migration 0106 applies on next deploy via
`scripts/migrate-on-deploy.mjs`. The acceptance test is opening a real client
PDF at Documents → Mark up, drawing on it, saving a marked-up copy, and
confirming the new version appears in the document list.

**Deliberately not built:** OCR (so highlighting a SCANNED page has no text
layer to select — pen and free-form marks work), compression, moving or
resizing a mark after it is placed (delete and redraw), and any client-portal
markup surface.

---

## What was built — Edit text, and the markup page's missing container (2026-07-31)

Bruce's first look at the shipped editor: the toolbar ran to the window
edges, and he wanted Acrobat's "edit the words that are already there".

**The layout bug was a missing wrapper, not styling.** Every other console
page renders inside `max-w-4xl mx-auto px-6 py-8`; the markup route returned
a bare `space-y-6` div, so it inherited the layout's full width with no
padding at all. Now `max-w-[88rem] mx-auto px-6 py-8` — wider than 4xl
because a page at 150% needs the room, padded the same as everything else.

**Edit text replaces a line without touching the content stream.** pdf.js
`getTextContent()` returns every run with its string, its transform and its
width in UNSCALED user space — which is the space annotations are already
stored in. So a run converts straight to a normalized rect with no viewport
maths, and clicking one writes TWO marks in creation order: an opaque white
rectangle over the old words, then a text box pre-filled with them, opened
for typing. Creation order is paint order, so the cover can never land on top
of its replacement.

This is cover-and-retype automated, and calling it that matters — the
paragraph does not reflow, and the replacement renders in Helvetica, so a
different original font looks slightly different. The alternative is the
actual Acrobat engine.

The run's `transform[4]/[5]` is the BASELINE origin, not the top-left, so the
cover rect is padded a quarter of the font size below it and the box is
1.2× the size tall — otherwise the descenders survive the white-out. The
replacement box is given 1.6× the original width because retyped text is
rarely the same length.

Text content is fetched only while the tool is selected — parsing it is
wasted work for someone who only wants to highlight. A page with no
selectable text says so plainly and points at White out + Text, because a
scan is the one case where this tool legitimately cannot work.

`onCreate` now RETURNS the new mark's id. Without that the surface could not
open the replacement for editing, since the id is minted in the parent.

**Verified in the browser harness:** text-run hotspots computed by the same
formula wrap every line of glyphs tightly on both the upright and the
`/Rotate 90` page — the rects come out of `rectToCss`, so rotation is handled
by the existing contract rather than by new maths.

### Polish pass — font matching, whole lines, undo, move/resize

Four things that would bite in the first ten minutes of real use.
Migration `0107` adds `document_annotations.font` (nullable; NULL = Helvetica,
which is what every mark written before it is, so no backfill).

**Replaced text now matches the original font.** Always retyping in Helvetica
makes an edit obvious the moment the document is set in anything else, and
client contracts are usually Times. pdf.js reports a font family per run and
the PostScript name carries the weight and slant (`ABCDEF+TimesNewRomanPS-
BoldItalicMT`), so `matchStandardFont()` picks the closest of the twelve
standard faces. The key has to be PERSISTED or the burn step would fall back
to Helvetica and undo the whole point — hence the column.

Only the standard fourteen, deliberately. Embedding the document's ACTUAL
font would close the last of the gap, but subset fonts routinely lack the
glyphs a replacement needs, and that fails at export rather than at the click.

**Fragments are merged into lines.** A PDF splits one visual line into several
runs whenever the font, size or kerning changes, so "Peter Williams — Site
Supervisor" could be three separate edits. Anything sharing a baseline
(tolerance scaled to the type size, since a 6pt footnote and a 24pt heading
have no sensible fixed threshold) is one clickable line — the unit Acrobat
edits too. Spaces the PDF implied through positioning rather than through
space characters are re-inserted when the gap exceeds 0.18em.

**Undo is inverse operations, not snapshots.** Each entry says what to put
back and what to take away, which covers create, delete, edit, clear-page and
drag with one shape — because `saveAnnotation` is an upsert keyed on the
client-minted id, restoring a deleted mark and reverting an edited one are the
same call. Snapshots would have needed a diff against the server on every
undo. Capped at 40; this is a convenience, not a document history.

**Drag to move, corner handle to resize.** Deltas are taken in NORMALIZED
space — both the start and current point go through `toNorm` and are
subtracted — so a drag behaves correctly at any zoom and on a rotated page,
where screen x is not page x. Live updates are local-only and the move
persists once on release, so a drag is one write and one undo step rather than
one per frame. Ink is excluded from resize: its shape is a path, and scaling
the bounding box would not scale the stroke with it.

**Verified:** font matching exercised through 10 real-world font names
(Times/Arial/Courier/Consolas/Calibri/Georgia with bold and italic variants);
all six representative fonts burned and rasterized, and they render visibly
distinct; a NULL font still falls back to Helvetica, so pre-0107 rows are
safe. Line grouping checked in the browser — 7 fragments collapse to 4 lines
on the rotated page and the boxes wrap each line.

**Buddy and the module guide updated.** The Buddy system prompt gained a PDF
markup entry covering every tool, the new-version guarantee, and both real
limits (no reflow, no text layer on scans) so it answers honestly rather than
overselling. `ModuleReference`'s Documents card now names Acrobat as the
thing this replaces. The other recent changes — own-book scoping, the
recurring QuickBooks retainer, `{{availability_link}}` — were already in the
prompt and needed nothing.

---

## What was built — one follow-through list per meeting (2026-08-03)

Bruce, on the Meetings library: "why are there two options to pull draft
to-dos?" There weren't — the top button drafted commitments, the bottom
one drafted a long-form document — but the labels differed only in a
caption above them, so it read as duplication. Pulling that thread got
to the real ask: **the transcript in the client portal, everything it
produces landing in one place for him and Jen to review, edit and
assign, plus a way to add what it missed.** Migration `0109`.

**Four decisions Bruce made before anything was written:** merge into one
list called action items (the nine document types become a tag); the
central area is the meeting itself; full transcripts visible to EVERYONE
in the engagement; each transcript released by hand.

**The merge was checked against the data before it was agreed to.** The
`deliverables` table held exactly ONE row — an in-progress Stages of
Growth assessment, 8,780 characters, undelivered, no document attached —
and nothing in the schema referenced it by foreign key. That is why the
merge was cheap. With forty delivered documents in there the advice
would have been the opposite, and the check is the difference between a
recommendation and a guess. **Size the blast radius before agreeing to a
destructive change, not after.**

### `deliverable_type IS NULL` is the whole discriminator

NULL means an ordinary commitment; set means the row IS one of the nine
documents. Deliberately not a `kind` flag beside a nullable type — two
columns can contradict each other (flagged a deliverable with no type,
or typed but flagged a task) and one nullable column cannot.

Lossy in one direction, knowingly: `review` collapses into
`in_progress`, `archived` into `done`, and `delivered_at` /
`completed_by` are gone in favour of status `done` + `updated_at`. So a
finished document's completion date drifts if the document is edited
later. That is the price of one list and Bruce accepted it. `document_id`
was carried across rather than dropped — a deliverable's whole point is
that it eventually becomes a file.

The INSERT and the DROP sit in one implicit transaction: a failed copy
means the table is still there, so the row cannot be lost in the gap
between the two statements.

### The gate the old table never had

`createDraftPlaceholder` used to insert a `deliverables` row that was
**client-visible from the moment it existed**. Drafted documents now
land as `status: 'draft'`, which is the status the portal filters out
for every client role. A machine-written document is a proposal until a
Business Builder has read it. Same for the failure notice a broken
drafting run leaves behind — "Draft failed" must not be one status flip
away from a client reading it.

### Double-counting was the trap the merge created

Once documents live in `action_items`, every query that had counted
"action items" silently counted documents too, while the separate
documents query counted them again. Six surfaces were affected: the EA
daily briefing, the Friday rollup (both "completed this week" and the
overdue chase), the engagement page, the Gantt, and global search —
which already searched `action_items`, so its separate deliverables pass
would have listed every document twice under two different labels, and
was deleted outright.

`lib/deliverables/query.ts` holds the one definition —
`isPublishedDeliverable()`, `isPlainCommitment()`, the status mapping
and `deliverableCompletedAt()`. Seven hand-written copies of the same
WHERE clause is how they drift apart; same reasoning as
`lib/ea/held-sessions.ts`.

Every one of those queries also excludes drafts. An unreviewed draft
must not be counted as work in flight, chased as late, listed in a
renewal proposal to a paying client, or — worst — fed to the model that
drafts CLIENT-VISIBLE agenda items.

**`deliveredAt: actionItems.updatedAt` was wrong and nearly shipped.**
Selected directly, every in-flight document has a non-null `updated_at`,
so the Gantt would have plotted the whole book as delivered today. It is
derived from status in JS, not selected in SQL.

### Transcripts: lazy, and released one at a time

`engagement_meetings` never stored the words, only a Fireflies link.
`transcript_text` is filled on FIRST OPEN, not by the sync: the hourly
sync calls `fetchMeetingDetail`, which deliberately omits sentences, and
pulling full bodies there would mean 235 large payloads to store text
most of which nobody ever reads. Transcripts are immutable once
recorded, so the cache never goes stale. `lib/meetings/transcript.ts`
has NO `"use server"` — an unguarded function that bills Fireflies per
call and returns a client's verbatim session must not be a
browser-reachable endpoint. Same rule as `fireflies-sync.ts`.

**`transcript_shared_at` defaults NULL and nothing publishes
retroactively.** Bruce chose full transcripts for every role in the
engagement, employees included; that is only safe because release is per
meeting and deliberate. A column defaulting to `now()` would have
published sixteen clients' back catalogue on deploy. The portal gates on
`transcript_shared_at`, never on the presence of `transcript_text` —
getting that backwards would publish every session a Builder had merely
opened to read. Sharing refuses if the body cannot be fetched, so a row
can never be marked shared with nothing behind it.

### The workspace

`/business-builder/engagements/[id]/meetings/[meetingId]` is the one page
per session: recap, transcript with its release control, drafts awaiting
review, published items, and the manual add. The meetings index links
into it and shows a waiting-for-review count; the two rival buttons are
gone, and so is the SECOND copy of the same pair that sat on the BBS
session detail page.

One drafting control replaces both: a picker whose first option is
"To-dos & commitments" and whose rest are the nine documents. The choice
survives because it was always real — several short commitments versus
one long document — but it is one question now rather than two buttons.

`engagement_meeting_id` is a real FK, not the loose
`fireflies_transcript_id` text that already existed: text cannot be
indexed against the meeting row and nothing stopped it naming a
transcript we never synced. `createActionItem` validates it belongs to
the target engagement inside the bound transaction — RLS blocks
cross-org but NOT cross-engagement-within-org, so an unvalidated id
would put one client's commitment in another client's workspace. Same
guard the `bbsSessionId` and `agendaItemId` links already had.
`deliverableType` joins the restricted-field list, so a `client_manager`
updating the status of their own item cannot also retype it as a
business plan.

0109 backfills the meeting link from the transcript id both tables
already carried — without it the workspace would have opened empty for
every session already held. All 15 existing items linked.

### Action item cards

Halved in height, separately from the above and at Bruce's ask: the
title was set at `text-2xl` with the status pill on a row of its own, so
three items filled a screen. Pill, title and quality-gate badges now
share one line, the description clamps to one, and the metadata reads as
a single dotted string.

**Verified:** `tsc --noEmit` and `next lint` clean. `next build`
compiles: 74 prerender failures and 148 `Missing publishableKey` errors,
zero of any other cause — exactly the recorded 76/152 baseline less the
two deleted deliverables pages. Migration 0109 was applied against the
LIVE database inside a transaction forced to roll back: 15 → 16 action
items, the Crown and Ember assessment carried across with all 8,780
characters, transcript columns added, 15 meeting links backfilled, table
dropped — then rolled back, database unchanged.

**Not yet exercised against a real deploy, and the UI has not been
clicked.** 0109 applies on next deploy via `scripts/migrate-on-deploy.mjs`.
The acceptance test is opening a synced meeting's workspace, drafting
to-dos from it, editing and assigning one, publishing it, adding a manual
item, and releasing the transcript — then confirming it appears in the
client portal and that an unreleased one does not.

## What was built — the recap you can actually work with (2026-08-03)

Bruce, on the first recap approval email: the approve links 404. Three
faults, each hiding the next. No migration.

**The 404 was a one-segment URL.** `reviewUrl` was built as
`/business-builder/sessions/<sessionId>`, where the route is
`/sessions/[engagementId]/[sessionId]`. The session id landed in the
`engagementId` slot, matched no engagement, and the page called
`notFound()`. It is also the email shell's `buttonHref`, so the most
prominent button in the message was the dead one while the "Approve and
send" button beside it worked fine.

Both of the suspected causes were wrong, and the data said so before any
code changed: `consumed_at` is NULL on all seven recap tokens ever
minted, so no mail scanner had burned anything, and `peekApprovalToken`
does a plain SELECT with no UPDATE. A bogus token POSTed at production
returned **410**, not 404 — which is what proved the route healthy and
sent the search upstream. **Every failure path in that route returns
410; a 404 can only come from somewhere else.**

**Fixing the segment would have been the wrong repair.** The BBS session
record holds a scheduled time, a status and calendar-sync notes —
nothing about the recap. "Needs an edit first?" led to a page with
nothing to edit. The link now points at the meeting workspace, and the
meeting id comes from the `engagement_meetings` lookup already running a
few lines above for the transcript summary, so it costs no extra query.

**`session_recaps` was rendered NOWHERE in the app** — one file outside
`lib/` referenced it, the approve route itself. So the only two options
for a drafted recap were "send exactly what the model wrote" or "send
nothing". `components/meetings/RecapPanel.tsx` + `lib/actions/session-
recaps.ts` close that: read in full, edit subject and body, save, send.

Markdown is the source of truth for an edit and the HTML and plain-text
bodies are DERIVED from it on every save — the portal renders markdown
and the email renders HTML, so storing an edit to one of the three would
let the client's emailed copy and their portal copy say different
things. `markdownToEmailHtml` returns a whole `<!DOCTYPE html>` document
and `body_html` is embedded as a FRAGMENT, so the wrapper is stripped.
Editing is draft-only: once sent, the text is the record of what the
client was told.

Sending delegates to `approveSessionRecap` — the same function the
emailed link calls, so the portal record, the write ordering and the
"stamp `sent_at` only after delivery succeeds" rule cannot drift between
the two entry points. Both actions gate on Clerk AND
`canCurrentBbAccessEngagement`.

**The recipient count is stated before the button and changes its
label** — "File it" rather than "Send to client" at zero. Of the two
drafts today A&M reaches 1 contact and Impactica 0, so both branches are
live right now.

**Caught in review, worth remembering:** the update's WHERE clause was
first written as `eq(...) && eq(...) && eq(...)`. JavaScript `&&` on
Drizzle conditions returns the LAST operand, so the guard would have
collapsed to `status = 'draft'` and rewritten **every draft recap in the
database**. Use `and()`. Nothing in `tsc` catches this — the types line
up perfectly.

**"MISSED" on sessions that plainly happened.** Same root as the
2026-07-29 `sessionWasHeld` fix, on the read side of the UI this time:
nothing writes `completed` except a person pressing "Mark complete", so
every past session rendered "Missed" in orange — including the two we
hold Fireflies recordings of, on the very page opened to review their
recaps. A transcript is evidence, so a recorded past session now reads
"Held" in the neutral tone; only a past session with NO recording keeps
"Missed" and the alarm colour, where it is doing real work.
`sessionStatusLabel` in `components/sessions/utils.ts` is the one
definition, imported by both the list and the detail view.

**An emailed link cannot be repaired retroactively** — the URL is baked
in at send time, so recap emails already sent keep the broken one for
ever. Worth stating in any future fix to a link that ships inside mail.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles with 74 prerender failures / 148 `Missing publishableKey` and
zero errors of any other cause, matching the baseline. The workspace
recap join was run against the live database and resolves both existing
drafts with correct recipient counts. **Not yet clicked in a browser** —
the acceptance test is opening a meeting workspace, editing a recap, and
sending it.

**Still open from this session:** no `time_block` approval token has
ever been minted, and that one is not a bug. Time blocks are proposed
only for the recipient's OWN commitments and **no action item in the
practice is assigned to Bruce or Jen** (14 drafts sat unreviewed on
Crown and Ember; 1 open, 1 in progress). Publishing and assigning that
backlog is what lights it up.

### The calendar sync had never seen a future event

The agenda half of that conclusion was WRONG, and the way it was wrong
matters. "No agenda has been drafted because A&M has no upcoming
session" was read out of our own `bbs_sessions` table. Bruce's reply —
"have a look at my calendar and tell me if you don't see any A&M
Abatement scheduled" — surfaced four upcoming A&M sessions (13 and 27
Aug, 10 and 24 Sep). The app had none of them, and no upcoming session
for ANY client. **Checking our copy of a thing is not checking the
thing.** The source was one MCP call away.

Both Google event listings made a single request with `maxResults` and
read `data.items` once, never touching `nextPageToken`. With
`orderBy=startTime` that does not return a sample — it returns the
OLDEST N events in the range and stops. The sync reads 180 days back and
120 forward, and any working calendar carries far more than 250 timed
events in ten months, so the response never reached the present day.

Measured against the live calendar: the first 250 timed events in the
window run 4 Feb → 16 Apr, with a `nextPageToken` nobody followed. The
database agreed exactly — the newest sessions the sync had ever created
were dated 8–10 April. It ran hourly, reported success, inserted rows,
and had not seen a present-day event in months.

**`maxResults` is a PAGE size, not a range limit.** That single
misreading starved every feature needing a NEXT session: no agenda had
ever been drafted, the briefing's next-seven-days was empty, and recaps
had no next session to point at. `listAllEventPages` follows the tokens
for both callers, and its 12-page ceiling is LOGGED when hit rather than
swallowed — a silent cap is what caused this.

`listExternalEvents` had it too, and there truncation is worse than
useless: it feeds the EA's free-time search, so unread events look like
FREE time and a focus block gets proposed on top of a meeting.

This is the same family as the cron/`ensureUserProfile` traps — a job
that runs, reports success, and does a fraction of its work. **The tell
is the same every time: output that is consistently the wrong SHAPE
rather than absent.** Sessions that were always months old should have
read as loudly as no sessions at all.

**It worked.** The first sync after deploy took `bbs_sessions` from 203
to 461 and gave 15 clients upcoming meetings where the app had none. The
next morning's briefing drafted the **first agenda proposal in the
app's history** (Impactica, 5 talking points off the last transcript)
and minted the first `agenda_proposal` approval token ever.

**And it broke something, which is the part worth carrying.** Importing
258 historical sessions at once meant 180 of them rendered orange as
"MISSED", 37 on portals real clients can see. The label was always an
inference the server had explicitly declined to make — `held-sessions.ts`
says a past session that was not cancelled was HELD — and it only looked
survivable while the sync was importing a trickle. The pill now obeys
that same rule: past and not cancelled reads "Held", neutral, never
orange. There is no "Missed" any more. A genuinely missed meeting no
longer flags itself, which is the accepted cost, because it never did
reliably — it depended on a click nobody makes. **Fixing a starved
integration can dump months of backlog into surfaces sized for a
trickle; check what the new volume renders as before calling it done.**

## What was built — the client can set the agenda (2026-08-04)

Bruce's ask: let the client add agenda items they want covered in the
next meeting. Migration `0110` (one enum value, alone in its file).

**Almost none of this was new plumbing, and that is the finding.**
`agenda_items` has been generic across ANY `bbs_session` since 0084, and
`canContribute` in `lib/actions/agenda-items.ts` has always excluded only
`prospect` — so every client role could already write to an agenda. What
was missing was a surface: agendas rendered on exactly one page, the
internal team touch-base. Neither the client portal NOR the Business
Builder's own client-session page showed an agenda at all. **Check
whether the permission already exists before designing a permission
model.**

### Two decisions Bruce made before anything was written

**Straight on, not a request queue.** A client's point lands on the real
agenda immediately, badged "Client raised". The rejected alternative —
pending items the coach accepts — would have been a second inbox to work,
and would have shown the client "awaiting review" where they expected
their own words. It also matches what the agenda already was: a thing
anyone in the engagement may add to.

**Email now AND in the briefing.** Both, because they fail differently.
A point raised at 8pm the night before a 9am session reaches a briefing
three hours before the meeting, which is not enough to prepare; and an
email read on a phone and forgotten is caught by the briefing on the day.

### The notification goes to the master org, not the client's

`notifyBuildersOfClientAgendaItem` runs under `withSystemContext`, not
the engagement binding the write used. Business Builders live in the
MASTER org, so a notification row carrying the client's `org_id` is
invisible to the bell — which reads under the signed-in user's own
tenant. The row would exist and reach nobody.

`lib/db/queries/engagement-builders.ts` resolves the ENGAGEMENT'S OWN
coach (`engagements.coach_id` → `coaches.user_profile_id`), falling back
to master admins only when there is no coach. Notifying every Builder
about every client is how own-book-by-default gets undone one
notification at a time.

`lib/actions/messages.ts` has the same shape and reads `user_profiles`
under the BOUND org, so a client posting a message notifies their own
colleagues and nobody on our side. Not fixed here — noting it because
it is the same defect one module over.

### The cross-org name gap, found while building

`listSessionAgenda` resolved raiser names inside `withEngagementContext`,
which binds to the CLIENT's org. Every Business Builder profile lives in
master, so on a client session that would have rendered every
Builder-raised point as "Raised by (nobody)" and every Builder-owned
commitment as "Unassigned" — reading as broken data rather than as RLS
working. Invisible until now only because agendas were shown solely on
the internal engagement, where everyone happens to sit in the master org.
People are now resolved in a separate `withSystemContext` pass. Not a
leak: every id came from a row the caller could already read.

### Where it renders

- `/portal/sessions/[id]` — the client's agenda, with the composer.
- `/portal/sessions` — a pointer card ABOVE the list, because "add
  something to the next one" is the main reason a client opens this page
  between sessions and there was previously nowhere to say it except a
  message not attached to the meeting.
- `/business-builder/sessions/[engagementId]/[sessionId]` — the same
  board, full controls. This page had no agenda before.
- The 07:00 briefing: a **"They asked to cover"** block, rendered ABOVE
  the AI-drafted agenda. A person telling you what they need outranks a
  model's suggestion, and one list would have flattened that difference.

`components/sessions/SessionAgenda.tsx` renders both sides from one
component so the two views cannot disagree. Deliberately NOT
`components/team/AgendaBoard` — that one takes `InternalTeammate[]`,
links into `/business-builder/...`, and defaults the assignee to "the
other person", all wrong when one side is a client. They share the server
actions and the read query, which is where drift would actually cost
something.

**Agendas close when the session starts.** A past or cancelled session
keeps its agenda as a record and takes no new points, on both sides. The
client composer also hides when `clientWriteBlocked` says the engagement
is paused — calling the real guard rather than re-reading the status, so
the form can never submit into a guaranteed refusal.

**The AI drafter needed no change**: `gatherAgendaContext` already passes
everything on the agenda as "already covered" and filters overlaps
afterwards, so client-raised points cannot be duplicated by the 07:00
proposal.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles with 74 prerender failures and 148 `Missing publishableKey`,
zero errors of any other cause — the recorded baseline exactly. The
briefing was rendered through `scripts/preview-ea-email.ts digest` and
read end to end. Live read-only checks: five clients now hold a
`client_lead` (A&M Abatement, Crown and Ember, North Central Farming,
Perfect Auto Wholesale, Summit Cabinets), and every one has upcoming
sessions — so this is usable the day it deploys. **Not yet clicked in a
browser.** 0110 applies on next deploy; the acceptance test is a client
adding a point and the email landing.

## What was built — the drafts that had already landed (2026-08-04)

Same session. Bruce, on the North Central Farming meeting workspace: "I
don't see any suggested action items." No migration.

**The drafts were there.** Eight of them, `created_by: claude`, correctly
linked to that meeting, written at 07:59 MT — while the page in front of
him said "Nothing waiting". Nothing was broken in the drafting at all.

The work runs in a Netlify Background Function, because it must: reading
an hour of transcript through Opus takes minutes and a synchronous
function on this plan dies at ~26s. So the server action returns when the
job is ENQUEUED, and `MeetingDraftControls` said **"Refresh to pick them
up."** That reads as a completed instruction, so the natural next move is
to look at the list below — which is still empty, because nothing has
been written yet.

**Same family as every silent-cron bug in this file, one layer up.** The
job runs, the job succeeds, and the surface reports nothing — so it looks
broken. The difference is that this one is a UI contract, not a cron:
telling a human to refresh is a way of making the machine's asynchrony
their problem, and they will read the stale screen as the answer.

The control now WATCHES instead of asking. It takes the current item
count as a prop, `router.refresh()`es every 12s while a run is in flight,
stops the moment the count goes up and says how many landed, and gives up
after six minutes with a message that admits it rather than spinning for
ever. The button stays disabled and the copy says "leave this page open"
— no instruction to refresh anywhere.

**Ruled out along the way, worth recording:** the `bbs.fireflies.attached`
Inngest event and the `firefliesExtract` function are still in
`lib/inngest/functions.ts` and still dead — nothing consumes them,
because Inngest is not what runs background work here.
`lib/ea/transcript-match.ts` already knows this and calls
`extractFromFirefliesAsSystem` directly with a comment explaining why.
The auto-attach path is fine; only the manual button had the feedback
gap.

**A second, quieter instance found in the same sweep, and fixed.**
`lib/actions/fireflies-extract.ts` wrote `bbs_session_id` and
`fireflies_transcript_id` on every item it created but never
`engagement_meeting_id` — and the meeting workspace queries by
`engagement_meeting_id` and nothing else. So drafts produced by the
SESSION path (the auto-attach, when `transcript-match` pairs a transcript
to a session and drafts straight off it) landed correctly in the database
and rendered on no page at all. Bruce's eight showed up only because the
manual button goes through `lib/meetings/action-item-extraction.ts`,
which does set the link.

`resolveEngagementMeetingId(engagementId, transcriptId)` now fills it on
both insert sites, resolved BEFORE the write transaction so a lookup
never sits inside one, and returning null rather than throwing when the
Fireflies sync has not caught up — a missing meeting row must not cost
the drafts. The pair (engagement, transcript) is the same key
`getMeetingWorkspace` joins the recap on and the one 0109 used to
backfill. Not retroactive: any pre-existing session-path draft stays
unlinked, and 0109's backfill has already run.

### The mirror image, and the leak it was hiding

Bruce, next question: "is 'What we decided' the action items?" It is
not — `buildRecapBody` builds it from the model's `decisions` array, and
the commitments live in a SEPARATE **"Who is doing what"** section built
from the database. Answering that exposed why he had never seen the
second section: **no recap in the database could produce one.**

`lib/meetings/action-item-extraction.ts` — the path behind the workspace
button, where drafts are actually reviewed and published — set
`bbsSessionId: null` explicitly, while the recap's commitments query
joins on `bbs_session_id` and excludes drafts. Measured before touching
anything: **36 of 37** Claude-drafted items in the last 30 days had no
session link, and `would_list` came back **0 for every recap in the
database**. Publishing every draft would not have changed that by one
row. The matching session existed the whole time.

Exactly the same defect as the `engagement_meeting_id` one above, in the
other direction. Two link columns, two readers, each write path filling
only the one its own screen reads. Both paths now write BOTH links,
resolved from (engagement, transcript id) — the same key
`getMeetingWorkspace` joins the recap on.

**One bug was masking a second, and repairing it first would have caused
the incident.** `listSessionActionItems` — rendered on the CLIENT-facing
`/portal/sessions/[id]` — had no draft filter at any layer. It has never
leaked purely because nothing carried a `bbs_session_id`. Writing the
link without fixing that would have published 35 unreviewed
machine-written drafts into five clients' portals in one deploy. The
filter now lives in the QUERY, not the page: the portal's action-items
list filters in its page component, which is precisely why this call
site forgot. **When a fix makes previously-dead data live, check what
reads it before writing it.**

**Verified:** `tsc --noEmit`, `next lint` and the build all clean against
the same baseline (74 / 148, nothing else). Live counts above are from
read-only queries. **Not clicked in a browser** — the acceptance tests
are pressing "Draft from this meeting" and watching drafts appear
without touching reload, and publishing an item then confirming it shows
under "Who is doing what" in that session's recap.

### Repairing the legacy rows without an exposure window

Bruce: "yes, complete it all." The obvious move — one UPDATE filling
every null `bbs_session_id` — was rejected, because linking a row to a
session is exactly what makes it reachable from the CLIENT-facing
session page. Running it would have made 33 unreviewed machine drafts
client-reachable the instant the statement committed, ahead of the
deploy carrying the query's draft filter. A data migration that is only
safe after a specific deploy is a migration waiting to be run in the
wrong order.

So the repair is split by whether the row is already client-visible:

**Published rows: a backfill script.**
`scripts/backfill-action-item-session-links.mjs` — dry run by default,
`--apply` to write. Only fills NULLs, only links where EXACTLY ONE
session matches the (engagement, transcript) pair, and reports ambiguous
or unmatched rows rather than guessing. Re-runnable. It touches
non-draft rows ONLY, by design, and says so in its output. **Applied:**
1 row (Crown and Ember), 0 ambiguous, 0 unmatched; non-draft items still
unlinked afterwards: 0.

**Drafts: they heal themselves on publication.** A self-heal block in
`updateActionItem` resolves and sets the session link when an item moves
out of `draft` and has none. The link therefore appears at precisely the
moment the item stops being a draft — which is the moment it is allowed
to be seen. No exposure window and no deploy ordering to remember, which
is strictly better than a backfill plus a rule someone has to follow. A
no-op for anything created after this date, since both drafting paths
now write both links up front.

Measured after: all **33** unlinked drafts resolve a session — checked
with an EXISTS predicate, not a LEFT JOIN count, because a join fans out
on multiple matches and inflates the number (the first version of this
check did exactly that and had to be redone). A client would see **1**
item across every session page, and it is published; zero drafts are
reachable.

Proven end to end against the live database inside a transaction forced
to roll back: a real NCF draft published → session resolved → recap's
"Who is doing what" query returns 1 → drafts visible to the client on
that session: 0 → ROLLBACK, database unchanged.

**Recaps do not gain commitments retroactively.** Every recap in the
database still lists zero, correctly: their sessions have no PUBLISHED
items yet. They populate as Bruce works the 33 drafts. Two document
placeholders carry no transcript id and so never resolve a session —
acceptable, a document is not a commitment and does not belong in that
section.

**Verified:** `tsc --noEmit`, `next lint` and the build clean at the
same baseline (74 / 148, nothing else).

### A client's message reached nobody either (same session, same cause)

Flagged while building the agenda notification, then confirmed on live
data: **one** client message had been posted in Communication and **not
one** engagement-message notification had ever been written to a
Business Builder. The only Builder notifications in the database were
prospect alerts. It sat unread, indistinguishable from a client with
nothing to say — the identical failure shape as the silent crons.

Same cause as the agenda bug, and the module's own comment said so
without anyone noticing what it implied: *"Members live in the
engagement's (client) org."* `createMessage` selected `user_profiles`
under the BOUND org, and Bruce and Jen are in the master org, so the
recipient list could never contain them. Not a filter that excluded
them — a query that could not see them.

`notifyBuildersOfMessage` runs after the bound transaction commits,
under `withSystemContext`, writing the row with the Builder's OWN org id
(a client-org row would be invisible to the bell) and emailing the
engagement's assigned coach. **Client-authored messages only** — a
Builder posting into their own client's thread must not notify
themselves, and notifying the other Builder about a client that is not
theirs is exactly the cross-book noise own-book-by-default exists to
prevent.

Notification feed renders `client_message` → "X sent you a message",
linking to that engagement's coach-side thread.

**Verified:** `tsc`, `next lint`, build all clean at 74 / 148. **Not
exercised live** — the acceptance test is a client posting and the email
landing.

## What was built — the preview that lied, and giving the client a way to act (2026-08-04)

Bruce, on the A&M portal preview: no section shows the Fireflies
transcripts; 16 action items are in the client portal that he never
assigned; the dashboard beside them says nothing is due; and the client
has no way to act on any of it. Four observations, three different root
causes, and one of them was not a bug at all. Migration `0114`.

### The transcripts were already there

`/portal/meetings` exists, is registered in `lib/modules.ts` with
`visibleTo: ALL_ROLES`, and no `portal_module_assignments` row turns it
off for anybody. A&M's client has been able to see 32 meetings, 29
recaps and 32 recording links the whole time.

What was missing was a way IN. The dashboard is the one screen every
client lands on and it had five cards, none of them meetings — so a
client with 32 recorded sessions saw three zeroes and no mention of the
record. **A module reachable only from the sidebar is a module the
person you built it for will tell you does not exist.** The card leads
with the most recent session, because "what did we agree last time" is
what brings someone back here between sessions.

The transcripts themselves being nearly all unreleased is correct and
deliberate (2026-08-03): 1 of 32 on A&M, 2 across the whole book.

### The drafts were never client-visible; the PREVIEW was

`app/portal/action-items/page.tsx` has always filtered drafts for
non-coach roles. What it filtered on was `profile.role` — and preview
mode set a cookie and changed nothing else, so a previewing Business
Builder is still `master_admin`, `isCoachLike` is still true, and the
coach view rendered underneath a banner reading "this is what they
see". Craig never saw those 16 drafts. Bruce did, and had every reason
to believe Craig did too.

**A preview that renders with the previewer's own role is worse than no
preview.** It is the surface whose entire job is answering "is this
safe to expose", and it was answering about the wrong person.

`lib/portal/viewer.ts` splits the two questions a portal page asks —
WHO IS SIGNED IN (authorization, stays `profile.*`, what every server
action re-reads for itself) and WHO IS THIS SCREEN FOR (`viewer.role`,
`viewer.userProfileId`). Preview swaps the second for `client_lead`,
the HIGHEST client role, so it shows the most any client could see: a
Builder asking "is this safe" gets the worst case, which is the only
useful answer.

It can only ever narrow. The swap is gated on the signed-in role
already being a coach one, so no cookie on a client session changes
anything. Writes are deliberately unaffected — the server actions
authorize on the real role, so preview hiding a control is a courtesy,
not the boundary.

**"Your open items" was the same bug wearing different clothes.** It
counted items assigned to `profile.userProfileId` — Bruce — on a client
engagement, which is always zero, under a heading saying "your". That
is why the dashboard and the list beside it flatly disagreed: one was
showing Craig's engagement, the other Bruce's workload. The viewer
resolves the previewed client as a stand-in, so the greeting and the
card now name the same person.

Most portal pages needed no change: their leadership checks already
include `client_lead`, so previewing renders identically. Four did —
action items (list and detail), apps, and session detail.

### The client genuinely could not act, and the form was the reason

This part of Bruce's read was exactly right, and worse than he thought.

`ActionItemForm` posted EVERY field on every save. `updateActionItem`
checks its restricted-field list by asking whether a key is present —
not whether it changed — so a client who touched nothing but the status
still sent `title`, and got back *"Your role can update status only —
not title."* The one action a client could theoretically take failed
100% of the time. Rendering the rest read-only would not have fixed it;
the PAYLOAD had to narrow, which is what `scope="assignee"` does.

The status pill on the list was disabled for every client role
outright, so the fast path did not exist either. It is now per item —
a client owns the status of their OWN work and cannot touch anyone
else's.

**Due date moved out of the restricted list.** An assignee owns when
their own work lands; the alternative is a client staring at a date
they know is wrong with no way to say so except a message not attached
to the item. Same "straight on, not a request queue" call as
client-raised agenda points, and for the same reason — a queue is a
second inbox for us and an "awaiting review" badge for them.

A non-assignee client now gets no form at all rather than a form that
can only be rejected.

### The silence on our side was the real defect

A client could always change the status of their own item, and nothing
anywhere recorded that they had. No row, no email, no bell. So "they
finished it last week", "they are stuck" and "they have not opened the
portal since March" were one observation: silence. **Same failure shape
as every dead cron in this file, except the thing going quiet is a
paying client working the plan.**

`lib/notifications/action-item-progress.ts` (0114 adds the enum value).
Resolves under `withSystemContext` and writes the row with the
RECIPIENT's own `org_id` — the fourth module to need that exact fix,
after assignment, messages and agenda points. Goes to the engagement's
own coach via `resolveEngagementBuilders`, so Jen is not told about
Bruce's clients.

Only CLIENT-driven changes notify: a Builder editing their own client's
item must not ring their own bell. Changes are measured by comparing
the BEFORE and AFTER rows, not by trusting the payload, so re-saving
the same date does not manufacture a notice. `sameDay()` compares the
ISO day because `due_date` is a `date` column and a plain `!==` on two
Date objects is always true — that alone would have reported a date
change on every single save.

Bypasses the working-hours window, because `sendEmail` DROPS an
out-of-hours message rather than queueing it (the queue its own header
describes was never built), so without the bypass a client marking
something done at 8pm would reach nobody, ever.

The bell's `action_item` branch said "Action item update" and linked to
the LIST. Now it names the item and deep-links to it — same
one-segment vagueness that made the recap approval links useless.

### Bulk transcript release

Release was one click per meeting, so opening a back catalogue meant 32
clicks. Nobody does that, which made "the client can read the
transcripts" true in the code and false in practice.

Still a deliberate act by a Business Builder who may act on that client
— one act instead of thirty-two, never a schedule, and
`transcript_shared_at` still defaults NULL so a newly synced meeting is
never released by a decision taken before it existed. Two taps, with
the count and its meaning stated before the second.

Sharing loops per meeting ON PURPOSE. A single `UPDATE ... WHERE` would
be one statement and would break the rule that makes the single-meeting
path safe — a row marked shared with `transcript_text` NULL shows the
client an empty transcript. Each release fetches its body first and is
skipped, and COUNTED, if it can't be had: a run that released 28 of 32
must not read the same as one that released all of them.
Un-sharing takes the opposite path deliberately — it needs no body, so
it is one statement and cannot partially fail. Taking something back
must not be able to leave half of it published.

### Also fixed

`app/book/page.tsx` (untracked, from an earlier session) spread a Map
iterator, which this tsconfig's target rejects. It failed `next build`
outright, so nothing else could be verified until it went.
`Array.from()` — same semantics, one line.

**Verified:** `tsc --noEmit` and `next lint` clean. `next build`
compiles: 74 prerender failures, 148 `Missing publishableKey`, zero
errors of any other cause — the recorded baseline exactly. Live
read-only queries confirmed the meetings/module/assignment picture
above (32 A&M meetings, 1 released; no module row disables `meetings`
anywhere).

**Not clicked in a browser, and no email has been sent.** Migrations
0112, 0113 and now 0114 are all still unapplied on the live database —
0114 queues behind the other two on next deploy. The acceptance tests:
preview A&M and see no drafts and no Draft chip; a client marks an item
in progress and Bruce gets the email; a client moves a due date and the
bell names the item; the dashboard shows the latest recap; and Release
all transcripts opens A&M's remaining 31.

## What was built — sharing a client, and the three lists that disagreed (2026-08-04)

Bruce: "add the option to add a second Business Builder to a specific
client — Jen and I would need to share some clients", and separately,
"remove Workplaces from the client Portal lists". No migration; the
`bb_client_access` table has existed since 0065.

**The permission already existed. What didn't exist was presence.**
`canCurrentBbAccessEngagement` has always honoured an explicit grant, so
a shared client could be OPENED by the other Builder. But
`coachScopeWhere` filtered on `engagements.coach_id` alone, so a shared
client appeared in none of their lists, none of their cross-client
views, and not in their morning briefing. **A client you can only reach
by knowing its id is not shared with you in any sense that matters** —
the exact inverse of the 2026-07-27 finding that a scoped list is not a
boundary. Here the boundary opened and no list followed.

### Three definitions of "this Builder's clients", and two were wrong

- `coachScopeWhere` — `coach_id = me OR coach_id IS NULL`. Right, minus
  shares.
- `listCoachEngagements` — for a coach WITHOUT `all_clients_access`:
  grants only, `return []` if none. Ownership not consulted at all.
- `listEngagementsForRecipient` (the EA) — same shape, same omission.

Migration 0093 flipped `all_clients_access` to false for every coach.
From that deploy Jen — false, **zero grants, one client owned
outright** — had an empty client switcher and, every weekday morning, a
briefing covering **no engagements at all**. It ran, reported success,
and said nothing, which is indistinguishable from a quiet week. Same
silent-failure shape as every dead cron in this file; the cause here was
two branches answering the same question more narrowly than the one that
had it right.

All three now read **owned ∪ shared** (∪ unclaimed, where that already
applied). `sharedEngagementIdsFor()` is the one definition. It reads
`bb_client_access` UNCONDITIONALLY, unlike
`getCurrentBbAccess().grantedEngagementIds`, which returns `[]` when
`all_clients_access` is true — that one answers "what are you limited
to", this one answers "what is also yours", and the second must not
depend on how broad your permissions happen to be.

Measured against live data before and after: Jen 0 → 1, Bruce 17 → 17.

### Sharing is organised by client, not by person

`setEngagementShare` + `EngagementSharePanel` on the engagement page.
The master-admin Team access matrix still exists and still manages the
whole practice, but it is organised by PERSON — so sharing one client
there means finding the right person and remembering which boxes were
already ticked. You have the client open when you decide to share it.

**Not master-admin-only.** The engagement's own coach can share their
own client; requiring Bruce for every share would make Jen ask
permission to hand her own client to him — a step with no decision
behind it. What a coach cannot do is share a client that isn't theirs:
`canCurrentBbAccessEngagement` is checked first.

The owner is shown but never toggleable — they hold the client by
ownership, and a switch that appears to remove their access while
changing nothing is a lie. Reassignment moves ownership. The action also
refuses a target who isn't `master_admin`/`coach`: without that check an
arbitrary `user_profiles` id would insert happily and hand a CLIENT a
Business Builder's view of their own engagement.

**`setBbUserAccess` no longer drops grants** when the target has
all-clients permission or is a master admin. That was right while a
grant meant only a restriction list — pointless for someone who sees
everything. Now a grant also means "shared with me", which is what puts
the client in their book; under the old rule, saving that page for such
a Builder silently un-shared every client they had been given.

### The Clients page had no filter of any kind

`/business-builder/engagements` — the page behind the "Switch client"
link — did `select(...).from(engagements)` with **no where clause at
all**. So it listed the practice's own internal workspace ("Workplaces
Team") as a client, which is what Bruce hit, and it showed every
Business Builder the whole practice's book regardless of scope. It was
the one place own-book-by-default never reached, and the most visible
one. Now scoped through `coachScopeWhere` and filtered on
`is_internal`.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles at the recorded baseline (74 prerender failures, 148 `Missing
publishableKey`, zero of any other cause). Old-vs-new scoping simulated
directly against the live database per Builder, as above. **Not clicked
in a browser** — the acceptance tests are Jen signing in and seeing her
client (and a non-empty briefing the next weekday morning), and Bruce
sharing one client with her and it appearing in her list.

## What was built — the drafting run that said nothing, and QC (2026-08-04)

Bruce: "All clients" doesn't give him the same reach as the assigned
Builder; Jen presses Draft on Crown and Ember and nothing comes up.
Migration `0115`.

### "All clients" didn't reach Soul File search

`searchSoulFiles` loaded candidates and then filtered them in JS on
`coachId === my coach row` — ignoring the mine/all toggle AND
master_admin. So flipping to All clients changed every other
cross-client surface and left this one searching your own book only,
even for the master admin, who can open any of those engagements
directly. It now uses `coachScopeWhere`, so one definition governs the
toggle, ownership and shared clients together instead of this call site
holding its own narrower idea of whose clients are whose.

Audited the rest: `calendar/sync.ts` is correctly per-person, and the
MCP bridge is scoped to the caller's own clients by design (Cowork has
no scope cookie to read).

`extractActionItemsFromMeeting` had NO per-client check — only "are you
a Business Builder" — so any coach could spend Claude credits drafting
off another coach's client's transcript by pasting a meeting id. Now
gated on `canCurrentBbAccessEngagement` like every other per-client
action.

### A failed drafting run left no trace anywhere

Crown and Ember's 30 July session: synced, 66 minutes, summary present,
**zero drafts, and no record of why**. Drafting runs in a Netlify
Background Function, which answers 202 the instant it is queued and then
runs alone. Every failure inside it — Fireflies returning nothing, the
Claude call erroring, the extractor's JSON failing to parse — went to
`console.error` in a log nobody reads.

So "this session produced no commitments", "the model call failed" and
"the job died" were ONE observation from the Business Builder's side:
press, wait, nothing. The UI could only say *"Still working, or it
finished with nothing to add"* — an honest sentence, and a useless one,
because it names the exact ambiguity it cannot resolve.

`meeting_draft_runs` (0115) is the receipt: opened before the work,
closed either way, carrying the error text. Same doctrine as
`ea_job_runs`, but tenant-scoped with the standard RLS policy because
this one IS client data and renders on that client's workspace.

`runAndRecordMeetingExtraction` wraps the existing function and
re-throws after recording, so the caller's logging is unchanged. Writes
never throw — a bookkeeping failure must not break the drafting it only
observes, the same rule `withHeartbeat` follows.

A run still `running` after 20 minutes is REPORTED as failed: the
background function's own ceiling is 15, so past that it died without
reaching its own error handler. Without that the page would spin for
ever on precisely the failures that never got to speak.

The panel now distinguishes three outcomes it previously collapsed:
the job failed *and here is why*, it succeeded and found nothing, or it
is still going. The last run's verdict shows even to someone who wasn't
watching when it finished — a failure overnight, or on the other
Builder's press, was otherwise invisible.

**The cause of Crown and Ember's empty run is still unknown**, and that
is deliberate: this fixes it to REPORT, not to work. The next press
either drafts or finally names the fault.

### Caught in QC, in my own work from earlier today

**Bulk transcript release would have timed out.** It is a synchronous
server action, and a transcript with no cached body costs a Fireflies
round trip — A&M has 31 uncached. Thirty-one sequential fetches blows
straight through Netlify's ~26s ceiling, and a killed server action
returns `undefined`, so the operator would have seen a generic failure
with an unknown number actually released. Each press now releases every
CACHED body first (free), spends a bounded 15s / 12-fetch slice on the
network, and reports what is left: "N still need pulling from Fireflies
— press again to carry on." Bounded and stated, never silently short.

**A client could have un-published their own item.**
`STATUSES_VISIBLE_TO_CLIENT` omits `draft` from the picker, but that is
the UI — the server accepted any value in the enum. A crafted request
would have dropped the item out of every client list (drafts are
filtered there) and surfaced it to us as something awaiting review that
nobody wrote. Refused server-side now.

**`listCoachEngagements` and `coachScopeWhere` had drifted again** — the
restricted branch omitted the unclaimed arm the other one has. Currently
moot (zero coachless engagements) and now identical clause for clause,
because divergence between those two is exactly what caused the empty
switcher this morning.

### Verified

`tsc --noEmit` and `next lint` clean; `next build` at the recorded
baseline (74 prerender failures, 148 `Missing publishableKey`, zero of
any other cause). Migration 0115 applied against the LIVE database
inside a rolled-back transaction: columns, RLS policy, all three foreign
keys (cascade on meeting and org, set-null on user), re-applied cleanly
to prove idempotency, then rolled back.

Six live QC assertions all pass: no draft is reachable from any client
session page (0), no transcript is marked shared without a stored body
(2 shared, 2 cached), the internal workspace is the only `is_internal`
row, every Builder resolves a non-empty book, the notification enum
covers every type the code writes, and 0115 is correctly absent until
deploy.

**Sharing was confirmed working in production, not by reading code** —
Bruce shared A&M Abatement, Impactica, Jean/Dorina and KS Developments
with Jen roughly thirty seconds apart, and the grants are in
`bb_client_access`. Her book went 1 → 5.

## What was built — onboarding asks for what it needs (2026-08-04)

Bruce, onboarding a client: it blocks on a monthly fee he can't find
anywhere to set and which the contract already states; there's no way to
set the recurring meeting, and clients already booked in his calendar
don't exist in the app; and the assessment deadline can't be chosen.
Migration `0116`.

### The fee blocker named a fix that could not be performed

`EngagementFeeControl` existed in the codebase and was **rendered by no
page**. The only fee input in the entire app was the new-lead form, so
for any client created earlier there was literally nowhere to set it —
and the pre-flight's "Set the monthly fee" link pointed at the client
page, which has no such control. That is the whole of "I don't know
where to set this": the answer was nowhere.

**A blocker must be fixable where it is raised.** The fee and the
assessment date now sit in the onboarding panel, above the button they
gate, and the blocker anchors to them.

**The fee was already being chosen and thrown away.** The
send-for-signature form picks a pricing tier (with an override for a
deal priced off-list) and renders it into the agreement as
`{{monthly_fee}}` — then `createEnvelopeFromComposed` never stored it.
The document named a price and the record held none. Steadfast
Construction is the live case: null on the lead AND the engagement,
while 17 other clients inherited theirs. The fee is now written to the
lead, and to the engagement when it has converted, at the moment the
agreement goes out — best-effort and non-fatal, because a bookkeeping
write must not stop a contract being sent.

### Recurring sessions: look first, then create

`session_series` has been generic across any engagement since 0084, and
`syncSeriesToGoogle` has existed just as long — but the only surface
that could create one was the practice's own touch-base. So a client
booked into a Business Builder's calendar every fortnight had a rhythm
in Google and nothing in the app.

Bruce's call between the three options, and the right one: **scan the
calendar first**. Most clients are already booked, so a create-only form
would have produced a rival series for every one of them and put a
duplicate invitation on the calendar. The panel lists the recurring
events on the Builder's own calendar, floats the ones whose title
matches this client's name, and adopts the chosen one in a click.
Nothing matches → then you set a cadence and the app creates the series
and pushes one recurring event.

An adopted series is **Google-owned**: occurrences are read and never
written back. The calendar is where the meeting was agreed, and a second
writer would fight the first.

`linkGoogleSeriesToEngagement` is the client counterpart to the existing
`linkGoogleSeries`, which hard-codes the internal engagement. It refuses
a recurring event already linked to a DIFFERENT client rather than
silently moving it — backed by the real
`session_series_google_event_uniq` index, so the explicit check only
buys a better sentence. The row carries the CLIENT's org, not the
Builder's; a master-org row would be invisible to every client-bound
read.

Linking or creating also clears the first-session blocker, because
materializing the series puts real sessions on the books — so the two
asks are one journey rather than two pages.

### The assessment deadline existed only as a sentence

The onboarding checklist told the operator to schedule the first session
"so the onboarding email carries a real assessment deadline". There was
no column, no control, and no line in the email. 0116 adds
`engagements.assessment_due_date`.

A `date`, not a timestamp — a day the client works to, not a moment. On
the engagement rather than per person, because it is one date quoted in
one email; per-person dates would have to be kept in step to say the
same thing and nothing ever wants them to differ.

Suggested three days before the first session and **never saved on the
operator's behalf** — the suggestion only pre-fills an empty field, so a
date on the record is always one a person chose. The email omits the
line entirely when there is none, rather than inventing one: a deadline
the client was never given reads as one they have already missed.

### Also

`setEngagementMonthlyFee` had only a role gate, no per-client check.
Fixed, along with the new `setAssessmentDueDate`.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build` at the
recorded baseline (74 prerender failures, 148 `Missing publishableKey`,
zero of any other cause). Migration 0116 applied against the LIVE
database in a rolled-back transaction — column created nullable as a
`date`, re-applied cleanly, rolled back.

**Not clicked in a browser.** The acceptance tests are: open Steadfast
Construction, see the fee and assessment fields in the onboarding panel,
and watch the calendar scan offer the real recurring meeting to link.

## The drafting record earned its keep in forty minutes (2026-08-04)

`meeting_draft_runs` deployed, and the first thing it caught was the
fault it had been built to expose.

Jen pressed Draft on Crown and Ember's 30 July session at 16:49 MT.
Recorded verdict: **failed — `Unterminated string in JSON at position
2888`**. Not a Fireflies problem, not a permissions problem: the
model's reply was cut off mid-string and `JSON.parse` died.

**`maxTokens: 4000` at three call sites, `stopReason` never checked, and
a bare `JSON.parse`.** An 81-minute session produced more commitments
than fitted in the cap, and the run threw away every item it HAD
written. This is precisely the fault the deliverable drafter hit on
2026-07-27 — fixed there, and never applied to the action-item
extractor, which is the path used far more often.

Raised to 16,000 (roughly ten times the longest real output measured:
14 items ≈ 2,900 characters). Both paths now run inside a background
function with a 15-minute budget, so the wall-clock that once justified
a small cap is gone.

**Truncation is checked, not inferred from the parse failing.** A reply
stopped at the cap can still happen to BE valid JSON, and silently
accepting that would drop the tail of the meeting with nobody noticing —
the worse of the two failures. `parseExtractorJson` in
`lib/ai/prompts/action-item-extract.ts` now owns the fence-stripping and
both checks; the two files that had identical copies of that parser call
it instead.

**The lesson is about the record, not the cap.** The cap had been
failing silently for as long as it had existed; nothing in the app could
say so. Forty minutes of a run-history table turned "the drafts don't
work" into a one-line diagnosis. Any background job whose only symptom
is an absence needs the same.

**Verified:** `tsc --noEmit` and `next lint` clean; build at the
recorded baseline (74 / 148, nothing else). **The fix is not yet proven
against the real transcript** — the acceptance test is pressing Draft on
that same Crown and Ember session and seeing items land.

## What was built — zero to-dos, and a progress note dressed as a draft (2026-08-04)

Bruce, on Perfect Auto Wholesale: pressed Draft, saw no action items,
and then "junk" appeared. Two faults, neither the one fixed an hour
earlier.

The run record settled it immediately — **succeeded, items_created 0,
documents_queued 1.** No truncation, no error. The extractor read a
66-minute session dense with commitments and returned an empty `items`
array.

### The prompt let a document stand in for the commitments

Documents were the more heavily specified half of the extraction prompt
— seven rules against four — and one of the item rules actively
suppressed output: *"items that don't move revenue or margin shouldn't
exist."* A model reads that as permission to drop them.

So on a session that clearly called for an operations guide, everything
went into the document and nothing into `items`. The generated guide
even carried a "First 30 Days" section listing seven owned, dated
actions — the exact commitments that should have been extracted, written
into prose instead.

Rewritten: `items` is declared the primary output and filled FIRST and
independently; an item that moves neither revenue nor margin is tagged
`false/false` and `low`, never omitted ("that judgement belongs to the
Coach, not to you"); an unclear owner is explicitly not a reason to drop
anything; and the documents section now states plainly that a document
NEVER replaces action items, naming the empty-items-with-a-document
result as the single most common mistake. An empty `items` array is
called out as almost always wrong for a business building session.

### "1 draft landed below, ready for review" was a progress note

`createDraftPlaceholder` writes a row the instant a document is queued,
whose body reads *"Reading the meeting transcript and drafting… if this
message is still here after five minutes, the drafting job didn't run —
tell Bruce."* That row:

- counted towards the follow-through total, so the watcher saw the count
  rise and announced a draft was ready — masking that ZERO commitments
  had been extracted;
- rendered as a full review card, with an owner picker, a due date and a
  **Publish** button over the words "tell Bruce".

`DELIVERABLE_DRAFTING_PLACEHOLDER` + `isDraftingPlaceholder()` in
`lib/deliverables/types.ts` are a shared sentinel — same reasoning as
`TOMBSTONE_BODY`: two places must agree on it, the writer that creates
it and the board that must not offer it for publication. An in-flight
document now renders as a spinner row saying what it is doing, with
nothing to publish and only a cancel.

**The run's own numbers now beat the row count.** `documentsQueued` is
reported alongside `itemsCreated`, and the panel distinguishes "no
to-dos came out of this one, but a document is being written" from "N
to-dos landed". Conflating them is what let a zero-item run read as a
success.

### The lesson

An hour earlier the same button failed loudly (truncated JSON) and was
fixed. This time it succeeded and produced nothing useful. **A run
record that only captures success/failure is not enough — the counts
have to be surfaced too**, because "worked, and did nothing" is a real
outcome and it looked identical to "worked".

**Verified:** `next lint` clean. `tsc --noEmit` reports two errors, BOTH
in `app/api/leads/[token]/route.ts` — a parallel session's in-flight
assessment-notification work sitting uncommitted in the same tree, not
touched here and deliberately not committed. Every file in this change
typechecks.

**Not yet proven:** whether the prompt change actually yields items. The
acceptance test is pressing Draft on that same Perfect Auto Wholesale
session and getting commitments, not just a document.

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
   - `NEXT_PUBLIC_APP_URL` — `https://builder.4workplaces.com`
   - `CRON_SECRET` — same value as `.env.local`. (If it doesn't exist there, generate a new random 32-byte string and put it in both places.)

3. **Confirm Netlify Blobs is enabled.** Open https://app.netlify.com/sites/workplaces-the-builder/configuration/blobs — should be on by default for paid plans. If off, click Enable.

4. **Trigger a fresh deploy.** Push or click Deploy in the Netlify dashboard. Verify build green, all 23 routes listed.

5. **Smoke-test as Bruce (master_admin).** Visit https://builder.4workplaces.com/portal — see the dashboard. Visit each tab in the nav — Action items, Sessions, Communication, Documents, Soul File. Each should render without error. Upload a small PDF to Documents. Schedule a session. Post a message in the Leadership thread.

**Per-client handoff (once per real client):**

6. **Create the engagement.** Go to https://builder.4workplaces.com/coach/engagements/new. Fill in: engagement name (e.g. "Impactica"), type (Accelerator or Implementer), client lead's full name and email, planned start date. Submit. The form creates a Clerk Organization, an `orgs` row, an `engagements` row, sends the invitation email, then strips Bruce as auto-admin of the new Clerk Org.

7. **Verify the invitation.** Open https://dashboard.clerk.com/last-active/organizations/<org_id> (the URL shows up after the form succeeds). The invitation should appear under Pending. Optionally, ask the client lead to forward you the invitation email's subject line so you know it landed.

8. **Client lead accepts.** They click the email link, sign up at https://builder.4workplaces.com/sign-up, complete Clerk's sign-up flow, land at /portal. First-visit provisioning auto-creates their `user_profiles` row with `role=client_lead` from the invitation's `publicMetadata.app_role`.

9. **Populate the Soul File.** As Bruce, open https://builder.4workplaces.com/coach/soul-file/<engagement_id> (the engagement id is in the URL after step 6). Hit Start writing. Drop in the deep context for this client — the methodology IP that drives every BBS.

10. **Schedule the first BBS.** https://builder.4workplaces.com/coach/sessions/<engagement_id> → Schedule a session form. Date/time in MT, format (in-person or virtual), agenda in notes.

11. **Send a welcome message.** https://builder.4workplaces.com/coach/communication/<engagement_id> → Leadership tab. Welcome them, point them at the Sessions tab.

**Known gaps (deferred to Phase 2+):**

- **Coach cross-org gap.** When Bruce posts in a thread that lives in the client org from his master-org session, RLS would filter to nothing because the GUC binds to the master org id. Workaround for the pilot: post the welcome message after step 8 (client lead acceptance), so the client lead's session creates the first leadership-thread row. Bruce's subsequent posts will still hit the gap until the coach-aware tenant helper lands.
- **Production migrate command.** No automated step yet — Bruce / a developer manually runs `pnpm drizzle-kit migrate` against the production URL. Future Inngest job will run this on deploy.
- **Webhook for user.created.** First-visit auto-provision works for the pilot but won't scale to many concurrent sign-ups. Webhook is on the Phase 2 list.

**Rollback plan if a step fails mid-handoff:**

- **Engagement creation failed after Clerk Org created.** Manually delete the orphan org at https://dashboard.clerk.com/last-active/organizations/<org_id> → Settings → Delete. The form's catch block tries to do this automatically; if it didn't, do it by hand.
- **Invitation went to wrong email.** Cancel via https://dashboard.clerk.com/last-active/organizations/<org_id>/invitations → three dots → Revoke. Re-issue from the form.
- **Anything broke during smoke test (step 5).** Don't onboard yet. Re-check env vars (step 2), re-check migrations (step 1). If still broken, redeploy.


---

## What was built — per-user browser state (2026-07-26)

Bruce reported that setting a filter on the Pipeline, then having Jen set
hers, reset his view to hers. No migration — this is a client-state fix.

**The database was never the problem.** `pipeline_column_prefs` is a
column on each caller's own `user_profiles` row, written with a WHERE
pinned to `ensureUserProfile()`'s id, and the page is `force-dynamic`.
Checked against production: Bruce and Jen have distinct profile rows,
distinct Clerk users, and distinct saved filters. Nothing shared.

**localStorage was.** Six keys — the pipeline view, table/board choice,
board column collapse, sidebar sections, the notification "last seen"
watermark, and the prospect-detail drawers — were stored under bare
names like `tbb.pipeline.view`. localStorage is per browser profile, not
per user, so on any machine both Builders sign into, the second one to
set a view replaced the first one's.

For the pipeline that escaped the browser. `ProspectTable` applies its
localStorage copy AFTER the server-rendered per-user prefs, so the
shared value won on load — and the debounced `setPipelineColumnPrefs`
then wrote it onto whichever Builder was signed in. One person's filter
choice ended up saved on the other person's row and followed them to
every other device. That is the "it reset mine to hers" Bruce saw, and
why it stuck rather than clearing on reload.

`lib/client/user-storage.ts` exports `useUserStorage()`, which suffixes
every key with the Clerk user id and gates reads/writes behind `ready`
(Clerk resolves the user asynchronously, so hydration effects now depend
on it rather than running bare on mount). A `getSessionJSON` /
`setSessionJSON` pair covers sessionStorage on the same terms.

Converted, beyond the six: the walkthrough and welcome-guide seen-flags
(both consoles), Buddy's mute, and the push-notification intent flag —
all the same defect, all of which would have made Jen inherit Bruce's
dismissals. Buddy's saved conversation moved too: it lives in
sessionStorage, which survives a sign-out, so an unscoped key handed one
Builder's thread — client names, figures — to whoever signed in next in
that tab.

**Legacy keys are deleted, not migrated.** Which Builder last wrote one
is unknowable, so adopting it would copy the other person's state into
this person's namespace and reproduce the bug. The pipeline view loses
nothing (the per-user database copy re-seeds it); the cost is that the
walkthrough is offered once more and Buddy un-mutes once, per person.
Guarded by a `tbb.storage.scoped.v1` flag plus a check that the key
isn't already namespaced, so a second purge can never eat the new keys.

Left deliberately unscoped: nav scroll position and the service-worker
purge flag. Those are properties of the browser, not the person.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles (the local prerender errors are the pre-existing missing Clerk
publishable key, hitting `/_not-found` identically — Netlify has the
key). The two-Builder behaviour itself needs one live check: sign in as
each on the same browser and confirm the views stay separate.

**Not changed, and Bruce's call:** Jen holds `all_clients_access = true`,
so her profile currently sees every client exactly as Bruce's does. The
only functional difference is the `master_admin`-gated surfaces. Whether
to narrow her access is a who-sees-what decision, not a bug fix.

## What was built — own-book-by-default client scoping (2026-07-26)

Second half of the same session. Bruce's rule, restated: **Jen's clients
are hers, Bruce's are his, with a toggle to see all.** No migration —
`prospects.owner_user_profile_id` and `engagements.coach_id` already
carried ownership; nothing was reading them on the pipeline.

**The gap.** `listProspects` filtered on `eq(prospects.orgId, master.id)`
and nothing else — every Business Builder saw every prospect in the
master org. The only "mine" affordance was a client-side owner dropdown
in `ProspectTable` defaulting to `"all"`, filtering rows that had
already been shipped to the browser. `listCoachEngagements` gave
master_admin every active client regardless of coach. And
`getClientScope()` defaulted the master admin to `"all"`.

**Now:** everyone — master admin included — defaults to `"mine"` and
opts into the whole practice's book with the existing toggle.
`coachScopeWhere`, `listProspects` (new `prospectScopeWhere`) and
`listCoachEngagements` all read the same `getClientScope()`.

**"Mine" means mine OR unclaimed, and that is the load-bearing detail.**
The lead webhooks (`/api/leads`, `/api/leads/[token]` — website contact
form, Meta and Google ad forms) never set `owner_user_profile_id`; only
a hand-created prospect gets one, from `createProspect`. A strict
`owner = me` would therefore have hidden every inbound lead from BOTH
Builders until somebody claimed it — and nobody would, because nobody
could see it. Same reasoning applied to `engagements.coach_id IS NULL`
in `listCoachEngagements` and `coachScopeWhere`: an engagement created
without a coach must not fall out of everyone's view at once. Today
there are 9 unowned prospects and zero coachless engagements, so the
engagement half is purely defensive.

**Who may flip to "all"** is `canSeeAllClients()`: the master admin
always, and any Business Builder holding `all_clients_access`. A Builder
restricted to an explicit `bb_client_access` grant list is never offered
it — "all" would hand them the clients they were deliberately fenced
out of. `setClientScope` re-checks server-side; narrowing to "mine" is
always allowed.

**The scope cookie is now per user** (`bb_client_scope_<userProfileId>`).
A cookie belongs to the browser profile, not the person, so the single
shared name had exactly the defect fixed earlier in the session — two
Builders on one machine flipping each other's scope.

The toggle now renders on the Pipeline page (it never did before, which
is why the scope was invisible there) alongside a line saying which book
you're looking at, and is shown to any Builder who may use it rather
than to master_admin only.

**Effect on today's data:** Bruce's pipeline goes from 88 records to 62
(54 his + 8 unclaimed); Jen's to 34 (26 hers + 8 unclaimed). Bruce's
client switcher goes from 19 to 18. Both have `coaches` rows, so neither
lands on an empty list.

**Scope is a view default, not a permission boundary.** `getProspect`
and the per-engagement page gates are unchanged — both Builders hold
`all_clients_access` and can still open anything by id. Tightening that
would be a different decision.

> **Superseded 2026-07-27 — see "Coach access becomes a real boundary"
> below.** Leaving a view default in place and recording the permission
> side as "a different decision" was wrong: the ask was that Jen's
> clients are hers, and a toggle she can flip does not deliver that.
> Bruce checked her access and found she still saw everything.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles. The 76 local prerender failures are all the pre-existing
missing Clerk publishable key — 152 `Missing publishableKey` errors
across those 76 pages and zero errors of any other cause; Netlify has
the key. **Not yet exercised against a live session** — the acceptance
test is Bruce and Jen each loading the pipeline and seeing their own
book, then Bruce flipping to "All clients" and seeing 88.

## What was built — coach access becomes a real boundary (2026-07-27)

Bruce checked Jen's access and found she could still see everything he
could. He was right, and the previous entry recorded the reason as a
decision he had made rather than work left undone. Migration `0093`.

**Why the earlier pass didn't bite.** It changed which list a Business
Builder LANDS on. `user_profiles.all_clients_access` defaulted TRUE, and
`canCurrentBbAccessEngagement` short-circuits on that flag — so Jen was
offered the All-clients toggle (one click, the whole book) and every
client also opened by direct URL regardless of the toggle. The
enforcement machinery from 0065 existed; it was simply switched off for
everyone. **A scoped list is not a boundary. Never report one as if it
were.**

**Access now derives from ownership.** `canCurrentBbAccessEngagement`
grants a coach an engagement when they are its assigned coach
(`engagements.coach_id` → `coaches.user_profile_id`), when it is
explicitly granted in `bb_client_access`, when it is the internal
workspace, or when it has no coach at all. Ownership is already
maintained on assignment (see the lead-Owner sync), so there is no
second list to keep in step — which is why this was chosen over the
manual grant list.

The unclaimed arm is deliberate, same reasoning as `coachScopeWhere`: an
engagement with no coach must not fall out of EVERY Builder's view at
once, leaving work nobody can see or claim.

**0093 does three things:** flips `all_clients_access` to false for
existing coaches (the line that actually changes what Jen sees), makes
false the column default, and moves the default on `bb_invite_access`
too — a pending invite carries its own copy, and would otherwise hand
the next Builder the whole book on first sign-in. master_admin rows are
forced true.

**Two holes closed at the same time:**

- `getCurrentBbAccess`'s error fallback returned FULL access on any DB
  failure, on the grounds that the read sits on the hot path and must
  not take the app down. It returns own-book now. The app still loads;
  a transient error can no longer hand one Builder the practice.
- `getProspect` had no access check whatsoever — every lead opened by
  pasting its id. Now owner-or-unclaimed, or reachable via the
  engagement it converted into. Unowned leads stay visible to everyone
  because the lead webhooks never set an owner.

**Not yet exercised against a live session.** The acceptance test is Jen
signing in and seeing only her clients, with no All-clients toggle.

## What was built — deliverable drafting moved to the background (2026-07-27)

"Draft from this meeting" errored out for both Builders.

**It was never a drafting bug — there was no time to draft.** The action
ran Opus inline in a server action. Netlify kills a synchronous function
at ~26s on this plan; reading an hour-plus transcript and writing a
long-form document takes minutes. The function died mid-run and the
browser got a dead action back. The action-item extractor hit this
exact wall and was moved to a Background Function, with a header comment
explaining why — deliverables never got the same treatment. **Any Claude
call over a transcript in this repo belongs in a background function.**

`lib/deliverables/fireflies-draft.ts` (Clerk-free core) +
`netlify/functions/draft-deliverable-background.mts` (15-minute budget).
The server action authorizes — role gate AND
`canCurrentBbAccessEngagement` — then enqueues. The core runs under
`withSystemContext`: `withEngagementContext` authorizes through
`ensureUserProfile()`, and a background run has no Clerk session, so it
would deny every engagement and silently write nothing. Same trap as
`topUpAllSeries` and the EA crons.

**"It missed things from the meeting" was the output cap.** 8000 tokens
is about 25 pages — enough for a short SOP, not for a business plan off
a two-hour session. The draft stopped; it hadn't skipped anything, it
never reached it. Raised to 32000 now the wall-clock exists, and
`complete()` returns `stopReason` so truncation is CHECKED rather than
assumed: a cut-off draft says so in its own header instead of reading as
a thin meeting. Transcript truncation is surfaced the same way. The
prompt now also asks for coverage over brevity explicitly.

**`MeetingDeliverableButton` was written but never mounted on any page**
— the Meetings library could only draft action items. It is on the page
now.

**The saved-documents attachment picker existed only in the two Inbox
composers.** Writing from a prospect's own profile left uploading from
disk as the only route to a document the app was already holding — the
Climb PDF included. `ClientCommunicationsPanel` now carries the picker,
sending by document id rather than shuttling bytes through the browser.

## What was built — the scheduled jobs that never ran (2026-07-28)

Bruce: "I am not receiving Business Notes and agendas — is this legit or
because nothing has been recorded yet?" It was not legit. No migration;
this is wiring.

**The hourly Fireflies sync had never done anything.** The cron route
called `syncAllEngagementMeetings` from `lib/actions`, which opens with
`ensureUserProfile()`. That reads the Clerk session. A cron run has no
session, so the guard failed and the function returned `{engagements: 0,
inserted: 0, updated: 0}` in a few milliseconds — every hour since 24
July, with a clean success and no error anywhere.

Nothing surfaced it because nothing could. The symptom was an email that
never arrived, and a recap that never arrives is indistinguishable from
a fortnight with nothing worth saying. The tell was in the Netlify
timings: 650–800 ms, hour after hour, never varying. A job that actually
pulled and persisted transcripts would take longer and vary. **A cron
whose duration never varies is not finding nothing; it is never
looking.**

Downstream, that killed both features Bruce was missing. Transcripts
reach the app through `engagement_meetings`, and this job is the only
thing meant to keep it current. With it dead, `fireflies_recording_id`
was never set, so no recap was ever drafted — hard blocked. Agendas
degraded rather than stopped: their strongest input is the previous
session's transcript, so without one the drafter fell back to open
commitments alone and produced nothing when there were none.

The manual "Sync meetings" button always worked — there *is* a signed-in
user there. Only the automatic feed was dead.

**Third instance of this trap** (`topUpAllSeries`,
`carryForwardAgendaAsSystem`, now this). It is written up twice already
as "the trap for any future cron work in this repo," and it still landed
a fourth time. The warning is not enough on its own; see the structural
change below.

**Why the work moved to `lib/integrations/fireflies-sync.ts`, with no
`"use server"` directive.** Every export of a `"use server"` module
becomes a server action — a POST endpoint reachable from a browser. An
unguarded, cross-tenant sync that bills Fireflies on every call must not
be one. So the work lives in a plain module, session-free and callable
by the cron, and `lib/actions/` keeps only the Clerk-guarded wrapper for
the in-app button. Same shape as `lib/integrations/gmail-sync.ts` and
`lib/calendar/sync.ts`, which is the established pattern here.

**The dead Inngest `firefliesSync` was deleted, not repaired**, and this
is the part that actually prevents a repeat. It was a duplicate of the
live Netlify pair, and *it held the original bad import* — the real
route was written by copying that line out of it. A broken pattern left
lying around gets copied. One sync now, and nothing to copy.

**Second job, same fault, found in the same sweep.**
`sessionSeriesTopUp` existed ONLY as an Inngest function, so the nightly
recurring-meeting top-up had never fired either, and every active series
was drifting toward the end of its materialized horizon with nothing to
say so. Added the missing pair (`netlify/functions/session-series.mts` →
`app/api/cron/session-series`, `0 8 * * *`). The work itself was already
cron-safe — `topUpAllSeries` runs on `withSystemContext` — so only the
schedule was missing.

It goes on the `EA_JOBS` heartbeat list despite not being an EA job,
because it shares the property that matters: **its only failure mode is
silence.** A series quietly running out of dates looks exactly like a
series nobody uses. Anything on that list turns red in the Friday rollup
after 8 days without a successful run.

**How to check this whole class of thing in future.**
`scripts/diagnose-ea-recaps.mjs` (read-only, writes nothing) walks the
chain link by link — job heartbeats, sessions, transcripts, whether
unmatched sessions had a transcript in range, recaps, agenda proposals,
digests — and reports which link is empty. Needs `DATABASE_URL` in
`.env.local`. Run it before theorising.

**Left deliberately undone.** `topUpAllSeries` is exported from a
`"use server"` file with no auth guard, so it is a browser-reachable
endpoint. Idempotent, so the blast radius is small. Fixing it properly
means extracting the recurrence engine out of an 1,100-line file — the
DST and phase-stability logic documented under 2026-07-19, which is easy
to break and has no live test. Worth doing as its own job, not as a
rider on an outage fix.

**Verified:** `tsc --noEmit` and `next lint` clean. `next build`
compiles; the 76 local prerender failures are 152 `Missing
publishableKey` errors and zero of any other cause, matching the
recorded baseline exactly. Deployed as `9d60a00` — Netlify reports 19
functions (was 18) and `{"cron":"0 8 * * *","name":"session-series"}` in
the live schedule table. **Not yet confirmed end-to-end:** the
acceptance test is a recap approval email actually landing, which needs
the next `fireflies-sync` run against a session with a transcript.

## What was built — the briefing that did nothing (2026-07-29)

Bruce, on the first morning briefing to arrive after the cron fix: "2
sessions today and it does absolutely nothing for me. I don't get notes,
I don't get agendas, I get stuff Jen is working on." Two bugs and one
decision reversed. No migration.

**Bruce's briefing carried Jen's clients.** `listEngagementsForRecipient`
returned every active engagement for `master_admin`, unconditionally.
That was correct until own-book-by-default landed on 2026-07-26, and the
module was never updated — its own header had warned "if the access
model changes, both must change," and it didn't. Now mirrors
`coachScopeWhere`: own book plus unclaimed. There is deliberately no
mine/all equivalent here, because that toggle is a cookie and a cron has
no browser to read one from; own book is the right default for a
personal briefing.

**Nothing ever became a "previous session", so agendas never drafted.**
Four EA features keyed off `bbs_sessions.status = 'completed'`, and the
only thing in the app that ever writes that value is a person clicking
"Mark complete". There is no sweep. Sessions arriving from Google
Calendar land as `scheduled` and stay that way for ever, so:

- agenda drafting had no transcript to reason from and correctly
  declined to propose anything (a model with no material invents one);
- the "last session" prep line and the still-open-from-last-time list
  were always empty;
- **hours-per-engagement counted zero session hours**, which made every
  effective hourly rate in the Friday rollup meaningless.

`lib/ea/held-sessions.ts` now holds one definition — a session in the
past that was not cancelled was held — imported by all four call sites so
they cannot drift apart again. `cancelled` already carries the negative
case, so nothing is inferred.

Read-side, not a nightly sweep flipping past sessions to `completed`.
Bruce's call: a sweep writes a claim the system cannot verify, and a
meeting nobody attended would be recorded as held. `completeSession()`
still means exactly what it always meant.

The previous-session lookup in `agenda-draft` also gained an upper bound
it never had. It ordered by `scheduledAt DESC` with no `lt`, so once the
`completed` filter came off, the "previous" session could have been a
FUTURE one. `sessionWasHeld(session.scheduledAt)` carries the bound.

**The three state-of-the-book sections are back in the daily.** Reversing
the 2026-07-25 decision, at Bruce's direction: deliverable states, what
clients owe, and engagements gone quiet all render in the 7am email
again. They sit LAST, below everything actionable, so the top of the
email still opens on today. `eaSection` renders nothing for an empty
body, so a clean book costs no space.

The renderers moved into three shared functions used by BOTH the daily
and the Friday rollup. Two copies of the same section could drift and
then the two emails would disagree about the same book — the exact
failure the single-gatherer design was meant to prevent. The plain-text
alternative carries all three too, in the same order.

**Verified:** `tsc --noEmit` and `next lint` clean. Rendered through
`npx tsx scripts/preview-ea-email.ts digest` and read end to end — the
three sections appear below "No next step booked", the suggested agenda
renders under today's session, and the Friday pointer line is gone.
**Still not confirmed against live data:** whether real sessions now
produce real agendas depends on transcripts having been attached, which
needs `fireflies-sync` to have run against a session with a recording.

## What was built — deleting an archived lead with a contract out (2026-07-30)

Bruce, deleting four archived contacts, got a raw `Failed query: delete
from "prospects" …` dump. No migration; this is action logic.

**A cascade hit a RESTRICT two levels down.** Deleting a prospect
cascades into its `documents`, and
`signature_envelopes.source_document_id` is ON DELETE **RESTRICT**. Two of
the four leads had been sent a Business Building agreement, so each held a
document that an in-progress envelope pointed at, and the whole statement
failed — including for the two leads with nothing wrong with them, because
one DELETE either takes every row or none.

The RESTRICT is right and stays: removing a file from the Documents page
must never quietly destroy the signing record built from it. What was
wrong is that `signature_envelopes.prospect_id` is only SET NULL, so the
cascade could not clear its own path — the model said "keep the envelope,
orphaned" and "destroy the document it depends on" at the same time.

**Flipping that FK to CASCADE was rejected.** Postgres fires referential
actions in constraint-name order, so the fix would have rested on
`signature_envelopes_prospect_id_…` happening to sort before
`documents_prospect_id_…` — true today, silently breakable by any future
rename. `hardDeleteProspectRows` deletes the envelopes explicitly, first,
in the same transaction. Signers cascade from the envelope. Ordering is
now stated rather than inherited.

**Stored files were leaking on every permanent delete.** A database
cascade cannot reach Netlify Blobs, so each deleted document left its blob
behind with nothing pointing at it. Blob keys are now collected before the
rows go and dropped after the commit, best-effort and logged — a storage
round trip must not hold a pooled Postgres connection, and a blob that
fails to go is not a reason to un-delete a lead the operator asked to
erase.

**The error message was the other half of the bug.** Both actions returned
`e.message`, which for Drizzle is the whole statement plus its bind
parameters — it names the top-level DELETE and never mentions the
constraint that actually refused. `describeDeleteFailure` logs the real
error server-side and returns a sentence; a 23503 now says which table
still points at the record and that nothing was deleted.

Both confirm dialogs now say files and unsigned agreements go too, because
they do.

`scripts/diagnose-prospect-delete.mjs` (read-only, writes nothing) walks
the cascade graph out from `prospects`, flags any NO ACTION / RESTRICT
reachable through it, and runs the real DELETE inside a transaction forced
to roll back by a `SELECT 1/0` sentinel — which is how the constraint was
identified. **That sentinel trick is the general tool here:** any "Failed
query" with no constraint in it can be resolved this way in one run.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build` compiles
successfully (the sync non-exported helpers satisfy the `"use server"`
all-exports-async rule). The new statement order was run against the live
database inside a rolled-back transaction — 4 targets, 2 documents, both
envelopes and all four prospects deleted with no constraint error, and all
four rows confirmed still present afterwards. **The real delete has not
been run** — the acceptance test is Bruce deleting those four archived
contacts from the Archived view.

## What was built — the recap that said nothing, and five things around it (2026-07-30)

Bruce, on the first A&M Abatement recap approval email: "it really
doesn't give me much." It didn't. No migration; this is logic, plus two
one-time data repairs.

**The recap fell back to boilerplate with the material sitting right
there.** 2,420 characters of Fireflies overview and bullets were written
to `engagement_meetings` at 17:08:08 and the recap was drafted at
17:08:16 — eight seconds later, off the same cron, from our own copy.
The prose step failed and the `catch` swallowed it into neutral copy: a
headline, a sign-off, nothing between. The whole run took under eight
seconds including several queries, so the model call failed fast rather
than timing out.

**The root cause is still unidentified, and that is the finding.** The
API key works — 86 Haiku classifications ran in production on 29 Jul
through the same `complete()` and the same `client()`. What went wrong
on the Sonnet call is in a Netlify log line nobody reads. So the fix is
not a guess at the cause; it is making the next occurrence say what it
is.

**Three failures were being counted and never described.**

- `withHeartbeat` only recorded `error_text` when the job THREW. Most EA
  jobs catch per-item errors so one bad recipient cannot stop the sweep,
  which means they return normally with a failure count. Those runs
  stored `status: failed, error_text: null`. `ea-inbox-sweep` had failed
  on **29 consecutive runs since 28 Jul** with nothing recorded against
  any of them. New optional `extractError` callback; sweeps now carry a
  `firstError` out.
- The recap sweep grades a skip as a success, because "no transcript
  yet" is the ordinary state of most sessions. That made a sweep which
  skipped EVERYTHING for a real reason grade clean — and a clean grade
  stores no error. A recorded reason now downgrades the run to
  `partial` so it survives into the Friday rollup's job table.
- `no-transcript-content` is deliberately NOT reported. It is the
  ordinary waiting state, and reporting it would train the eye to
  ignore the column.

**No prose, no recap.** The fallback is gone. A failed prose step
returns `prose-failed: <message>` and writes nothing. The old behaviour
was worse than failing twice over: it asked someone to approve sending a
client an email that said nothing, and because `bbs_session_id` is
UNIQUE it permanently consumed that session's one recap slot, so the
retry that would have worked could never run. Prose generation moved
AHEAD of the agenda carry-forward, so an abort mutates nothing and the
next sweep retries cleanly.

`scripts/clear-empty-recaps.mjs` deleted the two boilerplate drafts (A&M
28 Jul, Impactica 30 Jul) that had already taken their slots. It only
ever touches rows that are draft, unapproved, unsent, unfiled AND carry
neither a decisions nor a commitments heading, and re-asserts all of it
in the DELETE.

**Nobody was going to receive it anyway.** A&M Abatement has zero users
in its org; across the whole app only two clients have ever been invited.
Approving would have filed the portal record and emailed no one, left
the recap `approved` rather than `sent`, and shown a page headed "Sent".
`describeRecap` now counts the real recipients using the same rule the
send path uses, the confirmation page says so BEFORE the tap ("Nobody at
X has been invited to their portal yet"), the button reads "File it
anyway", and a zero-delivery result is headed "Filed, not sent".

**Adding a second person to a client portal.** `inviteClientToPortal`
handles exactly one person and refuses to run twice, so the only route
was the client lead inviting their own people — impossible until the
lead had accepted. `lib/actions/invite-portal-user.ts` +
`InvitePortalUserForm` on the engagement page, gated on
`canCurrentBbAccessEngagement`.

**It sends NO `inviterUserId`, and that is the load-bearing detail.**
The invite-client flow steps the coach back out as admin of the client's
Clerk org, so there is no membership to invite from. The obvious
workaround — re-add as admin, invite, remove — fires
`organizationMembership.created`, which our Clerk webhook turns into a
`user_profiles` row: a Business Builder profile planted inside the
client's org on every invitation. Clerk makes `inviterUserId` optional,
so the invitation is issued without one and the client org stays clean.
The comment in `invite-client.ts` claiming Clerk requires it was true
only because the coach happened still to be admin at that moment.

**The monthly fee never followed the lead.** It was copied once, at
activation, and never again — so a fee agreed or corrected afterwards
stayed on the lead while the client's own record read blank. That was
**16 of 18 clients**, $27,250/month unrecorded. The blank is what the
QuickBooks recurring retainer bills from (it refuses outright without
one) and what the Friday rollup's effective hourly rate divides by, so
both were wrong or missing for nearly the whole book.

`updateProspect` now writes the fee through to the converted
engagement, in the same transaction and for the same reason the Owner
reassignment already did. One-directional and only on an explicit fee
edit: `setEngagementMonthlyFee` exists so a client's fee can be
corrected independently, and copying on every unrelated save would let a
stale lead value overwrite it. `scripts/backfill-engagement-fees.mjs`
repaired the 16; it only ever fills NULLs, so a deliberate correction is
never stamped on.

**"Workplaces Team" was showing as the client portal.** The internal
workspace is the NEWEST engagement on the books — it is created the
first time anyone opens the Team module — and `getCurrentEngagement`'s
coach fallback picked the most recent engagement with no `is_internal`
filter. `listCoachEngagements` had always filtered it out of client
lists; this one path did not. Filtered now, AND ignored when it arrives
from the selected-engagement cookie, because anyone who already landed
there has it saved in their browser and would otherwise keep landing
there.

**"Create sample engagement" removed** — `SeedDemoButton` and
`lib/actions/demo-seed.ts` both deleted.

**Neon returns numeric columns as strings.** The backfill's first run
reported a total of `$350,000,150,000,179,960,000,…` because
`sum + row.fee` concatenated. Caught before any write. Every arithmetic
use of a Neon numeric needs an explicit `Number()`.

**Verified:** `tsc --noEmit` and `next lint` clean. `next build`
compiles: 76 prerender failures, 152 `Missing publishableKey` errors and
zero of any other cause — matching the recorded baseline exactly.
Netlify has the key.

**Outstanding, and this is the acceptance test:** the recap prose
failure is fixed to REPORT, not fixed to work. The next `fireflies-sync`
run after deploy redrafts A&M and Impactica; either a real recap arrives
or `ea_job_runs.error_text` finally names the fault. Nothing here has
been exercised against a live deploy.

## What was built — tasking each other, and finalizing an agenda (2026-08-04)

Bruce's ask: an email when he and Jen assign each other a task, an email
when an agenda is finalized inviting the other to add points, and another
when someone adds more and finalizes again. Migrations `0112` + `0113`.

**Bruce's three decisions up front:** finalize works on every session,
internal and client, but only Business Builders are emailed and nothing
new appears on any client surface; emails fire on finalize, not on every
add; all three events email on top of the existing in-app notification.

### The assignment email was already broken between them

Not a missing feature — a silent one. `createActionItem` and
`updateActionItem` both read the assignee's email INSIDE the write
transaction, which `withEngagementContext` binds to the ENGAGEMENT's org.
Bruce and Jen live in the master org, so on any CLIENT engagement RLS
filtered the row out: `assignee` came back undefined, the email was never
sent, nothing logged, and the in-app notification row was written with
the client's `org_id` into a tenant neither of their bells can read. It
worked ONLY on the internal team engagement, where the bound org happens
to be theirs — which is exactly why it looked fine.

Reachable on purpose: `listEngagementMembers` deliberately prepends the
Business Builders to the assignee picker on client engagements, so
"assign Jen something on Crown and Ember" is a normal action that
produced silence.

**Fourth instance of this exact trap** (client messages, client agenda
points, and now this, all after the `withSystemContext` cron family).
`lib/notifications/action-item-assigned.ts` is now the single path for
every assignee, client or Builder: resolve under `withSystemContext`,
write the row with the RECIPIENT's own `org_id`. Moving it out of the
transaction also removed the duplicated copy between create and update.

It was also sending Builders a `/portal/...` link — the client's surface.
Builders now get `/business-builder/action-items/<id>`.

### `agenda_finalized_at` is deliberately the state AND the watermark

NULL means never announced. Set means announced at that moment, and
anything in `agenda_items` with `created_at`/`updated_at` after it is
unannounced change. Re-finalizing moves it forward, so each email
describes only the delta since the last one. A separate revision counter
would have to be kept in step with the timestamp and could drift out of
it; one column cannot disagree with itself.

The watermark is stamped BEFORE the agenda is read, so a point added
during the read-then-write window falls after it and is caught by the
next announcement rather than vanishing between the two.

What it cannot see: an item DELETED since the last finalize leaves no row
to compare against, so a removal alone is not a change. A tombstone table
to catch "we dropped a topic" is not worth it.

A re-finalize with nothing to report is REFUSED rather than sending an
"updated" email describing no update — that press is almost always a
double click.

### Only a Business Builder finalizes

Deliberately narrower than `canManageAgenda`, which includes
`client_lead` and `client_manager`. The emails go to Bruce and Jen, so a
client pressing it would fire our internal prep signal. The control does
not render on the client portal at all, and the client is never shown
finalize state — showing "finalized" to the person you are inviting to
add points reads as closed.

`resolveAgendaAudience` differs from `resolveEngagementBuilders` in one
case, and it is the case the feature exists for: the internal workspace
has a `coach_id` like any other engagement (the column is NOT NULL, so
`ensureInternalEngagementId` sets it to whichever coach it found), so
resolving it the normal way returns ONE Builder and silently drops the
other. On the practice's own touch-base both are participants. Everywhere
else the own-book rule stands.

The actor is excluded from their own announcement. Being emailed about a
button you just pressed teaches you to ignore the sender.

### Both new emails bypass the working-hours window

`sendEmail` does not QUEUE an out-of-hours message, it DROPS it — the
`email_pending_send_at` queue its own header describes was never built,
which is why ~14 call sites already pass `bypassWorkingHours: true`. So
without the bypass a task assigned or an agenda finalized after six would
reach nobody, ever, and an agenda is often prepared the evening before.

The guard exists to keep US out of a CLIENT's inbox at 9pm, so it still
applies to them: the assignment email bypasses only when the recipient is
a Business Builder. Client recipients keep the guard — and therefore keep
the pre-existing silent drop, which is a queue build, not this one.

### The safety net, because finalizing is a button someone can forget

An agenda built and never finalized emails nobody, and the other Builder
walks in cold — the exact failure the feature exists to prevent. The
07:00 briefing now counts agenda points nobody has been sent for each of
today's sessions and says so in orange. On the morning of the session
that silence stops being survivable.

### Smaller things

- `AgendaFinalizeBar` is shared by BOTH boards (the client-session
  `SessionAgenda` and the internal `AgendaBoard`) because it is the piece
  with behaviour; the boards stay separate. Its change count is computed
  against the same watermark the server measures from, so the button
  never promises an email the action then refuses to send.
- Finalize stops at the session's START time, not at `status`. Nothing
  writes `completed` except a person clicking, so `isClosed` alone would
  leave the button live on meetings that already happened — the same
  reasoning as `lib/ea/held-sessions.ts`.
- Notification deep links route the internal touch-base to
  `/business-builder/team/<id>` and client sessions to
  `/business-builder/sessions/<eng>/<id>`. One-segment guessing is how
  the recap approval links 404'd on 2026-08-03.
- `npx tsx scripts/preview-ea-email.ts agenda | agenda-updated` renders
  either email to a file without sending, alongside the existing
  `digest` and `rollup` modes.

**Verified:** `tsc --noEmit` and `next lint` clean. `next build`
compiles: 74 prerender failures, 148 `Missing publishableKey` and zero
errors of any other cause — the current baseline exactly. Both emails
and the briefing's new section were rendered through the preview script
and read end to end. Migrations 0112 + 0113 were applied against the
LIVE database inside a transaction forced to roll back: columns created
nullable, FK confirmed ON DELETE SET NULL, both enum values present,
0113 re-applied cleanly (idempotent), then rolled back — database
unchanged.

**Not yet clicked in a browser, and no email has actually been sent.**
The acceptance tests are: Bruce assigns Jen a task on a CLIENT
engagement and she gets the email (the case that has never once worked);
and finalizing an agenda emails the other Builder, then adding a point
and finalizing again emails the delta. Live data at build time: 489
sessions, 147 upcoming, but only 3 agenda items across 1 session — the
agenda surfaces are a day old, so this lights up as they get used.

## What was built — the onboarding button that refused itself (2026-08-05)

Jen, onboarding a client: pressed Start onboarding, got the pop-up
warning that this emails the client three times and none of it can be
recalled, hit OK — and got back *"One thing needs sorting before
onboarding can start"* with no indication of what, and nothing on the
page to act on. No migration; this is client/server agreement.

**The button and the server disagreed about who the rules applied to.**
`StartOnboardingPanel` had `gatingBlockers = established ? [] : blockers`
— an established client (one holding a real Clerk org, or with a session
or synced meeting already behind them) was exempted from the pre-flight
entirely: button enabled, blocker list not rendered, and the fee and
schedule controls that fix the blockers not rendered either, all three
guarded on `!established`. `startOnboarding` has no such exemption. It
runs `checkOnboardingReadiness` for every client and refuses.

So the panel offered a live button, said nothing about why it wouldn't
work, and put the refusal behind an irreversible-sends confirmation.
Measured against the live book: **15 of 21 engagements were in exactly
that state.** Jen's was Steadfast Construction — established, one
blocker, no monthly fee — which is precisely the "one thing" wording.

**The exemption was defensible reasoning applied to the wrong thing.**
Every check guards a real send: no fee means the payment form authorizes
an unstated amount, no first session means the welcome email invents a
start date, no contact email means nothing can go anywhere. None of that
becomes safe because the client is established. What `established`
legitimately buys is that we don't *nag* a two-year client with an orange
"not ready" box — a presentation decision. It was quietly doing a
permission one as well.

The rule now: **the button is gated on the same blockers the server
checks, always, and whatever fixes them renders beside them.**
`established` still decides whether the panel opens collapsed and whether
the copy frames onboarding as a task or as history ("these are only
needed to run the welcome sequence — if this client is already going,
nothing here is outstanding").

**The fix controls existed nowhere else, which is the second half of "I
don't know what to do from there."** `OnboardingSetupFields` and
`EngagementSchedulePanel` are mounted ONLY as slots inside this panel, so
for those 15 clients the monthly fee had no control anywhere in the app —
the 2026-08-04 finding that "a blocker must be fixable where it is
raised" returning through a door it had not been checked against. Both
now render whenever onboarding hasn't run, established or not.

**The server names the blockers instead of counting them.** "One thing
needs sorting" is a sentence that reports a problem and withholds it.
Now: "Onboarding can't start yet — no monthly fee is set."

**The returned blockers are rendered, not discarded.** `startOnboarding`
has always returned `blockers` on refusal and `go()` read only `.error`.
The page is a snapshot — another Builder can change the record, and the
fee is editable from the contact profile in another tab — so when the
refusal disagrees with what is on screen, the refusal is the truth and it
now renders with its fix links.

**The confirm names the recipient.** "This emails the client three times
and none of it can be recalled" is alarming and uncheckable. It now says
which client and which address, which is the one fact that makes it
either verifiable or obviously wrong before you press OK.

**No onboarding panel on the practice's own workspace.** "Workplaces
Team" is `is_internal` — no client behind it, so every check fails and
the panel offered a sequence that can never legitimately run.

**Verified:** `tsc --noEmit` clean for every file touched (the two
remaining errors are a parallel session's uncommitted
`app/api/leads/[token]` work, untouched here); `next lint` clean;
`next build` at the recorded baseline — 74 prerender failures, 148
`Missing publishableKey`, zero errors of any other cause. The pre-flight
and the new gating were replayed against the LIVE database for all 21
engagements, read-only: 15 traps before, **0 after**, with every blocked
client now showing its blockers and its fix controls.

**Not clicked in a browser.** The acceptance test is Jen opening
Steadfast Construction, pressing Show on the onboarding line, seeing
"Start onboarding — blocked" with "No monthly fee is set" and the fee
field directly above it, setting the fee, and the button going live.

## What was built — the leads in the briefing that were Jen's (2026-08-06)

Bruce, on the 07:00 email: "gives me Jen's clients and action items as
well — this just needs to be mine and Jen's hers unless we share a
client." No migration; one function.

**The engagement scoping was right, and that is what made this hard to
see.** Replayed against the live book: Bruce's briefing covered 18
engagements — his own 17 plus Steadfast Construction, which Jen shared
with him. Crown and Ember, Jen's own unshared client, was correctly
absent. Jen's covered 6: her two plus the four Bruce shared. Owned ∪
shared, exactly as asked, on both sides.

**One section below it was still practice-wide.** `gatherProspects` in
`lib/ea/digest-data.ts` read

    recipient.role === "master_admin" ? undefined : eq(owner, me)

— so the master admin's "No next step booked" list was every live lead
in the practice. All **six** entries in Bruce's list that morning
(Amala Raveendran, Karen Andrichuk, Ali Choudhry, Jhaira Mae Humber,
Dar, Terry M) were Jen's, and his own single lead was the one thing the
section was for. Those are the "clients and action items" — a lead with
an overdue next action reads as both.

**It is the survivor of the 2026-07-29 fix.** That pass rewrote
`listEngagementsForRecipient`'s master-admin branch for precisely this
reason and did not touch the prospect gatherer three lines further
down, which had the same exemption in the same shape for the same
stated reason. Scoping one query in a module does not scope the module.

Now `or(owner = me, owner IS NULL)` for everyone, master admin
included — the identical clause `prospectScopeWhere` uses on the
Pipeline page and `coachScopeWhere` uses on engagements. The unclaimed
arm is load-bearing, not defensive tidiness: the lead webhooks never set
an owner, so a strict `owner = me` would hide every inbound lead from
both Builders until somebody claimed it, and nobody would, because
nobody could see it.

Fixing the gatherer fixes the Friday rollup too — it renders the same
`gatherDigest` payload rather than re-deriving it, which is why the two
emails cannot disagree about the same book.

**Left alone, and worth naming.** `clientOverdue` is "assigned to
someone who isn't you", so an item assigned to Jen on a client Bruce
owns lands in his "waiting on the client" list attributed to a Business
Builder. Zero rows today, and it is his client either way — but the
label is wrong for that case and it will look wrong the first time it
happens.

**Verified:** `tsc --noEmit` reports only the two pre-existing errors in
a parallel session's uncommitted `app/api/leads/[token]/route.ts`;
`next lint` clean; `next build` compiles successfully and then stops
type-checking on that same uncommitted file, so the prerender baseline
could not be re-measured this pass. Old-vs-new scoping was replayed
directly against the live database, read-only: Bruce **7 → 1** (his own
Delize Inc.), Jen **6 → 6**, unchanged.

**Not yet seen in a delivered email.** The acceptance test is tomorrow
morning's briefing carrying only Bruce's own leads.

## What was built — the client debt that was the other Builder's (2026-08-06)

Same session, the item flagged when the prospect leak was fixed. No
migration.

**The section's own subtitle had been right all along.** "What your
clients owe you" renders under *"overdue commitments held by client-side
people"* — but the filter was `assignee !== me`, so on any client where
both Builders work, an item assigned to the other one was reported to you
as a client debt. Identity where the copy promised a role.

**Nothing was ever sent to a client on the strength of it**, and that is
worth stating precisely because it is the part that could have been bad.
`runClientNudge` — the Monday email that actually chases people — already
filters on `assigneeRole` being one of the three client roles, with the
comment *"Client-side owners only. Business Builders have the digest."*
So the correct rule existed one file over the whole time; the briefing
simply did not use it. The blast radius was a wrong sentence in an
internal email, not a client chased for their coach's homework.

The digest now splits `others` by role the same way, into `clientOverdue`
and a new `builderOverdue`, and renders them as two sections — "Overdue
with the other Business Builder" in the daily, "Waiting on the other
Business Builder" in the Friday rollup. Two conversations, two lists: one
you raise with a client, one you raise with a colleague.

**Both buckets are named explicitly rather than one being "everything
else."** An assignee in neither set — a `prospect`-role profile, or a
role added later — is dropped rather than silently filed under whichever
bucket happened to be the default. Same conservatism the nudge already
applies, and for the same reason: the cost of a wrong bucket is a
sentence to somebody about work they do not owe.

`builderOverdue` is OPTIONAL on `DigestPayload`. `ea_digests.payload` is
a permanent record of what was actually sent, so every reader tolerates
its absence on rows written before today rather than back-filling a guess
about an email that has already gone.

**The rollup's "nothing to report, skip the email" check counts it.** A
week whose only outstanding item sits with the other Builder is not a
quiet week — and unlike a client, a Business Builder gets no nudge, so
this is the only place it ever surfaces. Omitting it from that check
would have suppressed the email in exactly the case it exists for. Same
reasoning as the stale-heartbeat carve-out immediately above it.

**Verified:** `tsc --noEmit` reports only the two pre-existing errors in
the parallel session's uncommitted `app/api/leads/[token]/route.ts`;
`next lint` clean; `next build` compiles successfully and then stops
type-checking on that same uncommitted file. Both emails were rendered
through `npx tsx scripts/preview-ea-email.ts digest | rollup` and read —
the sample data gained a `builderOverdue` row (Jen, on shared A&M
Abatement) so the new section is exercised in HTML and plain text on both.

**Reclassifies nothing today, and the live check says why:** there are
currently **zero** overdue action items anywhere in the practice — not
one held by a client, a Builder, or nobody. Both buckets are empty for
both Builders. This is prevention, and the first overdue item assigned
across a shared client is the acceptance test.

## What was built — a lead arrives already owned (2026-08-06)

Same session as the two above. Migration `0118_onboarding_person_profile`.

**Ownership decides who hears about a lead, and nothing was setting
it.** `recipientsForProspect` has routed prospect notifications by owner
since the own-book work — owner alone, or the master admin triage inbox
when nobody owns it. But the only thing that ever wrote
`prospects.owner_user_profile_id` was a person creating a lead by hand.
Every inbound lead — website form, Meta, Google, and every booking —
arrived unowned, so every alert about every lead went to triage
regardless of whose link or whose name produced it. The routing rule was
correct and had almost nothing to route.

Three write points now, one rule between them:

1. **A discovery booking takes the link's Business Builder.** Whoever
   owns the `scheduling_links` row owns the lead that books through it.
2. **The Make.com bridge reads a `builder` field off the submission** and
   resolves it to a `user_profiles` row.
3. **An assessment coming back alerts the owner**, through
   `lib/pipeline/notify-assessment.ts` and the same
   `recipientsForProspect`.

**Name matching is exact and case-insensitive, deliberately not fuzzy.**
Restricted to `master_admin` / `coach` inside the org, and no match means
no owner. The asymmetry is the whole reason: assigning the WRONG owner is
worse than assigning none, because ownership *silences* everyone else's
alerts about that lead. A near-miss would not merely mislabel the card —
it would route the lead into a black hole where the person who should be
working it never hears about it and the person who does hear has no idea
who they are. An unowned lead still reaches triage, which is a visible,
recoverable state.

**An existing owner is never reassigned**, at all three write points.
Booking someone else's link, or a second form submission naming somebody
else, must not move a lead off the Business Builder already working
them — that is a live conversation, and the record following the most
recent web request rather than the relationship is how it gets dropped.
Claiming only ever fills a NULL.

**Bookings now match an existing lead by email** before inserting, the
way the intake webhook always has. They did not, so a lead already in the
pipeline who booked a call got a second card and their history split
across the two. Archived prospects are ignored, so a deliberately
archived lead who comes back is genuinely new.

**The assessment alert is the one that had never fired at all.** The
pre-meeting assessment normally lands on a lead that already exists —
someone was sent the link because a conversation was already booked — and
that path notified nobody. `notifyNewLead` only fires for a genuinely NEW
prospect, so the answers went into the database and the person about to
walk into the meeting was never told.

It does NOT fire on the webhook's booking branch, and that is deliberate
rather than an oversight: the booking branch is selected by the payload
carrying a `calendar_event_id`, and the pre-meeting assessment posts
without one, so nothing reaches that branch carrying an assessment.

### Person Profile becomes step 4 of onboarding

It used to be a hand-ticked panel on the PROSPECT, which put it in the
wrong half of the relationship — nobody sits a Person Profile while still
deciding whether to hire you. It belongs to the client who has signed,
and it belongs inside the onboarding run so it cannot be the one step
that gets forgotten. The tracker moved to the engagement page with it.

Last in the sequence because it is the only step that asks the client to
DO something (about 45 minutes) rather than to receive something; ahead
of the portal invite it would land the biggest ask before they have
anywhere to log in. Sent per participant rather than once to the primary
contact — the second participant has their own email on the record, and
forwarding is how a step gets quietly dropped.

**A missing `orgs.person_profile_assessment_url` SKIPS the step, it does
not fail the run.** TTI issues one survey link per context with no
per-person identity in it, so the link is practice-level configuration;
absent configuration is not a broken onboarding, and mailing a new client
a dead link on day one is worse than mailing nothing. The skip writes its
reason into `assessment_error` and stamps `completed_at`, so it is
visible on the record rather than silent — same reasoning as every other
step's error column.

0118 adds `assessment_sent_at` + `assessment_error` to `onboarding_runs`
and `person_profile_assessment_url` to `orgs`. **Numbered 0118, not
0114** — it was authored as 0114 and collided with the already-committed
`0114_notification_action_item_progress.sql`. The deploy runner keys
`_app_migrations` on filename so both would have applied, but two files
sharing a number is unreadable to anyone auditing the directory.

**The rename was made on the belief it had not been applied anywhere, and
that was wrong — which is the useful part.** `_app_migrations` now holds
the same migration under BOTH filenames: the old name at 15:41:57Z and
the new one at 16:14:51Z. 15:41 is a minute after the branch was first
pushed. **A branch deploy runs `migrate-on-deploy.mjs` against the
PRODUCTION database**, because the script skips only when `DATABASE_URL`
is unset or `SKIP_DB_MIGRATE=1`, and a branch build on this site has the
real one. So a migration reaches the live schema when the branch is
pushed, not when it is merged — and renaming a migration file after any
push makes the runner treat it as new and apply it a second time under
the new name.

Harmless here only because the file is `ADD COLUMN IF NOT EXISTS`
throughout: the second run was a no-op and the columns exist once. A
migration with a non-idempotent statement — an `INSERT`, an `UPDATE`, a
counter, a `DROP` — would have executed twice against production, and
the audit table would have said nothing was wrong. **Renaming an already-
pushed migration is only safe when the file is idempotent line by line.**
The stale `0114_onboarding_person_profile.sql` row is cosmetic (the
runner only ever asks whether a filename is present, so a row naming a
file that no longer exists is never consulted) and is left in place
rather than deleted, because a hand-edit of the audit table is a bigger
risk than an unused row.

**Caught in review, worth remembering:** the assessment alert's guard was
written as `"orgId" in result`. TypeScript normalises the transaction's
union so every branch declares the key — the booking branches as
`orgId?: undefined` — which means `in` cannot narrow any member out and
the value stayed `string | undefined`. **`in` narrowing does nothing on a
union whose members all declare the property**, however they declare it.
Narrowing on the value works. The same normalisation is why
`recordError`'s hand-written field union had to gain `assessmentError`
rather than inferring it.

**Verified:** `tsc --noEmit` and `next lint` clean; `next build`
compiles with 74 prerender failures and 148 `Missing publishableKey`,
zero errors of any other cause — the recorded baseline exactly.

**Deployed as `89743e2` on 2026-08-06; 0118 is applied and its three
columns are confirmed present on the live database. Not clicked in a
browser, and no email has been sent.** The acceptance tests: a lead
booking Jen's discovery link
shows Jen as Owner and alerts her alone; a website submission naming a
Business Builder claims the lead for them while a second submission
naming the other one leaves it alone; an assessment landing on an
existing lead emails its owner; and an onboarding run with no assessment
URL set completes with the skip recorded rather than failing.
