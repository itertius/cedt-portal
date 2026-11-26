CREATE TYPE "public"."source" AS ENUM('mcv', 'grader', 'talent', 'intern', 'nisitez', 'ices', 'gcal');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'error');--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"year" integer,
	"semester" integer,
	"role" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"user_id" text NOT NULL,
	"source" "source" NOT NULL,
	"status" "sync_status" DEFAULT 'idle' NOT NULL,
	"started_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"course_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"url" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_user_source_idx" ON "course" USING btree ("user_id","source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_user_source_idx" ON "task" USING btree ("user_id","source","source_id");--> statement-breakpoint
CREATE INDEX "task_user_due_idx" ON "task" USING btree ("user_id","due_at");