CREATE INDEX "academic_terms_status_idx" ON "academic_terms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "academic_terms_start_date_idx" ON "academic_terms" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "book_parts_book_id_idx" ON "book_parts" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_parts_sequence_order_idx" ON "book_parts" USING btree ("sequence_order");--> statement-breakpoint
CREATE INDEX "book_segments_book_part_id_idx" ON "book_segments" USING btree ("book_part_id");--> statement-breakpoint
CREATE INDEX "book_segments_sequence_order_idx" ON "book_segments" USING btree ("sequence_order");--> statement-breakpoint
CREATE INDEX "books_sequence_order_idx" ON "books" USING btree ("sequence_order");--> statement-breakpoint
CREATE INDEX "books_is_active_idx" ON "books" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "books_name_idx" ON "books" USING btree ("name");--> statement-breakpoint
ALTER TABLE "book_parts" ADD CONSTRAINT "book_parts_book_sequence_unique" UNIQUE("book_id","sequence_order");--> statement-breakpoint
ALTER TABLE "book_segments" ADD CONSTRAINT "book_segments_part_sequence_unique" UNIQUE("book_part_id","sequence_order");