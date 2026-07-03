-- 0070: remap retired pipeline statuses onto the new ladder.
-- Runs after 0069 committed, so the new values are usable here.
--   negotiation          -> proposal_sent
--   diagnostic_pending    -> contact_attempted
--   diagnostic_complete   -> first_contact
-- (new_lead, first_contact, meeting_scheduled [now "Appt booked"],
--  proposal_sent, contract_sent, contract_signed, onboarded [now "Won"],
--  and lost keep their values — only their labels change, in code.)

UPDATE "prospects" SET "status" = 'proposal_sent'     WHERE "status" = 'negotiation';
UPDATE "prospects" SET "status" = 'contact_attempted' WHERE "status" = 'diagnostic_pending';
UPDATE "prospects" SET "status" = 'first_contact'     WHERE "status" = 'diagnostic_complete';
