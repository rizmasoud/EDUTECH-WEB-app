import { Injectable, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@edutech/shared';

@Injectable()
export class TeacherOwnershipPolicy {
  /**
   * Evaluates if the authenticated user has access to a teacher's resource.
   * Supervisors have universal access.
   * Teachers only have access to their own resources (where user.teacherId === targetTeacherId).
   */
  canAccessTeacher(user: AuthUser, targetTeacherId: string): boolean {
    if (user.roles.includes('SUPERVISOR')) {
      return true;
    }

    if (
      user.roles.includes('TEACHER') &&
      user.teacherId !== null &&
      user.teacherId === targetTeacherId
    ) {
      return true;
    }

    return false;
  }

  /**
   * Asserts access, throwing a 403 ForbiddenException if not authorized.
   */
  assertAccess(user: AuthUser, targetTeacherId: string): void {
    if (!this.canAccessTeacher(user, targetTeacherId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access another teacher’s resource.',
      });
    }
  }
}
