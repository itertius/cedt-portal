ALTER TABLE "event" ADD COLUMN "remote_id" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "remote_updated" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pushed_at" timestamp with time zone;