-- Seed the "Send the pre-meeting assessment" email template.
--
-- Why this exists: the pre-meeting assessment lives at
-- /before-we-meet/ and personalises itself from query-string parameters,
-- so a prospect who opens Bruce's link types nothing but their headcount.
-- Building that link by hand means editing three values and remembering to
-- escape spaces, which is exactly the sort of job that gets done wrong once
-- and then quietly abandoned. As a template it is two clicks from the
-- prospect's card: Communications, Email, pick this, add a line, send.
--
-- The `_url` suffix on the variables is deliberate. applyTemplate() encodes
-- those values, so a company called "Acme Roofing" produces Acme%20Roofing
-- instead of putting a raw space in the middle of a hyperlink.
--
-- `fname` NOT `name` in the query string: WordPress reserves `name` as a
-- query var and strips it before the page ever sees it.
--
-- template_key gives it a stable handle, so renaming it in the Templates
-- editor never breaks anything looking it up.
--
-- Seeded once per org, and only if it is not already there, so re-running
-- the migration cannot duplicate it or overwrite Bruce's edits.

INSERT INTO "email_templates" ("org_id", "name", "category", "subject", "body", "template_key")
SELECT
  o."id",
  'Send the pre-meeting assessment',
  'follow_up',
  $subj$Before we meet: a couple of minutes of prep$subj$,
  $body$Hi {{contact_first_name}},

Looking forward to sitting down together.

Before we do, would you fill this in? It takes about two minutes and there is nothing to prepare for.

https://4workplaces.com/before-we-meet/?fname={{contact_first_name_url}}&company={{company_name_url}}&email={{contact_email_url}}

It saves us spending the first half of our meeting on questions I could have asked in advance, so we get straight to your situation instead.

Bruce$body$,
  'pre_meeting_assessment'
FROM "orgs" o
WHERE NOT EXISTS (
  SELECT 1 FROM "email_templates" t
   WHERE t."org_id" = o."id"
     AND t."template_key" = 'pre_meeting_assessment'
);
