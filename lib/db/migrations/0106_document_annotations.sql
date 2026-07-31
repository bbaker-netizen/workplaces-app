-- PDF markup, stored as data rather than baked into the file.
--
-- Bruce's ask: mark a PDF up, and edit it when needed, without Acrobat.
-- Marking up is an overlay — it never touches the text underneath — which
-- is why it is buildable where true content editing is not.
--
-- ONE row per markup. The alternative was writing annotations into the PDF
-- itself (pdf.js can do this natively). Rejected: a markup inside the file
-- is no longer queryable, cannot be re-opened for editing without
-- round-tripping the whole document, and cannot later be resolved, assigned,
-- or shown in the portal. As rows they are ordinary application data, and
-- burning them into a PDF becomes an export step rather than the storage
-- format.
--
-- COORDINATES ARE NORMALIZED PDF USER SPACE, not screen pixels.
-- x/y/w/h are fractions of the page's unrotated width/height, with the
-- origin at the BOTTOM-LEFT, matching PDF user space. Two reasons:
--   1. Zoom independence. A markup captured at 150% must land in the same
--      place when the page is later rendered at 75% for export.
--   2. Rotation is resolved at capture time. pdf.js's viewport exposes
--      convertToPdfPoint(), which already accounts for a page's /Rotate,
--      so the stored numbers are rotation-free and the burn step needs no
--      rotation maths for geometry.
-- Anything storing raw canvas pixels would break on both counts.
--
-- `points` carries freehand ink as [{x,y},…] in the same normalized space.
-- Not a column per point, obviously; and not a flattened array, because a
-- stroke is read and written whole and never queried by individual point.
--
-- `image_data` is a data URL, used for stamping a stored signature onto a
-- page. Kept nullable and only populated for kind='image' so the common
-- markup row stays small.
--
-- Annotations belong to a SPECIFIC documents row, which in this schema means
-- a specific version. That is deliberate: page operations (delete, reorder,
-- rotate) produce a new version, and page numbers on the old version would
-- silently point at the wrong pages afterwards. The export path burns the
-- markup into the new version instead of migrating coordinates that can no
-- longer be trusted.
CREATE TABLE IF NOT EXISTS document_annotations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  document_id       uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  -- 1-based, matching how every PDF tool and every human counts pages.
  page_number       integer NOT NULL,
  -- text | highlight | ink | whiteout | box | strikeout | image
  kind              text NOT NULL,
  x                 double precision NOT NULL DEFAULT 0,
  y                 double precision NOT NULL DEFAULT 0,
  w                 double precision NOT NULL DEFAULT 0,
  h                 double precision NOT NULL DEFAULT 0,
  points            jsonb,
  body              text,
  color             text NOT NULL DEFAULT '#1A1A1A',
  font_size         double precision,
  stroke_width      double precision,
  opacity           double precision,
  image_data        text,
  author_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- org_id first, per the multi-tenancy convention: every read is already
-- bound to one org by RLS, so the org column leads the index.
CREATE INDEX IF NOT EXISTS document_annotations_org_doc_page_idx
  ON document_annotations (org_id, document_id, page_number);
CREATE INDEX IF NOT EXISTS document_annotations_document_idx
  ON document_annotations (document_id);

DROP TRIGGER IF EXISTS set_updated_at_document_annotations ON document_annotations;
CREATE TRIGGER set_updated_at_document_annotations
  BEFORE UPDATE ON document_annotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Same RLS shape as every other tenant-scoped table.
ALTER TABLE document_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_annotations_tenant ON document_annotations;
CREATE POLICY document_annotations_tenant ON document_annotations
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
