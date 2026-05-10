-- Phase 4 — Infrastructure completion.

-- 1. Quality gate flags on deliverables (parity with action_items / goals / projects).
ALTER TABLE "deliverables" ADD COLUMN "revenue_impact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "margin_impact" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 1b. Documents.uploader_user_profile_id is now nullable so system flows
-- (Adobe Sign signed-PDF auto-attach, future inbound email) can write
-- documents without a user attribution.
ALTER TABLE "documents" ALTER COLUMN "uploader_user_profile_id" DROP NOT NULL;--> statement-breakpoint

-- 2. Engagement slugs for portal routing. Nullable until backfilled, then UNIQUE.
ALTER TABLE "engagements" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill: lower-case, hyphenated name, fallback to id fragment if name is null.
UPDATE "engagements"
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(COALESCE("name", LEFT(id::text, 8)), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  )
);--> statement-breakpoint
-- De-duplicate by appending the id fragment when a collision exists.
UPDATE "engagements" e
SET "slug" = e."slug" || '-' || LEFT(e.id::text, 6)
WHERE EXISTS (
  SELECT 1 FROM "engagements" o
  WHERE o."slug" = e."slug" AND o.id <> e.id
);--> statement-breakpoint
CREATE UNIQUE INDEX "engagements_slug_idx" ON "engagements" ("slug");--> statement-breakpoint

-- 3. Lesson completions — per-user lesson progress for the LMS.
CREATE TABLE "lesson_completions" (
  "lesson_id" uuid NOT NULL,
  "user_profile_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_completions_pk" PRIMARY KEY ("lesson_id", "user_profile_id")
);--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_completions_org_idx" ON "lesson_completions" ("org_id");--> statement-breakpoint
CREATE INDEX "lesson_completions_user_idx" ON "lesson_completions" ("user_profile_id");--> statement-breakpoint
CREATE TRIGGER lesson_completions_set_updated_at BEFORE UPDATE ON "lesson_completions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "lesson_completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_completions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "lesson_completions_tenant_isolation" ON "lesson_completions" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

-- 3b. Soul File chunks — chunked embeddings for finer-grained RAG.
-- Phase 2 embedded the whole body as one vector; Phase 4 splits into
-- ~1500-char chunks so the search can return the most relevant
-- paragraph rather than the most relevant document.
CREATE TABLE "soul_file_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "soul_file_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "chunk_index" bigint NOT NULL,
  "body" text NOT NULL,
  "embedding" vector(1536),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "soul_file_chunks" ADD CONSTRAINT "soul_file_chunks_soul_file_id_soul_files_id_fk" FOREIGN KEY ("soul_file_id") REFERENCES "public"."soul_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soul_file_chunks" ADD CONSTRAINT "soul_file_chunks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soul_file_chunks" ADD CONSTRAINT "soul_file_chunks_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "soul_file_chunks_org_idx" ON "soul_file_chunks" ("org_id");--> statement-breakpoint
CREATE INDEX "soul_file_chunks_soul_file_idx" ON "soul_file_chunks" ("soul_file_id", "chunk_index");--> statement-breakpoint
CREATE INDEX "soul_file_chunks_embedding_idx" ON "soul_file_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);--> statement-breakpoint
CREATE TRIGGER soul_file_chunks_set_updated_at BEFORE UPDATE ON "soul_file_chunks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "soul_file_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "soul_file_chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "soul_file_chunks_tenant_isolation" ON "soul_file_chunks" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

-- 4. Adobe Sign envelopes — track sent agreements so the webhook can find them.
-- engagement_id and prospect_id are both nullable: contracts are typically
-- sent at the prospect stage, then linked to an engagement after signing.
CREATE TABLE "adobe_sign_envelopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "prospect_id" uuid,
  "engagement_id" uuid,
  "agreement_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OUT_FOR_SIGNATURE',
  "signer_email" text NOT NULL,
  "signer_name" text,
  "subject" text,
  "signed_document_id" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "adobe_sign_envelopes_agreement_id_unique" UNIQUE ("agreement_id")
);--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" ADD CONSTRAINT "adobe_sign_envelopes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" ADD CONSTRAINT "adobe_sign_envelopes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" ADD CONSTRAINT "adobe_sign_envelopes_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" ADD CONSTRAINT "adobe_sign_envelopes_signed_document_id_documents_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adobe_sign_envelopes_org_idx" ON "adobe_sign_envelopes" ("org_id");--> statement-breakpoint
CREATE INDEX "adobe_sign_envelopes_engagement_idx" ON "adobe_sign_envelopes" ("engagement_id");--> statement-breakpoint
CREATE INDEX "adobe_sign_envelopes_prospect_idx" ON "adobe_sign_envelopes" ("prospect_id");--> statement-breakpoint
CREATE TRIGGER adobe_sign_envelopes_set_updated_at BEFORE UPDATE ON "adobe_sign_envelopes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adobe_sign_envelopes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Envelopes can sit before engagement exists; bind to org only.
CREATE POLICY "adobe_sign_envelopes_tenant_isolation" ON "adobe_sign_envelopes" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
