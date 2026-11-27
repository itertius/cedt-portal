CREATE TABLE "connector_credential" (
	"user_id" text NOT NULL,
	"source" "source" NOT NULL,
	"secret" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_credential_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
CREATE TABLE "grader_problem" (
	"user_id" text NOT NULL,
	"problem_id" integer NOT NULL,
	"name" text NOT NULL,
	"full_name" text,
	"best_score" double precision,
	"last_score" double precision,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"last_submitted_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grader_problem_user_id_problem_id_pk" PRIMARY KEY("user_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "internship" (
	"user_id" text NOT NULL,
	"opening_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"logo_url" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"working_condition" text,
	"compensation" integer,
	"compensation_type" text,
	"quota" integer,
	"start_date" text,
	"end_date" text,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"accepting_applications" boolean DEFAULT true NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internship_user_id_opening_id_pk" PRIMARY KEY("user_id","opening_id")
);
--> statement-breakpoint
ALTER TABLE "connector_credential" ADD CONSTRAINT "connector_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grader_problem" ADD CONSTRAINT "grader_problem_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship" ADD CONSTRAINT "internship_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internship_user_comp_idx" ON "internship" USING btree ("user_id","compensation");