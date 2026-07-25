-- Executive Assistant, per Business Builder.
--
-- Two changes, both in service of the EA working for everyone in the
-- practice rather than only for the master admin.
--
--  1. `user_profiles.ea_notify_email` — where THIS Builder's assistant
--     mail goes (the morning briefing, recap approvals, the Friday
--     rollup). The account email is whatever the sign-in provider holds,
--     which is not always the inbox the person actually watches, and a
--     daily briefing delivered to an unwatched address reports success
--     while reaching nobody.
--
--     This replaces the EA_DIGEST_TO_EMAIL environment variable that the
--     first cut used. That variable applied to every Builder at once,
--     which was correct for a one-Builder practice and actively wrong
--     the moment a second one joined: they would have received each
--     other's briefings. A per-row column is the version that scales.
--     NULL means "use the account email", so nobody has to set anything.
--
--  2. `session_recaps.body_markdown` — the recap rendered as Markdown,
--     for the copy filed on the client's portal thread.
--
--     The portal renders message bodies through react-markdown with raw
--     HTML stripped (multi-tenant user content — see
--     components/markdown/MarkdownBody.tsx). Storing the HTML body there
--     would have shown the client escaped tags; storing the plain-text
--     body showed them an unformatted wall. Markdown is the format that
--     surface already speaks, so the portal copy gets real headings,
--     owners in bold, and proper lists.
--
--     Nullable: pre-existing recaps fall back to `body_text`, so no
--     backfill is needed.

ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "ea_notify_email" text;--> statement-breakpoint

ALTER TABLE "session_recaps" ADD COLUMN IF NOT EXISTS "body_markdown" text;
