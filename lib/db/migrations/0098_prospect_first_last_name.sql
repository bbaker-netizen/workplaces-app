-- First and last name on a lead, so contracts address people correctly.
--
-- `contact_name` was a single free-text field, and the contract variables
-- guessed at a first name by taking everything before the first space. That
-- is wrong for anyone with a compound given name, wrong for "Dr Jane Smith",
-- and silently wrong — the agreement just goes out addressed oddly.
--
-- `contact_name` STAYS and remains the display field everywhere. It is now
-- derived from the two parts on write rather than typed directly, so nothing
-- that reads it has to change: every screen, webhook, email template and
-- report that uses contact_name keeps working untouched. Splitting the data
-- without splitting the codebase.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS contact_first_name text,
  ADD COLUMN IF NOT EXISTS contact_last_name  text;

-- Backfill by splitting on the FIRST space: everything before it is the given
-- name, the remainder is the surname. That keeps "van der Berg" and
-- "Smith-Jones" intact as one surname, which the old first-space-only guess
-- got right too — the gain here is that it is now stored and correctable by
-- hand rather than re-guessed on every render.
--
-- Rows with a single word get it as the first name and no surname, rather
-- than inventing one.
UPDATE prospects
   SET contact_first_name =
         NULLIF(split_part(btrim(contact_name), ' ', 1), ''),
       contact_last_name =
         NULLIF(
           btrim(
             substr(
               btrim(contact_name),
               length(split_part(btrim(contact_name), ' ', 1)) + 1
             )
           ),
           ''
         )
 WHERE contact_name IS NOT NULL
   AND btrim(contact_name) <> ''
   AND contact_first_name IS NULL
   AND contact_last_name IS NULL;
