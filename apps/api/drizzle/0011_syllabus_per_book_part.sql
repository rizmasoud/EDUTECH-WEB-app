-- Preflight (read-only): the new whole-book uniqueness index would fail on legacy data that has several
-- whole-book syllabi for one book. Fail here with an explicit message instead of a bare index error.
-- Nothing is ever deleted, merged or rewritten by this migration. Remediation: keep the intended syllabus
-- and decide per extra syllabus (move its items, or contact the Supervisor); then re-run the migration.
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(format('book %s has %s whole-book syllabi (%s)', book_id, n, ids), '; ')
    INTO conflicts
  FROM (
    SELECT book_id, count(*) AS n, string_agg(id::text, ', ' ORDER BY created_at, id) AS ids
    FROM syllabi
    WHERE book_segment_id IS NULL
    GROUP BY book_id
    HAVING count(*) > 1
  ) dup;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0011 aborted: duplicate whole-book syllabi must be resolved by a Supervisor first (no data was changed): %', conflicts;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "book_part_id" uuid;--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_book_part_id_book_parts_id_fk" FOREIGN KEY ("book_part_id") REFERENCES "public"."book_parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syllabi_book_part_id_idx" ON "syllabi" USING btree ("book_part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "syllabi_book_part_unique" ON "syllabi" USING btree ("book_id","book_part_id") WHERE "syllabi"."book_part_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "syllabi_book_whole_unique" ON "syllabi" USING btree ("book_id") WHERE "syllabi"."book_part_id" IS NULL AND "syllabi"."book_segment_id" IS NULL;--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_single_scope_check" CHECK (NOT ("syllabi"."book_part_id" IS NOT NULL AND "syllabi"."book_segment_id" IS NOT NULL));