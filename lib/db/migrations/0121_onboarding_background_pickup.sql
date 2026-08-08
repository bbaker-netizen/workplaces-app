-- Did the background runner ever pick this run up?
--
-- The failure this catches: a Netlify Background Function answers **202
-- the instant the request is accepted, before the handler runs**.
-- `startOnboarding` treated that 202 as proof the sequence had started,
-- so every failure inside the handler — a rejected bearer token, an
-- unparseable body, a module that throws on import — was invisible. The
-- run row stayed pristine, and the panel, which reads "a row with no
-- completed_at" as "in flight", spun for ever with nothing to say.
--
-- Measured on 7 Aug: a real client's onboarding claimed at 14:29:41Z with
-- every step column NULL and `updated_at` never moving off `started_at` —
-- no send, no error, no trace. Proven by POSTing the live function URL
-- with a deliberately wrong secret and an empty body: still 202.
--
-- `background_started_at` is stamped by the handler itself as its first
-- act, so "queued and never picked up" stops being indistinguishable
-- from "running". `background_error` carries a refusal the handler CAN
-- name (bad secret, missing id). `last_queued_at` is when we last handed
-- off, so the panel can say how long it has been waiting.
--
-- Same doctrine as `ea_job_runs` (0088), `meeting_draft_runs` (0115) and
-- `booking_attempts` (0120): a job whose only symptom is an absence needs
-- somewhere to say it ran.

ALTER TABLE onboarding_runs
  ADD COLUMN IF NOT EXISTS background_started_at timestamptz;

ALTER TABLE onboarding_runs
  ADD COLUMN IF NOT EXISTS background_error text;

ALTER TABLE onboarding_runs
  ADD COLUMN IF NOT EXISTS last_queued_at timestamptz;
