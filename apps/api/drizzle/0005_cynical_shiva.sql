CREATE TYPE "public"."scheduling_proposal_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'ACCEPTED', 'MODIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "scheduling_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_term_id" uuid,
	"created_by" uuid,
	"status" "scheduling_proposal_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ADD CONSTRAINT "scheduling_proposals_academic_term_id_academic_terms_id_fk" FOREIGN KEY ("academic_term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_proposals" ADD CONSTRAINT "scheduling_proposals_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_proposals_academic_term_id_idx" ON "scheduling_proposals" USING btree ("academic_term_id");--> statement-breakpoint
CREATE INDEX "scheduling_proposals_status_idx" ON "scheduling_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduling_proposals_created_by_idx" ON "scheduling_proposals" USING btree ("created_by");
