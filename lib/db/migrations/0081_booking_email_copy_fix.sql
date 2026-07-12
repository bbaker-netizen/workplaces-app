-- Fix the seeded booking follow-through placeholder copy.
--
-- Email 1 previously asked the prospect to "read and sign" the NDA. That
-- inverts the offer: Bruce signs first, before anything is asked of them.
-- Rewritten so the NDA arrives already signed on Bruce's end with no ask.
-- Also strips em dashes from all three (Bruce doesn't use them).
--
-- Guarded on `updated_at = created_at` so a template Bruce has already
-- edited by hand is never clobbered — only untouched seed rows are fixed.

UPDATE "email_templates"
SET "body" = $b1$Hello {{first_name}},

Thanks for booking. You're set for {{session_day}}, {{session_date}} at {{session_time}}.

I've attached a mutual NDA, already signed on my end, so you can speak freely about your business when we meet. There's nothing for you to do with it right now.

Looking forward to it.

Bruce$b1$
WHERE "template_key" = 'booking_follow_through_1'
  AND "updated_at" = "created_at";--> statement-breakpoint

UPDATE "email_templates"
SET "body" = $b2$Hello {{first_name}},

We're on for {{session_day}}, {{session_date}} at {{session_time}}. I'm looking forward to it.

If it's helpful to have the NDA countersigned before we talk, send it back whenever you get a minute. No rush, and no problem if you'd rather sort it on the call.

Bruce$b2$
WHERE "template_key" = 'booking_follow_through_2'
  AND "updated_at" = "created_at";--> statement-breakpoint

UPDATE "email_templates"
SET "body" = $b3$Hello {{first_name}},

Today's the day. I'll see you at {{session_time}}.

If you'd like the NDA squared away, we can do it at the start of the call. Either way, come ready to talk about what's really going on in the business.

Bruce$b3$
WHERE "template_key" = 'booking_follow_through_3'
  AND "updated_at" = "created_at";
