# The Builder — Triggers & Automations

Plain-English map of every "when X happens, the app does Y" running today. One row per automation. If a row says **Automatic**, it fires without you clicking a button. If it says **Manual**, you press something to start it. Everything in this file is wired up and live.

Last reviewed: 2026-05-16.

---

## 1. Prospect intake → CRM

| Trigger | Action | Type |
| --- | --- | --- |
| Anyone fills out the public diagnostic at `/diagnostic` | A new prospect lands on `/coach/pipeline` with status **Diagnostic complete**. Their answers are stored as Markdown notes on the prospect record. | Automatic |
| You click **Send Diagnostic** on a prospect that doesn't have one yet | Email goes to the prospect with a personal diagnostic link. When they submit, it updates the SAME prospect (no duplicates). | Manual → Automatic |
| You change a prospect's stage to **Contract signed** | Full-screen confetti burst + "You closed it" moment. (Just for you. Doesn't notify the prospect.) | Automatic |

## 2. Engagement creation → onboarding

| Trigger | Action | Type |
| --- | --- | --- |
| You submit **New engagement** | Creates a Clerk Org for the client, an `orgs` row, the `engagement`, sends the Clerk invitation to the client lead's email. | Manual → Automatic chain |
| Same submission, if you picked an "Auto-send onboarding email" template | Sends your onboarding template through your Gmail (so it lands in your Sent folder), with variables replaced ({{client_name}}, etc.) and your signature appended. Falls back to Resend if Gmail isn't connected. | Automatic |
| Client lead accepts the Clerk invite and signs in | Their `user_profiles` row is auto-provisioned with role = `client_lead`, role pulled from the invitation's metadata. They land on /portal. | Automatic |

## 3. Calendar + meetings

| Trigger | Action | Type |
| --- | --- | --- |
| You click **Schedule Meeting** on a prospect | Title defaults to "Business Building Session". If "Add Google Meet link" is checked, the event is created on your Google Calendar with a real Meet link in `conferenceData` and as the event location. Recurrence (weekly / biweekly / monthly) is supported via RRULE. Real Google Calendar invitation goes to the prospect's email. | Manual → Automatic |
| You schedule a BBS session in-app at `/coach/sessions/[engagementId]` | The BBS session row is saved. Time stored UTC, rendered Mountain Time. If you paste a Fireflies recording id later, the transcript is pulled and Claude drafts action items from it. | Manual |
| You edit / cancel a meeting in-app | The corresponding Google Calendar event is updated / deleted via two-way sync. | Automatic |

## 4. Email (Gmail)

| Trigger | Action | Type |
| --- | --- | --- |
| You send an email from inside a prospect or engagement | Goes out through your connected Gmail. Multipart/alternative — plain text + rendered HTML — so bold, lists, links, emojis show correctly in Gmail/Outlook/Apple Mail. Your signature is auto-appended (from `/coach/templates`). Attachments allowed via the paperclip (up to ~24MB total). | Manual → Automatic |
| Every 10 minutes (Gmail sync watermark) | Pull new Gmail messages. Save ONLY the ones where at least one participant (To/From/Cc/Bcc) is a prospect or engagement member in the CRM. Personal email is ignored. Threaded into the client's timeline. | Automatic (background) |
| You click **Use template** in the composer | Body is populated with the template, variables replaced (`{{contact_first_name}}` etc.), subject filled in. | Manual |

## 5. Drive (per-engagement folder mirror)

| Trigger | Action | Type |
| --- | --- | --- |
| You paste a Drive folder share URL on the engagement's Documents page | App validates the URL, pulls the folder name, saves the folder id on the engagement. Files inside the folder appear on the Documents page (read-only, click-through to Drive). | Manual → Automatic |
| You unlink the folder | Files stop showing in The Builder. Drive itself is untouched. | Manual |

## 6. Document signing (native, no Adobe Sign)

| Trigger | Action | Type |
| --- | --- | --- |
| You click **Send for signature** on a prospect or document | A signature envelope is created. Each signer gets an email with their unique `/sign/[token]` link (working-hours guarded — won't fire before 8:30 AM or after 6:00 PM MT). | Manual → Automatic |
| A signer signs at `/sign/[token]` | If more signers remain, the next one is emailed. If all done, a Certificate-of-Completion PDF is appended and the signed PDF is stored as a `documents` row, linked to the envelope. Sender + all signers get a completion email with the signed PDF attached. | Automatic |
| You click **Auto-sign as me** when sending | If your stored signature image is uploaded (`/coach/profile/signature`), you're added as the order-0 signer with status=signed. | Manual |

## 7. BBS sessions → action items (Fireflies)

| Trigger | Action | Type |
| --- | --- | --- |
| You paste a Fireflies recording id on a BBS session record | Background job (Inngest) pulls the transcript, sends to Claude, drafts action items as `status=draft, created_by=claude` with confidence flags. They appear in your Coach Console marked "draft." | Automatic |
| You publish a draft action item | Status → published, item appears in the assignee's portal, the assignee gets an email + in-app notification. | Manual |

## 8. Action items → reminders

| Trigger | Action | Type |
| --- | --- | --- |
| You assign / re-assign an action item | Assignee gets an email + in-app notification. (Working-hours guarded.) | Automatic |
| Every weekday at 09:00 MT (Mon–Fri) | Netlify Scheduled Function calls the due-soon cron. Anyone with an item due in the next 30 hours gets one nudge email. Idempotent — no duplicate nudges. | Automatic |

## 9. Soul File → AI Insights

| Trigger | Action | Type |
| --- | --- | --- |
| You click **Extract from latest session** on a Soul File | Claude reads the transcript and proposes 3–6 Soul File–shaped insights. Each lands as a pending insight card you can Accept (appends to the Soul File body) or Dismiss. | Manual → Automatic |
| You save the Soul File body | The body is chunked + embedded (OpenAI). Across all engagements, the Soul Search at `/coach/soul-search` can answer cross-client questions. | Automatic |

## 10. Subscriptions → billing

| Trigger | Action | Type |
| --- | --- | --- |
| You add a subscription to an engagement | Default is "not billed." You can link it to a QuickBooks recurring invoice (paste invoice id + customer id) OR a Stripe subscription (paste subscription id + price id), plus a direct URL to the source record. A "Billed · QuickBooks" / "Billed · Stripe" pill appears with a click-through. | Manual |
| Stripe webhook fires `customer.subscription.{created,updated,deleted}` | If we recognize the customer / engagement, the linked `subscription_assets` row is updated. | Automatic |

## 11. Builder Buddy (in-app AI assistant)

| Trigger | Action | Type |
| --- | --- | --- |
| You click the orange beacon (bottom-right) | Buddy chat opens. Knows the app structure, the methodology, and what page you're on. | Manual |
| You send a message in Buddy | Claude answers using a cached system prompt (cheap follow-ups). Multi-turn history is sent each call. | Automatic |

## 12. Hooks not yet built (so you don't expect them)

- **No automatic invoice creation** when a contract is signed. You make the QBO invoice yourself today. (On the list.)
- **No SMS reminders.** Twilio is wired but not turned on; needs your account.
- **No client-side notifications digest** — clients get a real-time email per action item assigned, not a daily roll-up.
- **No automatic Soul File embedding refresh** on every edit — runs nightly. So semantic search lags a day on brand-new content.
- **No auto-create of a BBS session series** when an engagement starts. You still schedule the first one manually.

---

## How to read a row

- **Manual** = you initiated it. Press a button, fill a form.
- **Automatic** = the system does it without you. Often on a schedule, sometimes in response to something else.
- **Manual → Automatic** = you start it, then a chain reaction runs.

## How to verify any row is working

Each row maps to a file you can spot-check. If something feels broken:

1. Go to the page where the trigger lives.
2. Do the trigger.
3. Look at the action it claims to do.
4. If it doesn't happen, screenshot the page and the URL, then tell me. The fix is usually in the matching server action under `lib/actions/`.

---

## If you want a new automation

Tell me the trigger, the action, and whether it should be automatic or manual. I'll either add it or tell you what's in the way.
