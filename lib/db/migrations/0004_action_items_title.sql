ALTER TABLE "action_items" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_items" ADD COLUMN "title" text NOT NULL;