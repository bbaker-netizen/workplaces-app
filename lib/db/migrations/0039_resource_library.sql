-- Phase 5.7 — Resource library (tools + videos + documents).
--
-- Bruce + Jen build a growing collection of apps, video tutorials,
-- and written guides that they deploy to clients as needed. This
-- table is the master catalogue. A separate junction table tracks
-- which engagements each resource has been "deployed" to (Phase
-- 5.7b — for now resources are coach-only).
--
-- Resource types:
--   - tool: an app Bruce/Jen built (URL points at the deployed app)
--   - video: a tutorial video (YouTube / Loom / Vimeo URL)
--   - document: an article / PDF / written guide (URL or markdown)
--   - link: any other reference (article, external site)
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
    CREATE TABLE resources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      type text NOT NULL DEFAULT 'document', -- tool | video | document | link
      url text,
      thumbnail_url text,
      tags text[] NOT NULL DEFAULT '{}',
      audience text NOT NULL DEFAULT 'coach_only', -- coach_only | client | public
      is_published boolean NOT NULL DEFAULT true,
      created_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX resources_org_idx ON resources(org_id, type);
    CREATE INDEX resources_audience_idx ON resources(org_id, audience);

    CREATE TRIGGER set_updated_at_resources
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

    CREATE POLICY resources_org_isolation ON resources
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
  END IF;

  -- Junction table: which engagements have which resource deployed.
  -- Empty deploys = resource is in the library but not assigned to
  -- any client. Phase 5.7b will surface these on the client portal.
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resource_engagements') THEN
    CREATE TABLE resource_engagements (
      resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      deployed_at timestamptz NOT NULL DEFAULT now(),
      deployed_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
      PRIMARY KEY (resource_id, engagement_id)
    );

    CREATE INDEX resource_engagements_engagement_idx ON resource_engagements(engagement_id);

    ALTER TABLE resource_engagements ENABLE ROW LEVEL SECURITY;

    CREATE POLICY resource_engagements_org_isolation ON resource_engagements
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
  END IF;
END $$;
