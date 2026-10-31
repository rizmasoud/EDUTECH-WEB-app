import { and, eq } from 'drizzle-orm';
import { enrollments, classes } from '../../infrastructure/database/schema/classes.schema';
import { academicTerms } from '../../infrastructure/database/schema/academics.schema';

/**
 * The single definition of "a student the teacher currently teaches", used by every teacher-facing student and
 * roster read.
 *
 * The "current academic term" is the term whose status is ACTIVE (terms are PLANNED -> ACTIVE -> CLOSED, and the
 * academic-terms service allows one ACTIVE term at a time; the web app selects the ACTIVE term the same way).
 *
 * An enrollment status of ACTIVE alone does NOT mean "current": completing or cancelling a class, or closing a
 * term, leaves its enrollments ACTIVE. So all four must hold at once:
 *   - the class is taught by this teacher,
 *   - the class itself is ACTIVE (not DRAFT, COMPLETED or CANCELLED),
 *   - the class belongs to the ACTIVE term,
 *   - the student's enrollment in it is ACTIVE (not WITHDRAWN or COMPLETED).
 *
 * Use it on a query that joins `enrollments`, `classes` (on enrollments.classId) and `academicTerms`
 * (on classes.academicTermId).
 */
export function currentTeachingCondition(teacherId: string) {
  return and(
    eq(classes.teacherId, teacherId),
    eq(classes.status, 'ACTIVE'),
    eq(academicTerms.status, 'ACTIVE'),
    eq(enrollments.status, 'ACTIVE'),
  );
}

