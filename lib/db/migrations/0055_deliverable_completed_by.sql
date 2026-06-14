-- Track who marked a deliverable delivered (coach or client), shown to
-- both sides next to the delivered date.
ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS completed_by_user_profile_id uuid;
ALTER TABLE deliverables
  ADD CONSTRAINT deliverables_completed_by_user_profile_id_fk
  FOREIGN KEY (completed_by_user_profile_id)
  REFERENCES user_profiles(id) ON DELETE set null;
