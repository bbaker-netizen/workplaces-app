CREATE TYPE "public"."coach_status" AS ENUM('active', 'deferred', 'archived');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('prospect', 'active', 'paused', 'completed', 'renewed');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('accelerator', 'implementer');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('master', 'client');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('coach', 'master_admin', 'client_lead', 'client_manager', 'client_employee', 'prospect');--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"status" "coach_status" DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_user_profile_id_unique" UNIQUE("user_profile_id")
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"type" "engagement_type" NOT NULL,
	"status" "engagement_status" DEFAULT 'active' NOT NULL,
	"name" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "org_type" DEFAULT 'client' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaches_org_idx" ON "coaches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "engagements_org_idx" ON "engagements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "engagements_coach_idx" ON "engagements" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "user_profiles_org_idx" ON "user_profiles" USING btree ("org_id");--> statement-breakpoint
-- Phase 0: shared updated_at trigger function + per-table triggers.
-- Decision: see docs/decisions.md "updated_at enforced via Postgres trigger".
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER orgs_set_updated_at BEFORE UPDATE ON "orgs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER user_profiles_set_updated_at BEFORE UPDATE ON "user_profiles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER coaches_set_updated_at BEFORE UPDATE ON "coaches" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER engagements_set_updated_at BEFORE UPDATE ON "engagements" FOR EACH ROW EXECUTE FUNCTION set_updated_at();