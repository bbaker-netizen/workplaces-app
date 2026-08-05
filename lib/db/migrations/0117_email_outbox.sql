-- Mail held back by the working-hours window, so it sends later instead
-- of never.
--
-- `sendEmail` refuses anything outside Mon–Fri 08:30–18:00 Mountain and
-- returns `{delivered:false, reason:'outside_working_hours', nextSendAt}`.
-- Nothing ever consumed `nextSendAt`. The queue its own header describes
-- was never built, so the message was simply DROPPED — and
-- `sendEmailQuietly` only logs the `error` case, so a deferred send
-- returned quietly and looked like a success.
--
-- That is why roughly fourteen call sites pass `bypassWorkingHours:
-- true`: every one is a place where somebody noticed mail going missing
-- and opted out of the guard rather than fixing it. The remaining
-- client-facing sends are the ones still losing mail — publish an action
-- item at 6:30pm, or release a transcript at the weekend, and the client
-- is never told at all.
--
-- With this table the guard means what it says: hold it until the window
-- opens. The bypass stays meaningful and narrow — Builder-to-Builder
-- alerts that genuinely should not wait.

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Recipient and content, stored whole: the envelope is rendered at the
  -- moment the event happened, so what eventually lands says what was
  -- true then. Re-rendering at flush time would let a recap describe a
  -- record that has since moved on.
  to_email text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text NOT NULL,
  -- Resend attachments, verbatim. The session recap sends the signed PDF
  -- this way, so an outbox that dropped attachments would deliver a
  -- worse email than the one it replaced.
  attachments jsonb,
  reply_to text,
  -- When the working-hours window next opens, from nextValidWorkingMoment().
  send_after timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  -- Last failure, kept even after a later success so a flaky address is
  -- still visible.
  last_error text,
  -- What raised it, for diagnosis only ('action_item_assigned', …).
  purpose text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The flush query: unsent rows whose time has come, oldest first.
CREATE INDEX IF NOT EXISTS email_outbox_due_idx
  ON email_outbox (send_after)
  WHERE sent_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'email_outbox_set_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER email_outbox_set_updated_at
      BEFORE UPDATE ON email_outbox
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END
$$;

-- Deliberately NOT tenant-scoped, and RLS is enabled with NO policy at
-- all — so `workplaces_app` matches no rows for any command and the
-- table is reachable only through `withSystemContext`. Same reasoning as
-- `ea_job_runs` (0088): this is operational plumbing that holds the
-- rendered body of mail to several different orgs' people, and no
-- tenant-bound query should be able to read it even by accident.
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
