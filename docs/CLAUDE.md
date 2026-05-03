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

## Active Phase

**Phase 0 — Foundation.** Goal: stand up the empty scaffold and confirm every layer works end-to-end. Use The Builder brand colours and typography from the first commit.

When Phase 0 completes, this section moves to Phase 1.
