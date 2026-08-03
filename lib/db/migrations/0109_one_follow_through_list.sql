-- One follow-through list, and transcripts that can be released.
--
-- Two entities described the same moment after a session and neither
-- could see the other. An `action_item` was a commitment with an owner
-- and a date; a `deliverable` was one of the nine documents with its own
-- lifecycle, its own tracker, its own drafting button. There was no
-- foreign key between them in either direction and no query joined them,
-- so "what came out of Tuesday's session" had two answers in two places.
-- Bruce's call: one list, called action items, with the nine types
-- carried as a tag.
--
-- **`deliverable_type` NULL is the discriminator.** NULL means an
-- ordinary commitment ("call the broker by Friday"); set means this item
-- IS one of the nine documents. No second enum and no `kind` column,
-- because a boolean beside a nullable type is two things that can
-- disagree — an item flagged as a deliverable with no type, or typed but
-- flagged a task. One nullable column cannot contradict itself.
--
-- The status ladders differ and the merge is lossy in one direction:
-- `review` collapses into `in_progress` and `archived` into `done`.
-- Verified before writing this: the table holds exactly ONE row, an
-- in_progress Stages of Growth assessment, so neither lossy branch fires
-- against real data. `delivered_at`/`completed_by_user_profile_id` are
-- dropped in favour of status `done` + `updated_at` — that is the cost
-- Bruce accepted for one list.
--
-- `document_id` is carried across rather than dropped. A deliverable's
-- whole point is that it eventually becomes a file, and losing the link
-- from the commitment to the finished document would have made the
-- merged item strictly worse than what it replaced.
--
-- INSERT-then-DROP in one implicit transaction: if the copy fails for
-- any reason the DROP never runs and the table is still there. The row
-- cannot be lost in the gap between the two statements.
--
-- Transcripts: `engagement_meetings` stored a Fireflies URL and a
-- summary, never the words. Clients clicked out to a third-party site to
-- read their own session. `transcript_text` holds the flattened,
-- speaker-tagged body so the portal can render it directly.
--
-- **`transcript_shared_at` is the release gate, and it defaults to
-- NULL — nothing publishes retroactively.** All 235 already-synced
-- meetings across 16 clients stay internal until a Business Builder
-- releases each one. Bruce chose full transcripts visible to EVERY role
-- in the engagement, employees included, which is only safe because he
-- decides per meeting rather than the sync deciding for him. A column
-- that defaulted to now() would have published sixteen clients' back
-- catalogue on deploy.

-- ---------------------------------------------------------------------
-- 1. Action items absorb the deliverable shape.
-- ---------------------------------------------------------------------

-- The `deliverable_type` enum SURVIVES the table it was made for — it is
-- now the tag on action_items. Only `deliverable_status` dies with it.
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS deliverable_type deliverable_type;

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

-- The meeting this commitment came out of. `fireflies_transcript_id`
-- already carried the transcript id as loose text, but text is not a
-- join: it could not be indexed against the meeting row, and nothing
-- stopped it pointing at a transcript we never synced. The per-meeting
-- workspace is built on this FK.
--
-- SET NULL, not CASCADE, for the same reason `agenda_item_id` is SET
-- NULL: re-syncing or removing a meeting record must never destroy the
-- commitments that came out of it.
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS engagement_meeting_id uuid
    REFERENCES engagement_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS action_items_deliverable_type_idx
  ON action_items (deliverable_type);
CREATE INDEX IF NOT EXISTS action_items_engagement_meeting_idx
  ON action_items (engagement_meeting_id);

-- ---------------------------------------------------------------------
-- 2. Transcript body + the release gate.
-- ---------------------------------------------------------------------

ALTER TABLE engagement_meetings
  ADD COLUMN IF NOT EXISTS transcript_text text;

ALTER TABLE engagement_meetings
  ADD COLUMN IF NOT EXISTS transcript_shared_at timestamptz;

ALTER TABLE engagement_meetings
  ADD COLUMN IF NOT EXISTS transcript_shared_by_user_profile_id uuid
    REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Partial index: the portal only ever asks for released transcripts, and
-- on today's data that is a handful of rows out of 235.
CREATE INDEX IF NOT EXISTS engagement_meetings_transcript_shared_idx
  ON engagement_meetings (engagement_id, occurred_at DESC)
  WHERE transcript_shared_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Carry the deliverables across, then drop the table.
-- ---------------------------------------------------------------------

INSERT INTO action_items (
  org_id, engagement_id, title, description, status, deliverable_type,
  document_id, due_date, revenue_impact, margin_impact, created_by,
  created_at, updated_at
)
SELECT
  d.org_id,
  d.engagement_id,
  d.title,
  d.description,
  CASE d.status
    WHEN 'not_started' THEN 'open'
    WHEN 'in_progress' THEN 'in_progress'
    -- 'review' has no action-item equivalent. It means drafted and
    -- awaiting a Builder's read, which is what in_progress means here.
    WHEN 'review'      THEN 'in_progress'
    WHEN 'delivered'   THEN 'done'
    -- 'archived' means abandoned, not finished. Nothing in the ladder
    -- says that, and `done` is the closer of the two available lies:
    -- it keeps the row out of everyone's open work, which is the
    -- behaviour archiving was for. Zero rows today.
    WHEN 'archived'    THEN 'done'
  END::action_item_status,
  d.type,
  d.document_id,
  -- `target_date` was a planning marker with nothing enforcing it. As a
  -- due date it now feeds the overdue chase and the due-soon nudge.
  d.target_date,
  d.revenue_impact,
  d.margin_impact,
  -- Deliverables never recorded an author. 'coach' is the honest value:
  -- every one of them was created by a Business Builder, whether by hand
  -- or by pressing a Generate button. 'claude' would claim provenance we
  -- never stored.
  'coach'::action_item_created_by,
  d.created_at,
  d.updated_at
FROM deliverables d;

DROP TABLE IF EXISTS deliverables;

-- Only ever used by the table above.
DROP TYPE IF EXISTS deliverable_status;

-- ---------------------------------------------------------------------
-- 4. Backfill the meeting link for items already extracted.
-- ---------------------------------------------------------------------
--
-- Without this the workspace would open empty for every session already
-- held. The extractor has always stamped `fireflies_transcript_id` on
-- the items it wrote, and `engagement_meetings` carries the same id, so
-- the link can be recovered exactly rather than guessed at.
--
-- Scoped to the SAME engagement as well as the same transcript id.
-- Fireflies ids are globally unique so the engagement match is
-- redundant today, but a join that can only ever pair a client's item
-- with that client's meeting cannot become a cross-client leak if that
-- ever stops being true.
UPDATE action_items ai
SET engagement_meeting_id = em.id
FROM engagement_meetings em
WHERE ai.engagement_meeting_id IS NULL
  AND ai.fireflies_transcript_id IS NOT NULL
  AND em.fireflies_transcript_id = ai.fireflies_transcript_id
  AND em.engagement_id = ai.engagement_id;
