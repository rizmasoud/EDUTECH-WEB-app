/**
 * Canonical syllabus scope rules (Phase 7).
 *
 * A syllabus is defined per Book Part. A book that has no Parts has exactly one whole-book syllabus.
 * Segments are subdivisions inside a Part and are NEVER a syllabus scope.
 *
 * Whether a book "has Parts" is decided by the existence of `book_parts` rows for it. A book with at least one
 * Part (even exactly one) is Part-scoped; the whole-book syllabus applies only to a book with zero Parts.
 */
export const SYLLABUS_ERROR_CODES = {
  /** A Segment was supplied as the syllabus scope. */
  SEGMENT_SCOPE_NOT_ALLOWED: 'SYLLABUS_SEGMENT_SCOPE_NOT_ALLOWED',
  /** The book has Parts, so a Part-specific syllabus is required (no whole-book syllabus). */
  PART_REQUIRED: 'SYLLABUS_PART_REQUIRED',
  /** The book has no Parts, so a Part-specific syllabus is not applicable. */
  PART_NOT_APPLICABLE: 'SYLLABUS_PART_NOT_APPLICABLE',
  /** A syllabus already exists for the same Book + Part (or the same whole book). */
  DUPLICATE_SCOPE: 'SYLLABUS_DUPLICATE_SCOPE',
  /** Lesson plan: the class's Book + Part has no syllabus yet. */
  NOT_DEFINED: 'SYLLABUS_NOT_DEFINED',
  /** Lesson plan: the book has Parts but the class has no Segment, so its Part cannot be determined. */
  CLASS_PART_UNKNOWN: 'CLASS_PART_UNKNOWN',
} as const;

/** True for a PostgreSQL unique-violation, whether raised directly or wrapped as `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}
