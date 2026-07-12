-- Booking follow-through — Phase 5.
--
-- One row per booked session, created when the "Booking → Builder Pipeline"
-- Make scenario POSTs a new calendar event to /api/leads/{token}. Drives the
-- three-email NDA/paperwork sequence (sent via the Make "Booking
-- Follow-Through - Send" webhook, not Gmail).
--
-- `calendar_event_id` UNIQUE is the entire idempotency mechanism: if the
-- 15-minute poller re-sees the same event, the insert conflicts and nothing
-- is created — so no email ever sends twice.
--
-- Per-email `*_sent_at` are stamped ONLY on a 2xx from the Make webhook, in
-- the same transaction, so a failed POST simply retries next tick. Attempt
-- counters cap retries at 3, after which a next-action is raised for Bruce.

CREATE TABLE IF NOT EXISTS "booking_follow_through" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "prospect_id" uuid NOT NULL,
  -- Idempotency key: the Google Calendar event id. UNIQUE → re-seen events
  -- never double-create, so email 1 never fires twice.
  "calendar_event_id" text NOT NULL,
  "session_at" timestamp with time zone NOT NULL,
  "email1_sent_at" timestamp with time zone,
  "email2_sent_at" timestamp with time zone,
  "email3_sent_at" timestamp with time zone,
  -- Set by hand in the UI (the one toggle Bruce touches). Suppresses
  -- emails 2 and 3.
  "documents_received_at" timestamp with time zone,
  "rescheduled_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  -- Retry accounting per email; capped at 3 before a next-action is raised.
  "email1_attempts" integer NOT NULL DEFAULT 0,
  "email2_attempts" integer NOT NULL DEFAULT 0,
  "email3_attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  -- Set once a give-up next-action has been raised, so we raise it only once.
  "failure_flagged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_follow_through" ADD CONSTRAINT "booking_follow_through_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_follow_through" ADD CONSTRAINT "booking_follow_through_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_follow_through_calendar_event_uniq" ON "booking_follow_through" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_follow_through_prospect_idx" ON "booking_follow_through" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_follow_through_session_idx" ON "booking_follow_through" USING btree ("session_at");--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_follow_through_set_updated_at ON "booking_follow_through";--> statement-breakpoint
CREATE TRIGGER booking_follow_through_set_updated_at BEFORE UPDATE ON "booking_follow_through" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "booking_follow_through" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_follow_through" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "booking_follow_through_tenant_isolation" ON "booking_follow_through";--> statement-breakpoint
CREATE POLICY "booking_follow_through_tenant_isolation" ON "booking_follow_through"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- Stable lookup key for email templates the automation reads (vs the
-- human-facing name, which Bruce is free to rename). Nullable — only the
-- automation-driven templates carry one.
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "template_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_org_key_uniq" ON "email_templates" USING btree ("org_id", "template_key") WHERE "template_key" IS NOT NULL;--> statement-breakpoint

-- Seed the three booking follow-through emails on the master org. Bruce
-- edits subject/body in Settings → Templates without a deploy; the cron
-- looks them up by template_key so a rename never breaks the automation.
-- Placeholder copy — replace with the marketing-approved bodies. Merge
-- fields: {{first_name}} {{session_day}} {{session_date}} {{session_time}}.
INSERT INTO "email_templates" ("org_id", "template_key", "name", "category", "subject", "body")
SELECT o.id, v.template_key, v.name, 'booking_follow_through', v.subject, v.body
FROM "orgs" o
CROSS JOIN (VALUES
  (
    'booking_follow_through_1',
    'Booking Follow-Through 1, paperwork first',
    'Your ninety minutes, and the paperwork first',
    $bft1$Hello {{first_name}},

Thanks for booking. You're set for {{session_day}}, {{session_date}} at {{session_time}}.

I've attached a mutual NDA, already signed on my end, so you can speak freely about your business when we meet. There's nothing for you to do with it right now.

Looking forward to it.

Bruce$bft1$
  ),
  (
    'booking_follow_through_2',
    'Booking Follow-Through 2, gentle nudge',
    'Before we meet, the quick paperwork',
    $bft2$Hello {{first_name}},

We're on for {{session_day}}, {{session_date}} at {{session_time}}. I'm looking forward to it.

If it's helpful to have the NDA countersigned before we talk, send it back whenever you get a minute. No rush, and no problem if you'd rather sort it on the call.

Bruce$bft2$
  ),
  (
    'booking_follow_through_3',
    'Booking Follow-Through 3, morning of',
    'Today is the day, one last thing',
    $bft3$Hello {{first_name}},

Today's the day. I'll see you at {{session_time}}. If you'd like the NDA squared away, we can do it at the start of the call. Either way, come ready to talk about what's really going on in the business.

Bruce$bft3$
  )
) AS v(template_key, name, subject, body)
WHERE o.type = 'master'
ON CONFLICT ("org_id", "template_key") WHERE "template_key" IS NOT NULL DO NOTHING;
