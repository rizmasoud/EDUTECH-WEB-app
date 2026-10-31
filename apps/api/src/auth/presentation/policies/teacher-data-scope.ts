import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@edutech/shared';

/**
 * Which records of classes, students and enrollments the caller may read.
 *
 * - ALL: a supervisor (unchanged, unrestricted).
 * - TEACHER: a teacher account linked to a teacher record; limited to that teacher's own classes and to the
 *   students actively enrolled in them.
 * - NONE: any other authenticated account (for example a teacher account with no linked teacher record).
 *   It gets nothing, never everything.
 *
 * This is enforced by the backend services (not by the UI). Keep the rule in this one place so that every read
 * path resolves it the same way.
 */
export type DataScope =
  | { kind: 'ALL' }
  | { kind: 'TEACHER'; teacherId: string }
  | { kind: 'NONE' };

export function resolveDataScope(user: AuthUser): DataScope {
  if (user.roles.includes('SUPERVISOR')) {
    return { kind: 'ALL' };
  }
  if (user.roles.includes('TEACHER') && user.teacherId) {
    return { kind: 'TEACHER', teacherId: user.teacherId };
  }
  return { kind: 'NONE' };
}

export function isSupervisor(user: AuthUser): boolean {
  return user.roles.includes('SUPERVISOR');
}

/**
 * Same 403 for "exists but is not yours" and "does not exist" when the caller is a teacher, so a teacher cannot
 * probe ids to learn which records exist.
 */
export function forbiddenResource(message: string): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN_RESOURCE',
    message,
  });
}
