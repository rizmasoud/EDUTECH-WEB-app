import { and, count, eq, isNull } from 'drizzle-orm';
import { ConflictException } from '@nestjs/common';
import {
  bookParts,
  bookSegments,
  books,
  syllabi,
} from '../../infrastructure/database/schema/academics.schema';
import { SYLLABUS_ERROR_CODES } from '../domain/syllabus-scope';

/** Number of Parts a book has. Zero means the book is single-part (whole-book syllabus). */
export async function countBookParts(db: any, bookId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bookParts).where(eq(bookParts.bookId, bookId));
  return Number(row?.n ?? 0);
}

/**
 * The one canonical syllabus that applies to a class (exact Book + Part, or the whole-book syllabus of a book
 * without Parts). There is no fallback: a missing syllabus is a domain error, never another Part's or Segment's.
 *
 * The class identifies its Part only through its Segment (`classes.book_segment_id` -> `book_segments.book_part_id`).
 */
export async function resolveCanonicalSyllabusForClass(
  db: any,
  cls: { bookId: string; bookSegmentId: string | null },
): Promise<{ id: string; bookId: string; bookPartId: string | null }> {
  const partCount = await countBookParts(db, cls.bookId);

  if (partCount === 0) {
    const [whole] = await db
      .select({ id: syllabi.id, bookId: syllabi.bookId, bookPartId: syllabi.bookPartId })
      .from(syllabi)
      .where(
        and(
          eq(syllabi.bookId, cls.bookId),
          isNull(syllabi.bookPartId),
          isNull(syllabi.bookSegmentId),
        ),
      );
    if (!whole) {
      const [book] = await db.select({ name: books.name }).from(books).where(eq(books.id, cls.bookId));
      throw new ConflictException({
        code: SYLLABUS_ERROR_CODES.NOT_DEFINED,
        message: `No syllabus has been defined for the whole book "${book?.name ?? cls.bookId}" yet. A Supervisor must create it before a lesson plan can be copied from it.`,
      });
    }
    return whole;
  }

  if (!cls.bookSegmentId) {
    throw new ConflictException({
      code: SYLLABUS_ERROR_CODES.CLASS_PART_UNKNOWN,
      message:
        'This class has no book segment, so its book part (and therefore its syllabus) cannot be determined. Assign the class to a segment first.',
    });
  }

  const [segment] = await db
    .select({ bookPartId: bookSegments.bookPartId, partBookId: bookParts.bookId, partName: bookParts.name })
    .from(bookSegments)
    .innerJoin(bookParts, eq(bookSegments.bookPartId, bookParts.id))
    .where(eq(bookSegments.id, cls.bookSegmentId));

  if (!segment || segment.partBookId !== cls.bookId) {
    throw new ConflictException({
      code: SYLLABUS_ERROR_CODES.CLASS_PART_UNKNOWN,
      message: "This class's book segment does not belong to the class's book, so its book part cannot be determined.",
    });
  }

  const [partSyllabus] = await db
    .select({ id: syllabi.id, bookId: syllabi.bookId, bookPartId: syllabi.bookPartId })
    .from(syllabi)
    .where(and(eq(syllabi.bookId, cls.bookId), eq(syllabi.bookPartId, segment.bookPartId)));

  if (!partSyllabus) {
    throw new ConflictException({
      code: SYLLABUS_ERROR_CODES.NOT_DEFINED,
      message: `No syllabus has been defined for book part "${segment.partName}" yet. A Supervisor must create it before a lesson plan can be copied from it.`,
    });
  }
  return partSyllabus;
}
