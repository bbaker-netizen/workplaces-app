-- Phase 5.2 — Background-job table for the Import-doc flow.
--
-- The synchronous server action was hitting Netlify's 26-second
-- timeout on Pro for documents Claude takes >20s to convert. This
-- table holds one row per conversion request — the API route updates
-- it asynchronously (up to 5 minutes via `export const maxDuration =
-- 300`), and the browser polls a status server action every few
-- seconds.
--
-- Lifecycle:
--   1. Server action `startTemplateConversion` inserts row with
--      status='pending' and the already-extracted source text.
--   2. Client fires fetch to /api/templates/convert/[id], which does
--      the Claude call and updates status='done' or 'error'.
--   3. Client polls /api/templates/convert/[id]/status until status
--      is no longer 'pending'.
--
-- We don't persist the source file itself — the extracted text is
-- enough for the conversion, and dropping the file as soon as we've
-- extracted the text keeps DB size small.
--
-- Idempotent: re-runnable against partial state.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'template_conversions') THEN
    CREATE TABLE template_conversions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
      filename text,
      source_text text NOT NULL,
      status text NOT NULL DEFAULT 'pending', -- pending | running | done | error
      result_json jsonb,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );

    CREATE INDEX template_conversions_user_idx
      ON template_conversions(user_profile_id, created_at DESC);
    CREATE INDEX template_conversions_status_idx
      ON template_conversions(status, created_at DESC);

    CREATE TRIGGER set_updated_at_template_conversions
    BEFORE UPDATE ON template_conversions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE template_conversions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY template_conversions_org_isolation ON template_conversions
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
  END IF;
END $$;
