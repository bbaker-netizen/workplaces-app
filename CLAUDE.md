# CLAUDE.md — Workplaces Application

This file is read by Claude Code at the start of every session. Keep it updated as the project evolves.

**Replaces the previous CLAUDE.md.** This is v2 of the file (May 2 2026), incorporating twelve clarifications since v1.

---

## Project Overview

**Owner:** Bruce Baker — Workplaces (HR All-In Inc), Edmonton, Alberta, Canada
**Coaches:** Bruce (active). Jen (BPYM, deferred). Future hires planned.
**Methodology:** Business Building coaching for SMBs (construction & trades focus, all industries supported)
**Status:** Phase 0 — initial scaffold

The Workplaces Application is the **complete operational layer** for the Workplaces coaching business — the entire end-to-end client experience from prospect to renewal lives in this one application. It replaces every fragmented tool in the current stack: Monday.com (gone), Drive as a client-facing surface (gone), separate scheduling tools (gone), separate course platforms (gone), separate contract systems (gone). Specialist tools that earn their keep — Fireflies, TTI TriMetrix HD, Adobe Sign, Stripe, Anthropic Claude — connect via API and remain invisible to clients.

The coach side runs in **Cowork** through the Workplaces Plugin — that side is NOT in this repo. This repo is the **client-facing web application** plus the **Workplaces MCP** that bridges Cowork to this app's database.

Reference document: `Workplaces — Custom Application Architecture — v1.4 — 2026-05-02.docx` (in `docs/`).

---

## End-to-End Workflow This App Replaces

| Stage | Today (fragmented) | New Application (one place) |
|-------|-------------------|------------------------------|
| Prospect intake | Netlify diagnostic + email + manual Monday entry | Native diagnostic form; submission auto-creates a Prospect record |
| Proposal & contract | Drafted in Drive, sent via email, signed in Adobe Sign, stored back in Drive | Generated in-app, embedded Adobe Sign signature flow, signed contract auto-stored |
| Client onboarding | New Drive folder, Monday board, intake emails | Portal access auto-provisioned, intake forms in-app, kickoff scheduled in-app |
| Document storage | Drive folder per client, shared by link | Documents uploaded to the engagement; clients never see Drive |
| Business Building Sessions | Fireflies records, transcript in Fireflies, action items copied to Monday manually | Fireflies feeds BBS Studio via API; action items auto-extracted as drafts, you edit/assign, you publish |
| Project work (app builds, hiring drives, marketing initiatives) | Separate Monday board per project — clients confused which board to check | Projects module inside the same portal — every project lives in one place |
| Deliverables (the 9 types) | Templates in Drive, drafted in Word, manually shared | Generated in-app, reviewed in Deliverables module, delivered to portal |
| Communication | Email + Monday updates + Slack | One threaded module in the portal, with @mentions, file attachments, AI summaries |
| Hiring | TTI assessment PDFs in Drive + interview transcripts in Fireflies + manual gap reports | Hiring Pipeline module: TTI score ingestion, interview prep, gap analysis, candidate assessment, offer, onboarding |
| Course delivery (LMDS / ELS) | Not delivered through any platform yet | Course Studio module — native LMS with cohort + self-paced delivery |
| Embedded apps (Netlify projects) | Linked-out from Monday, broken context for clients | Embedded App module — native iframe widgets pulling from Bruce's Netlify account |
| Client subscriptions & assets | Tracked nowhere; offboarding relies on memory | Client Assets & Subscriptions module — itemized inventory of every Netlify app, Make scenario, hosted service Bruce maintains for the client |
| Renewal / offboarding | Email + Adobe Sign + manual closeout | In-app renewal flow with auto-generated proposal; clean handoff via Subscriptions module |

---

## Workplaces Methodology — Things to Know

These are not generic CRM concepts. They're first-class entities in the data model:

- **Business Building Sessions (BBS):** Twice-monthly 2-hour sessions with each client (one in-person, one virtual).
- **The 9 Deliverable Types:** SOPs/Process Flows, Org Charts, Job Profiles & Interview Guides, Financial Dashboards, **Workplaces Application Onboarding Guides**, **Client Operations Setup Guides** (tool-agnostic), Business Plans, Marketing Plans, Stages of Growth Assessments. (Monday Board Setup Guides retired in v1.3 of the architecture.)
- **Soul File:** A long-form context document per client engagement. Vector-embedded for semantic retrieval.
- **TTI TriMetrix HD assessments:** Per-person Behaviours / Driving Forces / Competencies scores. TTI Admin (the platform) stays external — assessments configured and taken there. The gap report PDF is the bridge into the new app.
- **Differential Weighting:** Behaviours 40%, Driving Forces 35%, Competencies 25%. **Internal only — never shown in the client portal.**
- **Stages of Growth framework:** Track where each client sits on the framework. Framework names are visible to clients; weighting numbers and proprietary scoring are not.
- **Quality Gate:** Every deliverable must move top-line revenue, protect margin, or both. Tag entities (action items, deliverables, goals, projects) with `revenue_impact` and `margin_impact` flags.

### Methodology IP Exposure Rules (Important)

- **Visible to clients in the portal:** Framework names, educational explanations, the nine deliverable categories, the top-line / margin quality gate, the Stages of Growth framework concepts.
- **Internal to coach side only:** The 40/35/25 weighting numbers, scoring rubrics, proprietary algorithms, raw assessment scores.

---

## Subscriptions & Client Assets — Business Model

The default billing model is **Model C — Productized Retention.** Bruce maintains all client-facing infrastructure (Netlify apps, Make.com scenarios, Resend, Clerk, custom domains) under his accounts indefinitely, even after the coaching engagement ends. The client pays a smaller monthly retainer post-engagement to keep their tech operational. Bruce becomes their tech operator, not just their coach.

Models A (transfer at end) and B (client-owned from day one) are available as **graduation paths** — when a client matures and wants to take ownership in-house, the Client Assets & Subscriptions module guides the handoff.

The architecture supports all three models. The default is C.

---

## The Stack — What to Use

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) + TypeScript | Server components by default; client components only where needed |
| UI | Tailwind CSS + shadcn/ui | Install via CLI on demand |
| Hosting | Netlify | Already in Bruce's stack; use `netlify.toml` |
| Database | Neon (Serverless Postgres) | Already in Bruce's stack. Use database branching for safe migrations. |
| ORM | Drizzle ORM | TypeScript-first |
| Migrations | Drizzle Kit | Versioned migrations committed to git |
| Multi-tenancy | Postgres Row-Level Security (RLS) | Enforce at the database. Every tenant-scoped query must hit RLS. |
| Auth | Clerk | Use Clerk's organizations feature to model coaches and client orgs |
| File Storage | Netlify Blobs | Same vendor as hosting; S3-compatible |
| Vector / Embeddings | Neon pgvector | For Soul File semantic search |
| Background Jobs | Inngest + Netlify Scheduled Functions | Inngest for durable workflows, Netlify cron for simple recurring tasks |
| Realtime | Server-Sent Events + Postgres LISTEN/NOTIFY | No third-party realtime service |
| Email | Resend | Transactional only |
| Payments | Stripe | Subscription billing for Model C retainers + one-time invoices |
| External: Fireflies | Read transcripts via Fireflies API | Extract action items as drafts |
| External: Adobe Sign | Embedded for contracts/proposals | Already in Bruce's stack |
| External: TTI TriMetrix HD | Stays external; PDF gap reports uploaded into the app | API limited |
| External: Netlify (other accounts) | Read project list via Netlify API for Embedded App module | Bruce already runs Netlify; same credentials |
| AI | Anthropic Claude API | All Generate buttons, Soul File RAG |
| MCP Server | TypeScript MCP SDK | Workplaces MCP deployed as a Netlify Function |

### Removed from earlier versions

- **QuickBooks Online integration** — dropped. Bruce works in client QBO directly when needed; no client-side QBO data flows into this app.
- **Google Drive (client-facing)** — dropped. Documents live in the app via Netlify Blobs. Drive may remain for Bruce's internal Workplaces operations only.
- **Monday.com** — replaced entirely. No mention in the runtime stack.

### Versions

- Node 20 LTS (use `.nvmrc`)
- pnpm package manager
- TypeScript 5.x in strict mode

---

## Architecture Summary

### Two physical environments connected by one database

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   COWORK (Bruce, Jen, etc.)  │         │   CLIENT PORTAL (Web App)    │
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
| `engagement` | The active relationship (Accelerator or Implementer). Owned by a Coach. |
| `bbs_session` | A 2-hour business-building session. |
| `action_item` | Owned, dated commitment. Has `status: draft \| published`, `assignee_user_id`, `created_by` (coach or claude), `confidence_flag`, `revenue_impact`, `margin_impact`. |
| `goal` | SMART goal tied to top-line or margin. |
| `project` | A discrete initiative within an engagement (app build, hiring drive, marketing campaign). Has `name`, `status`, `lead_user_id`, `start_date`, `target_completion_date`. |
| `task` | Belongs to a project. Has `order`, `status`, `assignee_user_id`, `due_date`, `dependencies`, `percent_complete`. |
| `milestone` | Named checkpoint within a project. Tied to one or more tasks. |
| `soul_file` | Long-form vector-embedded context per engagement. |
| `deliverable` | One of 9 types. |
| `person_profile` | TTI assessment record per individual. |
| `hire` | Candidate moving through the hiring pipeline. |
| `course` | LMDS, ELS, future programs. Cohort + self-paced delivery modes. |
| `cohort` | A group moving through a course together. |
| `lesson` | Individual unit within a course (video, text, exercise, quiz). |
| `enrollment` | Assigns a user to a course or cohort, tracks completion. |
| `form` | Diagnostic, intake, pulse, NPS. |
| `invoice` | Issued to a Client Org via Stripe. |
| `subscription_asset` | Per-engagement record of every external service Bruce maintains for the client (Netlify project ID, Make scenario URL, domain, etc.). Has `monthly_cost`, `paid_by` (bruce/client/passthrough), `transfer_status`. |
| `embedded_app` | A Netlify project surfaced as a portal module for one or more engagements. Has `netlify_project_id`, `display_name`, `auth_mode`. |
| `document` | Versioned files per engagement. |
| `message` | Threaded communication; supports @mentions, AI summaries. |
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
15. **Client Assets & Subscriptions** (inventory of services Bruce maintains for the client)
16. Hiring Pipeline (per-engagement candidate tracking)

**Custom modules (Phase 4+):** Each engagement can have additional modules built specifically for it. New module types use a module template — Bruce or a future hire writes the schema + UI + permissions, Claude Code scaffolds the boilerplate.

### Coach Console — Cowork Live Artifacts

What Bruce, Jen, and future coaches see in Cowork (NOT in this repo, but reads from this DB via the Workplaces MCP):

| Live Artifact | Shows |
|---------------|-------|
| **My Work** | Every action item + task assigned to me across all engagements, sorted overdue → due today → this week → backlog. Filterable by client. |
| Coach Dashboard | Next BBS sessions, overdue items by client, risk flags |
| BBS Prep | Per-session: agenda draft, last session's actions, transcript highlights |
| Deliverables Tracker | Cross-client status of all 9 deliverable types |
| Pipeline | Prospect → diagnostic → proposal → contract → onboarded |
| Projects (cross-client) | All active projects across all engagements, drag-to-reorder, Claude-drafted plans |
| Subscriptions Inventory | All client assets across the firm, renewal calendar, transfer-pending list |
| Hiring Pipeline | All active hires across all engagements |

---

## Action Items — Draft / Publish Flow

When Fireflies returns a transcript:

1. Claude extracts proposed action items as **drafts** (`status: draft`, `created_by: claude`).
2. Each draft has a `confidence_flag` (high/medium/low) so you can prioritize review.
3. Coach opens the draft in the Coach Console (or in Cowork via the BBS Prep Live Artifact).
4. Coach edits text, sets due date, sets assignee from a dropdown of every user attached to that engagement.
5. Coach clicks **Publish**. Status changes to `published`. Item appears in assignee's portal view.
6. Assignee receives email + in-app notification.

Action items can also be created directly by a coach without a transcript — same data model, `created_by: coach`, no draft step needed.

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
- Generate buttons trigger the existing Workplaces skills via Claude API:
  - `workplaces-gap-analysis` produces percentage match analysis
  - `workplaces-interview` produces topgrading interview guide
  - `workplaces-hiring` produces candidate assessment
  - `new-employee-onboarding` produces offer letter + manager + employee onboarding guides
- Status pipeline: Assessing → Interview Scheduled → Decision Pending → Offer Sent → Hired
- Client Lead sees the pipeline status, reviews artifacts, sees offers

The skills are the engine; the module is the workflow + database.

---

## Embedded Apps Module — Netlify-Backed Widgets

The Workplaces Application connects to Bruce's Netlify account via the Netlify API (same credentials as the Netlify MCP). When configuring an engagement, the coach clicks "Add Embedded App," picks a Netlify project from a dropdown, gives it a display name for that client, configures auth mode if needed, and the app appears as a module in that client's portal.

**Auth modes:**
- `public` — embedded app is publicly accessible (no auth needed)
- `token_passthrough` — Workplaces App generates a signed token containing the user's identity; embedded app validates it
- `clerk_sso` — embedded app uses Clerk; SSO works automatically

Not every existing Netlify app embeds cleanly. Phase 3 supports `public` and `token_passthrough`. Future Netlify apps Bruce builds for clients should be designed with embedding in mind from the start.

---

## Conventions

### Code Conventions

- **TypeScript strict mode** — no `any` without comment justification
- **Server Components first** — `"use client"` only where interactivity demands it
- **Server Actions for mutations** — no separate API routes for forms unless required by a third-party integration
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
  /skills                     Server-side wrappers around Workplaces Anthropic skill calls
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
- **TypeScript types/interfaces:** PascalCase
- **Constants:** SCREAMING_SNAKE_CASE
- **Env vars:** SCREAMING_SNAKE_CASE with provider prefix

### Multi-Tenancy

**Every tenant-scoped table MUST have:**
- An `org_id` column referencing `org.id`
- An RLS policy enforcing `org_id` matches `auth.org_id()` (custom function reading from Clerk JWT)
- Indexes including `org_id` first

**Test every query** against a different org's data to confirm RLS bites. Failure mode is silent and catastrophic.

### Brand & UI

**Brand direction: The Builder.** Locked 2026-05-02. Selected from three candidates (The Builder, TopLine, NorthForge). Reference imagery in `docs/Brand-01-Cover.png` through `docs/Brand-05-Decision.png` and `docs/Workplaces-Brand-Concepts-Linearized-2026-04-25.pdf`. Design philosophy: "Ledger Modernism" — see `docs/Workplaces — Brand Design Philosophy — 2026-04-25.md`.

**Naming**

| Surface | Use |
|---------|-----|
| Customer-facing | "The Builder" |
| Formal attribution | "The Builder · By Workplaces" |
| Repo / folder | `workplaces-app` (unchanged for continuity) |

**Palette**

| Token | Hex | Usage |
|-------|-----|-------|
| Foreman Black | `#1A1A1A` | Primary ink, body text, primary buttons, headings |
| Drafting Cream | `#F5F1E8` | Page background, cards |
| Steel Blue | `#2E4057` | Secondary buttons, links, structural accents |
| Safety Vest Orange | `#E87722` | Status flags, single CTAs — sparingly, never as background |
| Neutral Grey 1 | `#666666` | Secondary labels, captions |
| Neutral Grey 2 | `#CCCCCC` | Borders, dividers |

**Typography**

| Family | Use | npm package |
|--------|-----|-------------|
| Big Shoulders Display (Bold) | Display headings | `@fontsource/big-shoulders-display` |
| Work Sans (Regular, Bold) | Body, UI | `@fontsource/work-sans` |
| IBM Plex Mono | Code, monospace data | `@fontsource/ibm-plex-mono` |
| Instrument Serif (Italic) | Optional editorial moments, sparingly | install when first used |

**Tailwind theme extension:** `font-display` = Big Shoulders Display, `font-sans` = Work Sans, `font-mono` = IBM Plex Mono. Body text default 16px. Display headings start at 28px.

**Logo (Phase 0):** Wordmark only — "THE BUILDER" set in Big Shoulders Bold, Foreman Black on Drafting Cream. The full beam-and-column "B" mark ships as an SVG before Phase 1.

**PWA manifest**

- `name`: "The Builder"
- `short_name`: "Builder"
- `theme_color`: `#1A1A1A`
- `background_color`: `#F5F1E8`

Mobile-first responsive design. PWA from day one — `manifest.json`, service worker for offline-friendly action item viewing.

---

## How to Work With Bruce

Bruce is not a developer. He's a coach building this with AI assistance. He's smart about systems and product but doesn't read code fluently.

### Communication

- **Always confirm structural decisions before executing them.** Especially: schema changes, new dependencies, deployment changes, anything that touches multi-tenancy.
- **Ask clarifying questions when underspecified.** Bruce prefers being asked over having to fix wrong assumptions later.
- **Explain the "why" not just the "what"** in plain language.
- **No jargon dumps.** "Postgres row-level security" needs a one-sentence explanation the first time it comes up.

### Quality Gate

Every feature must answer: does this move top-line revenue, protect margin, or both? If neither, flag it before building.

### Scheduling Constraint

Bruce's working hours are Monday–Friday, 8:30 AM–6:00 PM Mountain Time. Do not generate emails, notifications, or scheduled tasks that fire outside that window unless explicitly requested.

---

## Active Phase

**Phase 0 — Foundation.** Goal: stand up the empty scaffold and confirm every layer works end-to-end.

When Phase 0 completes, this section moves to Phase 1.
