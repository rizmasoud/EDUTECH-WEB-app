-- Preflight: one canonical Syllabus per Book. This migration never deletes, merges, moves or rewrites
-- Syllabi, Syllabus Items, Parts or Segments. If any Book already has more than one Syllabus (for example
-- legacy Part/Segment-scoped rows), it stops here with the exact records and changes no data; a person must
-- decide which Syllabus is canonical for each Book before the unique index can be created.
DO $$
DECLARE
  report text;
BEGIN
  SELECT string_agg(
           format(
             'book %s (%s): syllabi [%s]',
             b.id,
             b.name,
             d.details
           ),
           E'\n' ORDER BY b.name, b.id
         )
    INTO report
    FROM (
      SELECT s.book_id,
             string_agg(
               format(
                 '%s segment=%s items=%s created_at=%s',
                 s.id,
                 COALESCE(s.book_segment_id::text, 'none'),
                 (SELECT count(*) FROM "syllabus_items" i WHERE i.syllabus_id = s.id),
                 s.created_at
               ),
               '; ' ORDER BY s.created_at, s.id
             ) AS details
        FROM "syllabi" s
       GROUP BY s.book_id
      HAVING count(*) > 1
    ) d
    JOIN "books" b ON b.id = d.book_id;

  IF report IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot enforce one Syllabus per Book: these Books have more than one Syllabus. No data was changed. Decide which Syllabus is canonical for each Book, then re-run.\n%', report;
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "syllabi_book_unique" ON "syllabi" USING btree ("book_id");
