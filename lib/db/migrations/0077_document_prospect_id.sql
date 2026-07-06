-- Documents can now be attached to a PROSPECT (a lead), not just an
-- engagement. This lets us keep a record of anything generated for a lead
-- (e.g. the PDF The Climb produces) on their file regardless of whether
-- they ever convert. Nullable — an engagement document leaves it null.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "prospect_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_prospect_idx" ON "documents" USING btree ("prospect_id");
