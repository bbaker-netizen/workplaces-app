-- Phase 5 — Document templates for the native signing flow.
-- Bruce composes the actual document body (contract, proposal, NDA,
-- renewal) inside The Builder rather than attaching a PDF made
-- elsewhere. Templates carry markdown bodies with {{variable}}
-- placeholders that resolve from prospect / engagement / sender
-- context at compose time.
--
-- Idempotent: every table + index gated on existence so re-running
-- the migration against a partially-applied DB is safe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'document_templates') THEN
    CREATE TABLE document_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name text NOT NULL,
      category text NOT NULL DEFAULT 'other',
      body_markdown text NOT NULL DEFAULT '',
      default_subject text,
      created_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX document_templates_org_idx ON document_templates(org_id);
    CREATE INDEX document_templates_category_idx ON document_templates(org_id, category);

    CREATE TRIGGER set_updated_at_document_templates
    BEFORE UPDATE ON document_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

    CREATE POLICY document_templates_org_isolation ON document_templates
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
  END IF;
END $$;
