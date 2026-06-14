-- Wave B — collapse the pipeline to 6 working stages.
--
-- New lead → First contact → Proposal sent → Contract sent →
-- Contract signed → Active engagement (+ Lost).
--
-- Remap existing prospects off the retired stages. The enum values are
-- kept in place (no destructive enum surgery); they simply stop being
-- offered in the UI via STAGE_ORDER. Any row still carrying a retired
-- value is moved to its collapsed home:
--   meeting_scheduled / diagnostic_pending / diagnostic_complete → first_contact
--   negotiation → proposal_sent
UPDATE prospects
   SET status = 'first_contact'
 WHERE status IN ('meeting_scheduled', 'diagnostic_pending', 'diagnostic_complete');

UPDATE prospects
   SET status = 'proposal_sent'
 WHERE status = 'negotiation';
