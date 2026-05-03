# Phase 1, Sub-Phase 1.1 Kickoff Prompt

This is the prompt to paste into Claude Code at the start of the first Phase 1 session.

**Goal of 1.1:** Replace the personal-org placeholder with real Clerk Organizations, add Phase 1 schema tables, build the engagement-creation form with Clerk-powered email invites.

**Estimated session time:** 2–3 hours.

---

## Pre-flight

Before pasting:

- You're back in your `C:\Code\the-builder\` project folder
- Run `git pull` to make sure local matches origin/main (if you've been away from the project)
- Run `pnpm install` if Claude Code suggests there are new deps (probably none yet)
- Have these ready in your password manager / saved somewhere accessible:
  - Your existing Clerk dashboard credentials (you'll use the same Clerk app)
  - Impactica's client lead email address (for the test invite at the end of the session)

---

## Instructions

1. `cd C:\Code\the-builder\`
2. Run `claude` to start Claude Code
3. Paste the prompt block below as your first message
4. Answer Claude Code's clarifying questions
5. Execute Sub-Phase 1.1 (2–3 hours)

---

## --- PROMPT BELOW ---

```
You are pair-programming with Bruce on Sub-Phase 1.1 of Phase 1 — 
Foundation Refactor for The Builder. Read CLAUDE.md and docs/Phase-1-Plan.md 
in this directory first. Phase 0 shipped at v0.1.0; we're building on top.

Sub-Phase 1.1 has three intertwined goals:

  1. Migrate from the Phase 0 personal-org placeholder to real Clerk 
     Organizations. The Phase 0 pattern auto-created an org per signup 
     using clerk_user_id as the clerk_org_id; that's a placeholder. 
     Now we use real Clerk Orgs.

  2. Add Phase 1 schema: action_items, messages (with contextual-conversation 
     pattern), documents, document_tags, notifications, plus engagements.started_at. 
     RLS policies and set_updated_at triggers for every new tenant-scoped 
     table.

  3. Build the Coach Console engagement-creation form. Bruce fills in 
     name, type, client_lead_email, start_date. Submit creates: a real 
     Clerk Organization via Clerk's Backend API, an engagement row 
     scoped to that org, and triggers Clerk's invitation email to the 
     client lead.

Acceptance criterion for 1.1: Bruce signs into Coach Console, fills in 
"Impactica / Accelerator / [test email] / 2026-05-15", submits. A new 
Clerk Org appears in Clerk dashboard. An engagement row appears in 
Neon. The test email receives a Clerk invitation email. Clicking the 
invitation link lets a new user sign up and land in Impactica's portal 
as Client Lead (NOT master_admin).

BEFORE WRITING ANY CODE, ask Bruce these clarifying questions:

  1. Migration plan for Bruce's existing personal org (id 
     29af29d7-3ad1-47fd-81af-24151aa78ecf, type=master). Two options:
     (a) Create a real Clerk Organization called "Workplaces", make 
         Bruce a member with role=master_admin, update the orgs row 
         to use the new clerk_org_id and reference Bruce's user_profile.
     (b) Drop the existing data entirely (it's test data anyway), 
         start fresh. Bruce signs back in via the new flow which 
         creates a real Clerk Org as part of the bootstrap.
     Recommend (a) — preserves continuity, exercises the migration 
     path we'll need for any future schema changes.

  2. Engagement creation UI placement. Where does the form live?
     (a) New /coach/engagements/new route — a simple Coach Console 
         entry that only Bruce (master_admin) can access.
     (b) Inline on /portal — a "+New engagement" button that expands 
         to a form when Bruce is signed in as master_admin.
     Recommend (a) — keeps coach-side and client-side concerns separated 
     in the route structure.

  3. How does the engagement-creation form invite the client lead? 
     Two options:
     (a) Use Clerk's Backend API directly — create the Org server-side, 
         invite the user via Clerk's invitation API, Clerk handles the 
         email send.
     (b) Use Clerk's Organization invitation widget client-side after 
         the Org is created server-side.
     Recommend (a) — backend control is cleaner, Clerk's API supports 
     the full flow from Node.

  4. What happens to a brand-new sign-up that arrives WITHOUT an 
     invitation? Three options:
     (a) Block them — show a "you need an invitation" page. Only 
         invited users can sign up.
     (b) Allow sign-up but route them to a "waiting for engagement" 
         state with no portal access.
     (c) Allow sign-up, create a personal-org-style fallback (the 
         Phase 0 pattern), with role = prospect.
     Recommend (a) for simplicity — Phase 1 only needs invited users.

Once those four are answered, execute Sub-Phase 1.1 in this order, 
confirming with Bruce between major steps:

STEP 1 — SCHEMA MIGRATIONS
  • Generate Drizzle schema for: action_items, messages, documents, 
    document_tags, notifications. Plus alter engagements to add 
    started_at (timestamptz nullable).
  • messages table critical fields: parent_entity_type (text, e.g. 
    'engagement', 'action_item', 'deliverable'), parent_entity_id 
    (uuid), body (text), author_user_profile_id (uuid), mentions 
    (jsonb array of user_profile UUIDs), edited_at (timestamptz null).
  • action_items table critical fields: status enum ('draft', 'open', 
    'in_progress', 'done', 'blocked'), assignee_user_profile_id (uuid 
    null), due_date (timestamptz null), revenue_impact (boolean), 
    margin_impact (boolean), fireflies_transcript_id (text null), 
    confidence_flag enum ('high', 'medium', 'low', null), 
    created_by enum ('coach', 'claude'), engagement_id (uuid).
  • documents critical fields: blob_key (text — Netlify Blobs key), 
    original_filename (text), file_type (text), size_bytes (bigint), 
    uploader_user_profile_id (uuid), engagement_id (uuid).
  • document_tags: composite key (document_id, tag), tag is text.
  • notifications: user_profile_id, type enum, parent_entity_type, 
    parent_entity_id, read_at (null), sent_via enum ('email', 'in_app', 
    'both').
  • All tenant-scoped tables get org_id with FK + index. RLS policies 
    via auth.org_id(). set_updated_at triggers (manually appended to 
    the migration; Drizzle won't generate them — same pattern as Phase 0).
  • Show me the generated SQL before applying. Apply via 
    pnpm drizzle-kit migrate. Verify with information_schema.tables 
    queries.

STEP 2 — REAL CLERK ORGANIZATIONS MIGRATION
  • Per Bruce's answer to Q1, either preserve or reset existing data.
  • If preserving: write a one-off migration script that creates a 
    Clerk Organization named "Workplaces" via Backend API, joins 
    Bruce as member with admin role, updates orgs.clerk_org_id to 
    the new value.
  • Update the user provisioning code path: a new sign-up arriving 
    via invitation gets joined to the inviting org, role inferred 
    from the invitation's metadata.
  • A new sign-up arriving WITHOUT an invitation hits whatever Q4 
    answer was chosen.
  • The withTenantContext / withBootstrapContext helpers may need 
    minor updates to pull org_id from Clerk's session organization 
    rather than from app-managed personal orgs.

STEP 3 — ENGAGEMENT CREATION FORM
  • New route: /coach/engagements/new (or whatever Bruce chose in Q2)
  • Access control: only master_admin role can hit this route. 
    Middleware enforces.
  • Form fields: engagement_name (text), engagement_type (enum select), 
    client_lead_email (email), client_lead_full_name (text), 
    start_date (date picker).
  • Submit handler (server action):
      - Create Clerk Organization with name = engagement_name + " — Client Org"
      - Create orgs row in our DB with clerk_org_id, type='client', 
        name=engagement_name
      - Create engagement row scoped to the new org
      - Send Clerk invitation to client_lead_email with role='client_lead' 
        encoded in invitation metadata
      - Wrap the inserts in withBootstrapContext (uses the new org's 
        UUID) so RLS doesn't block them
      - Return success message with the new engagement's URL
  • UI: simple shadcn form, Builder palette. Submit button shows 
    pending state during the API calls.

STEP 4 — TEST WITH IMPACTICA TEST DATA
  • Create a test engagement: "Impactica Test", Accelerator, a real 
    test email Bruce can access (his bbaker+impactica@4workplaces.com 
    alias works), start_date = 2026-05-15.
  • Verify: Clerk dashboard shows new Org. Neon orgs table shows new 
    row with type=client. engagements table shows the new row.
  • Bruce checks the test email — should receive a Clerk invitation 
    within seconds.
  • Bruce clicks the invitation link, signs up as the new user, 
    lands on /portal/[engagementSlug] (or just /portal if we don't 
    have engagement-scoped routes yet — that's Phase 1.2 work) 
    showing the Impactica engagement context.
  • Confirm role = client_lead (NOT master_admin).

STEP 5 — DOCUMENT
  • Update CLAUDE.md: revise the org / Clerk Org mapping description 
    to reflect the new pattern. Add a "What was built in 1.1" entry.
  • Update docs/decisions.md: capture the Clerk-Orgs-replaces-personal-orgs 
    decision, the Q1-Q4 answers, any gotchas hit during the migration.
  • Commit with conventional message ("feat(orgs): real Clerk Organizations 
    + Phase 1 schema + engagement creation flow")
  • Tag as v0.2.0
  • Push commits + tags

CONSTRAINTS — IMPORTANT:

  • Multi-tenant RLS still bites every new table. Don't add a new 
    table without ENABLE/FORCE RLS, a tenant-isolation policy, and 
    set_updated_at trigger. The Phase 0 verify-rls.mjs pattern still 
    applies — extend or copy it for Phase 1 tables.
  • The Workplaces brand stays consistent: Drafting Cream, Foreman 
    Black, Steel Blue, Safety Vest Orange. Big Shoulders for headings, 
    Work Sans for body. The new Coach Console pages need to match.
  • TypeScript strict, server components first, server actions for 
    mutations, Zod for validation, Drizzle for DB access.
  • Clerk's Backend API key (CLERK_SECRET_KEY) is what the server 
    uses to create Orgs and send invitations. Already in .env.local 
    and Netlify from Phase 0.
  • Bruce's working hours are 8:30 AM – 6:00 PM Mountain Time, Mon-Fri. 
    Don't schedule any cron / trigger / send to fire outside those.

If anything in CLAUDE.md or Phase-1-Plan.md is unclear, ask before 
assuming. Begin with the four clarifying questions, then proceed.
```

## --- END PROMPT ---

---

## After 1.1 Ships

Send the session summary back to Cowork. I'll write the Sub-Phase 1.2 kickoff (Action Items module — manual creation, status, assignment, due dates).

Each sub-phase ends with a tagged commit so we have clean rollback points. After 1.1: `v0.2.0`. After 1.7 (pilot launch): `v1.0.0` if everything lands.
