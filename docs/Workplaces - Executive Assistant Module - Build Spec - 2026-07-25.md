# Executive Assistant module — build spec

Addendum to `CLAUDE.md` for the workplaces-app repo (The Builder). Hand this to Claude Code.

## What this is

An EA layer inside The Builder, not a new application. Everything below rides on entities and jobs that already exist. The EA adds three things the app does not have today: a daily outbound briefing, a proposal-and-approval loop for calendar blocks, and an inbound email triage that turns meeting requests and finished sessions into drafts Bruce approves.

## Decisions locked (2026-07-25)

Gmail API OAuth, extending the existing Google connection. Every outbound email is a draft, nothing sends under Bruce's name without approval. Calendar blocks are proposed in the digest and placed on one click, never written silently. All EA email is HTML, built on the existing `EmailEnvelope` pattern.

## Done means

1. A digest lands in Bruce's inbox each weekday at 07:00 MT listing every deliverable by state, every action item due or overdue, and proposed time blocks with working approve links.
2. Approving a block creates one Google Calendar event. Completing the item stops it recurring. An incomplete item reappears with an explicit escalation notice, not a silent repeat.
3. An inbound "can we meet" email produces a Gmail draft in Bruce's own account within one hourly sweep, signed as his assistant, containing his booking link.
4. Within one hour of a BBS transcript landing, a recap draft exists containing the Fireflies link, decisions, published action items with owners and dates, and the next session's date with its carried-forward agenda.
5. Approving the recap sends it to the client and writes a message row in that engagement's portal thread, visible to the client.

Verification per phase: `tsc --noEmit` and `next lint` clean, plus the named live check.

## Reuse, do not rebuild

| Need | Already in the repo |
|---|---|
| Send mail | `lib/email/send.ts` (`sendEmail`, `isWithinWorkingHours`, `nextValidWorkingMoment`) |
| HTML templates | `lib/email/templates.ts`, thirteen existing envelopes to copy the shell from |
| Google auth and events | `lib/integrations/google-calendar.ts` (`getValidAccessToken`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`) |
| Transcripts | `lib/integrations/fireflies.ts` (`fetchMeetingDetail`, `listRecentTranscripts`, `transcriptToPlainText`) |
| Action item extraction | `lib/actions/fireflies-extract.ts` (`extractFromFirefliesAsSystem`) |
| Scheduled work | `lib/inngest/functions.ts`, existing crons at `0 16 * * 1-5`, `0 * * * *`, `*/30 * * * *`, `0 8 * * *` |
| Agenda carry-forward | `carryForwardAgenda`, `agenda_items`, migration 0084 |
| Portal record | `message` entity on the engagement thread |

## Schema — migration 0086

`ea_digests` — one row per send. `user_profile_id`, `sent_for_date`, `payload jsonb`, `sent_at`. The payload snapshot is what the approve links resolve against, so a stale link cannot place a block for an item that has since changed.

`ea_time_blocks` — `action_item_id`, `user_profile_id`, `proposed_start`, `proposed_end`, `status` (proposed / approved / declined / completed / rescheduled), `google_event_id`, `reschedule_count`, `digest_id`. UNIQUE on `(action_item_id, proposed_start)` for idempotency, same pattern as `session_series`.

`ea_email_threads` — `gmail_thread_id` UNIQUE, `classification` (meeting_request / other), `prospect_id` nullable, `draft_id`, `status`, `handled_at`. The UNIQUE key is what stops a re-sweep drafting twice on one thread.

`session_recaps` — `bbs_session_id` UNIQUE, `status` (draft / approved / sent), `body_html`, `fireflies_url`, `next_session_id`, `approved_by`, `sent_at`, `message_id`. One recap per session, enforced at the database.

`ea_approval_tokens` — `token` (32-byte random, hashed at rest), `subject_type`, `subject_id`, `expires_at`, `consumed_at`. Every approve link in every EA email resolves through this table. Single use, 72-hour expiry.

## Phase 1 — daily digest

Inngest function `eaDailyDigest`, cron `0 13 * * 1-5` (07:00 MT). Uses `withSystemContext`, never `withEngagementContext` (see traps). Pulls, per engagement Bruce owns: deliverables grouped by lifecycle status with days-in-state, action items assigned to him bucketed overdue / today / this week, client-owned action items that are overdue, sessions in the next seven days, and any deliverable past its promised date. Renders `dailyDigestEmail()` in `lib/email/templates.ts`. Writes `ea_digests` before sending so a send failure does not lose the snapshot.

Live check: one digest received, counts reconciled by hand against `/business-builder` for one engagement.

## Phase 2 — calendar blocks

The digest proposes blocks. Estimated duration comes from a new `action_items.estimated_minutes` column, defaulting to 60. The proposer finds free slots inside 08:30–18:00 MT weekdays via `listExternalEvents`, skips anything within thirty minutes of a BBS session, and never proposes more than four hours of blocks in one day. Approve link hits `/api/ea/approve/[token]`, which creates the Google event and flips `ea_time_blocks.status` to approved.

Completion behaviour, which is the part that has to be right. On item completion, `deleteCalendarEvent` removes any future block and the block is marked completed. If the block's end time passes with the item still open, the next digest re-proposes it with `reschedule_count` incremented and shows an escalation line: first miss is a note, second is a warning, third states plainly that the item has now slipped three times and asks whether it should be renegotiated or killed. That last behaviour is deliberate. A nag that never escalates gets ignored, which is how the item became overdue in the first place.

Live check: create a test item, approve its block, confirm the event in Google, complete the item, confirm the event disappears and it does not reappear in tomorrow's digest.

## Phase 3 — inbound triage and drafts

Extend the Google OAuth scope set in `lib/integrations/google-calendar.ts` to add `gmail.readonly` and `gmail.compose`. Both are restricted scopes, so Google verification is required before this works outside the test-user list. Start the verification early, it is the long pole in this build.

Inngest `eaInboxSweep`, cron `15 * * * 1-5`. Reads threads newer than the last sweep, excludes anything already in `ea_email_threads`, and classifies via the Claude API: is this person asking for time with Bruce. On a hit, create a Gmail draft in Bruce's account, in the thread, signed as his assistant, offering the booking link and two or three concrete open slots pulled from the calendar. Draft only, always. Log the thread either way so classification never repeats on the same thread.

The draft's voice matters. It introduces itself as Bruce's assistant, names the booking link as the way to lock a time, and never names price. That last rule is not stylistic, it is the sales protocol: price is never named before a face-to-face or video conversation.

Live check: send yourself a "any chance we could grab 30 minutes" email, confirm a draft appears in the correct thread within an hour.

## Phase 4 — post-session recaps

Hook the existing `firefliesSync` cron. When a transcript matches a `bbs_session` (Fireflies title convention `[Client Name] - Business Building Session` is the join key, so title discipline is a hard dependency), run `extractFromFirefliesAsSystem` for action items as it does today, then generate the recap: what was decided, published action items with owner and date, the Fireflies transcript link, the next session's date and time, and the carried-forward agenda for that next session from `carryForwardAgenda`.

Recap lands as `session_recaps.status = draft` and Bruce gets an approval email. On approval the recap sends to the engagement's client contacts and, in the same transaction, inserts a `message` row on that engagement's thread so it is a permanent portal record. Never send before approval, and never send action items still in draft status. A recap listing commitments the client never agreed to is worse than no recap.

Live check: next real BBS session end to end, draft to portal record.

## HTML email standard

One shared shell in `lib/email/templates.ts`, extending what is already there. Table-based layout, 600px, inline styles only, no external CSS or web fonts. Arial with a sans-serif fallback, since Outlook will not load anything else. Navy headings in sentence case, no em dashes, Canadian spelling. Every email carries a plain-text alternative. Approve buttons are bulletproof VML-fallback buttons, not styled anchors, or they will render as bare links in Outlook.

## Build order and traps

Phase 1, then 2, then 4, then 3. Gmail is last because the scope verification gates it and nothing else depends on it.

Two traps, both already paid for once in this repo. Any cron must use `withSystemContext`; `withEngagementContext` calls `ensureUserProfile()` and there is no signed-in user in a cron run, so the access check denies every engagement and the job silently does nothing. And every generated slot needs a real idempotency key at the database level, because a re-run or an overlapping job will otherwise duplicate.

## What is missing from the original ask

Six additions, in the order I would build them.

Pre-session prep, not just post-session recap. The morning digest should tell Bruce who he is seeing today, what was committed last session, and what is still open. Walking into a BBS with that is worth more than the recap that follows it.

No-ghost enforcement. Any prospect conversation that ends without a next step on the calendar should surface in the next digest by name. The stated close protocol depends on booking the next step before hanging up, and nothing in the system currently notices when that did not happen.

Client-side chasing. Overdue action items owned by the client should generate their own weekly nudge to the client, not a line in Bruce's digest. Being the chase mechanism is unpaid labour.

Engagement silence detection. Flag any engagement with no session held and no action item movement in fourteen days. That is the earliest signal of a renewal at risk.

Approval from a phone. Every approve link resolves without a login through `ea_approval_tokens`. Approvals that require sitting at a desk do not happen, and an unapproved recap ages badly.

Friday rollup. What shipped, what slipped, and both tagged by `revenue_impact` and `margin_impact`, which the schema already carries. This is the one report that answers the quality gate directly.

## Quality gate

Passes. The digest and the escalation loop protect delivery on committed work, which is margin. The triage and no-ghost items protect conversion on booked pipeline, which is top-line.
