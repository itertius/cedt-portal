CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_activity" (
	"activity_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text,
	"participants" integer,
	"max_participants" integer,
	"poster_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "talent_activity_starts_idx" ON "talent_activity" USING btree ("starts_at");