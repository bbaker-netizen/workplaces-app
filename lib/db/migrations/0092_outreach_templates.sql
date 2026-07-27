-- Outreach templates — first attempt + second attempt.
--
-- Two hand-sent templates for the top of the pipeline, matching the two
-- stages a lead passes through before anyone has actually spoken:
--
--   new_lead          → nobody has reached out yet          → Outreach 1
--   contact_attempted → reached out, waiting to hear back   → Outreach 2
--
-- Sent by hand from the prospect's Communications panel, so they use the
-- variables `resolveTemplateForProspect` supplies and nothing else:
-- {{company_name}} {{contact_name}} {{contact_first_name}} {{contact_email}}
-- {{sender_name}} {{sender_first_name}} {{sender_email}}. An unknown
-- variable renders literally as {{name}} in the email, so no others.
--
-- Signed off with {{sender_first_name}} rather than a hardcoded name so
-- Jen's sends read as Jen's. The sender's stored email signature is
-- appended automatically by `send-client-message` — don't add one here.
--
-- `template_key` gives each row a stable lookup key and makes the seed
-- idempotent through the partial UNIQUE index added in 0080, so a
-- re-deploy never duplicates them and a rename in the Templates editor
-- never breaks anything.

INSERT INTO "email_templates" ("org_id", "template_key", "name", "category", "subject", "body")
SELECT o.id, v.template_key, v.name, v.category, v.subject, v.body
FROM "orgs" o
CROSS JOIN (VALUES
  (
    'outreach_attempt_1',
    'Outreach 1, first attempt',
    'intro',
    'Reaching out about {{company_name}}',
    $out1$Hi, {{contact_first_name}}.

You got in touch about your business, so I wanted to say hello properly.

I coach owners through the parts that get harder as the business grows. Pricing, process, hiring, cash. Before I say anything useful about {{company_name}} I'd rather hear what's actually going on over there.

Have you got fifteen minutes this week or next? Tell me a day that works and I'll send an invite.

{{sender_first_name}}$out1$
  ),
  (
    'outreach_attempt_2',
    'Outreach 2, second attempt',
    'follow_up',
    'Still worth a conversation?',
    $out2$Hi, {{contact_first_name}}.

I sent you a note a little while back and haven't heard anything. That usually means the timing is wrong, or it slipped down the pile. Both are fine.

If it's the timing, say so and I'll leave you to it until you're ready. If it slipped, here's the short version. A first conversation costs you nothing and commits you to nothing. Fifteen minutes, and you'll come away with at least one thing you can use whether we work together or not.

Just tell me a day.

{{sender_first_name}}$out2$
  )
) AS v(template_key, name, category, subject, body)
WHERE o.type = 'master'
ON CONFLICT ("org_id", "template_key") WHERE "template_key" IS NOT NULL DO NOTHING;
