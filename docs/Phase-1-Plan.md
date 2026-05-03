# Phase 1 Plan — Client Portal MVP

**Goal:** Run one full BBS session for Impactica entirely through The Builder. Action items captured via Fireflies AI extraction, communication threaded contextually per entity, documents uploaded and accessed in-app, all wrapped in real Clerk Organizations with email-invited client lead.

**Date set:** May 2026
**Pilot client:** Impactica (single pilot)
**Build pace:** Steady, 4–6 weeks at 2–3 evenings per week
**Acceptance criterion:** One BBS session run cleanly through the portal — agenda viewed beforehand, Fireflies-extracted action items reviewed and published, client sees them in their portal.

---

## Decisions Locked

From three rounds of design conversation in Cowork:

| Decision | Locked |
|----------|--------|
| Onboarding flow | Email invite via real Clerk Organizations (replaces personal-org placeholder from Phase 0) |
| Webhook-driven provisioning | Deferred to Phase 2 — first-visit auto-provision continues |
| Conditional role assignment | Folded into invite system (invitees get the role their invitation carries) |
| `engagements.started_at` field | Added in 1.1 |
| Email notifications (Resend) | Wired up in Phase 1 |
| Action Items module scope | Manual creation + Fireflies AI extraction |
| Communication module structure | Contextual conversations (per-entity threads + general thread per engagement); skip channels |
| Communication AI features | @mention email notifications only; auto/on-demand summaries deferred |
| Documents module | Coach + Client Lead can upload; flat list with tags |
| Pilot scope | Impactica only |
| Invite scope | Client Lead only (managers/employees Phase 2+) |
| BBS Sessions full module | Deferred to Phase 2 — Phase 1 just stores Fireflies transcript IDs on action items |
| Soul File module | Deferred to Phase 2 |
| Goals, Projects, Hiring Pipeline | Deferred to Phase 2/3 |

---

## Open Operational Items (Bruce to Address)

These are non-code decisions that need to happen alongside the build:

1. **Existing `workplaces-hr-app` for Impactica.** Confirm whether it's still serving them or was always experimental. If the former, plan the transition narrative ("we're moving you to a new tool that better fits how we coach"). If the latter, just decommission quietly.

2. **Resend sender domain.** Before sub-phase 1.4 (email notifications), verify a sender domain in Resend so notification emails come from `notifications@4workplaces.com` or similar — not from a generic Resend address. ~10 minutes of DNS work + ~5 minutes in Resend dashboard.

3. **Fireflies API key.** Sub-phase 1.6 requires Fireflies API access. Generate a personal API key in Fireflies dashboard and have it ready. Store in `.env.local` as `FIREFLIES_API_KEY` and add to Netlify env vars.

4. **Impactica's client lead.** Confirm name and email of the person who'll receive the invite. Ideally someone you know logs in regularly, not a CFO who'll forget the password.

5. **Brief Impactica before launch.** A 5-minute call or message saying "we're building you a new portal that replaces our Monday board, here's what's coming, you'll get an invite email in [N] weeks." Sets expectation, builds buy-in.

---

## The 7 Sub-Phases

Each is one Claude Code session of 1–3 hours. After each ships, Bruce returns to Cowork for the next kickoff prompt.

### Sub-Phase 1.1 — Foundation Refactor

**Goal:** Replace the personal-org placeholder with real Clerk Organizations, add Phase 1 tables, build the engagement-creation form and invite flow.

**Build:**
- Schema migrations: `action_items`, `messages` (with `parent_entity_type` + `parent_entity_id` for contextual conversations), `documents`, `document_tags`, plus `engagements.started_at` field
- RLS policies + `set_updated_at` triggers for every new tenant-scoped table
- Real Clerk Organizations migration plan: existing user (Bruce) becomes member of master Workplaces org with a real `clerk_org_id`; personal-org placeholder logic retired
- Coach Console form for creating an engagement: name, type, client lead email, start_date
- Submit creates: Clerk Org via Clerk API → engagement row → Clerk invitation email (Clerk handles the email sending for invites natively)
- Update CLAUDE.md and decisions.md to reflect the migration

**Acceptance:** Bruce signs into Coach Console, fills in "Impactica / Accelerator / impactica.lead@email / 2026-05-15", submits. Clerk Org appears in Clerk dashboard. Engagement row in Neon. Impactica's lead receives an invitation email from Clerk (sandbox deliverability fine for now).

### Sub-Phase 1.2 — Action Items Module (Manual)

**Goal:** Build the manual creation, edit, assignment, and status-tracking experience for Action Items. Foundation for AI extraction later.

**Build:**
- Action Items CRUD UI
- Status pills: Open / In Progress / Done / Blocked
- Assignee picker (any user_profile in the engagement)
- Due date picker
- Revenue impact / margin impact tags
- Coach view (cross-engagement) and client view (single engagement)
- "Drafts" section visible to coach only (empty until AI extraction lands in 1.6)

**Acceptance:** Coach creates 3 test action items in Impactica's engagement, sets due dates and assignees. Coach can update status. Client can update status on items assigned to them.

### Sub-Phase 1.3 — Communication Module + Contextual Conversations

**Goal:** Threaded messaging per entity, plus an engagement-wide general thread.

**Build:**
- Threaded messaging UI (composer, message list, reply, edit, delete)
- Per-entity threads: action items, deliverables (forward-looking), engagement
- General thread per engagement (parent_entity_type = 'engagement')
- Recent Activity view showing latest messages across all entities in the engagement
- Markdown rendering in messages

**Acceptance:** Coach posts a message on an action item — it appears in the action item detail view AND in the engagement's Recent Activity. Same for the general thread.

### Sub-Phase 1.4 — @Mentions + Resend Wiring

**Goal:** Mentioning a user triggers email + in-app notification. Email goes through Resend.

**Build:**
- @mention parser in message composer
- @mention rendering (chip/badge in messages)
- Notification system: in-app notification record + email send
- Resend integration wired up via verified sender domain
- Email templates for: @mention notification, invite (already covered by Clerk in 1.1, but confirm), action item assigned, action item due-date approaching

**Acceptance:** Coach @-mentions Impactica's lead in a message. Lead receives an email within seconds. Email link clicks through to the relevant message thread.

### Sub-Phase 1.5 — Documents Module

**Goal:** Upload, tag, download, and preview documents per engagement.

**Build:**
- Document upload UI (drag-drop)
- Netlify Blobs integration for file storage
- Tag system (free-text tags or controlled vocabulary; start free-text)
- Filter by tag
- Download
- Preview for PDF and image types
- Coach AND Client Lead can upload (per Phase 1 decision)

**Acceptance:** Bruce uploads Impactica's existing org chart PDF. Tags it `org-chart`. Impactica's lead can see it, filter for `org-chart`, preview, download.

### Sub-Phase 1.6 — Fireflies AI Extraction

**Goal:** Process a real BBS transcript through Claude and have draft action items appear in Coach Console for review and publish.

**Build:**
- Fireflies API connection (GraphQL)
- Manual trigger button on Coach Console: "Process this transcript" with a transcript ID input
- Claude extraction prompt (designed to capture: action item text, owner inferred from speaker, due date if mentioned, revenue/margin tag inferred from context)
- Drafts saved to action_items table with `status = draft`, `created_by = claude`, `confidence_flag` populated
- Coach review UI: edit text, change assignee, change due date, change tags, then click Publish
- Published items move to `status = open` and appear in client portal

**Acceptance:** Bruce takes a recent Impactica BBS transcript, runs it through the extraction. 3–5 draft action items appear with sensible owners and reasonable confidence flags. Bruce edits one or two, publishes. Drafts that survive publishing appear in Impactica's portal.

### Sub-Phase 1.7 — Pilot Launch

**Goal:** Take Impactica live on The Builder. Run one BBS through it.

**Build:** Mostly operational, minimal code.
- Create Impactica's real engagement (replacing any test data)
- Send the invitation email to Impactica's actual client lead
- Walk through the portal together (call or screen share)
- Run the next BBS using The Builder as the system of record (agenda, action items, communication)
- Capture feedback in `docs/decisions.md` for Phase 2 priorities
- Tag commit as `v1.0.0` if everything lands cleanly

**Acceptance:** The success criterion from the top of this doc is met. One full BBS run cleanly through the portal.

---

## Schema Additions in Phase 1

For reference. Full migration code lives in the codebase; this is the conceptual map.

| New table | Purpose |
|-----------|---------|
| `action_items` | Owned, dated commitments. Status (draft/open/in_progress/done/blocked), assignee_user_id, due_date, revenue_impact, margin_impact, fireflies_transcript_id, confidence_flag |
| `messages` | Threaded messages. parent_entity_type (action_item/deliverable/engagement/etc), parent_entity_id, body (markdown), author_user_id, mentions (jsonb of user_profile_ids), edited_at |
| `documents` | Versioned files per engagement. file_url, file_type, size_bytes, uploader_user_id |
| `document_tags` | Tags on documents. Many-to-many with documents. Free-text tag values for Phase 1. |
| `notifications` | In-app and email notification records. user_id, type, parent_entity_id, read_at, sent_at |

| Modified table | Change |
|----------------|--------|
| `engagements` | Add `started_at` (timestamptz, nullable) |
| `orgs` | `clerk_org_id` becomes a real Clerk Organization ID; existing data migrated |
| `user_profiles` | Confirm role gets set from invitation context, not blanket master_admin |

All new tables follow the Phase 0 conventions: `org_id` column with FK and index, RLS policies enforced via `auth.org_id()`, `set_updated_at` triggers, UUID primary keys via `gen_random_uuid()`.

---

## What's Explicitly Deferred to Phase 2+

Naming these so they don't sneak into Phase 1 scope:

- BBS Sessions module (full lifecycle, agenda, transcript display)
- Soul File (vector-embedded engagement context)
- Goals & Accountability
- Projects with tasks and milestones
- Hiring Pipeline
- Person Profile Library
- Course Studio (LMS)
- Forms & Assessments
- Scheduling & Calendars
- Embedded Apps
- Client Assets & Subscriptions
- Coach My Work Live Artifact (in Cowork)
- Webhook-driven provisioning
- AI summaries (auto and on-demand) on communication
- Channels-based communication (we're going contextual instead)
- Multi-coach onboarding (Jen, future hires)
- Production Clerk keys (`pk_live_`)
- Custom domain (workplaces-the-builder.netlify.app stays as-is)
- Communication channels (single-thread or contextual is sufficient for one pilot)

---

## Working Cadence

Same pattern as Phase 0:

1. Bruce returns to Cowork between sub-phases
2. I write the next kickoff prompt informed by what shipped
3. Bruce pastes into Claude Code
4. Claude Code asks clarifying questions, executes, commits, pushes, reports back
5. Bruce returns to Cowork with the result
6. We update CLAUDE.md and `docs/decisions.md` as needed
7. Move to next sub-phase

If a sub-phase reveals something unexpected (a Clerk API limitation, a Fireflies API quirk, a UX blocker), we pause and design before proceeding. No rushing.

End of plan.
