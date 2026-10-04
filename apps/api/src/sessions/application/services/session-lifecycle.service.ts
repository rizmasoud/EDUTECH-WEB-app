import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  classSessions,
  classes,
} from '../../../infrastructure/database/schema/classes.schema';
import { substitutionRequests } from '../../../infrastructure/database/schema/substitutions.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import {
  CancelClassSessionSchema,
  UpdateClassSessionSchema,
} from '@edutech/shared';
import type {
  CancelClassSessionDto,
  UpdateClassSessionDto,
  ClassSessionLifecycleResponseDto,
  ClassSessionDetailDto,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class SessionLifecycleService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Helper to load session with class metadata
   */
  private async getSessionWithClass(sessionId: string) {
    const [session] = await this.db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        scheduleId: classSessions.scheduleId,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        status: classSessions.status,
        createdAt: classSessions.createdAt,
        updatedAt: classSessions.updatedAt,
        classAcademicTermId: classes.academicTermId,
        classBookId: classes.bookId,
        classTeacherId: classes.teacherId,
        classCapacity: classes.capacity,
        classStatus: classes.status,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(classSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class session with id ${sessionId} not found`,
      });
    }

    return session;
  }

  /**
   * POST /api/v1/sessions/:id/complete
   * Explicitly transition session status from SCHEDULED to COMPLETED.
   * Allowed for Supervisor, assigned Class Teacher, or Approved Substitute Teacher.
   */
  async completeSession(
    sessionId: string,
    user: AuthUser,
  ): Promise<ClassSessionLifecycleResponseDto> {
    const session = await this.getSessionWithClass(sessionId);

    // Authorization check
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isTeacher = user.roles.includes('TEACHER');

    if (!isSupervisor) {
      const isAssignedTeacher =
        isTeacher && user.teacherId && session.classTeacherId === user.teacherId;

      let isApprovedSubstitute = false;
      if (isTeacher && user.teacherId) {
        const [sub] = await this.db
          .select()
          .from(substitutionRequests)
          .where(
            and(
              eq(substitutionRequests.classSessionId, sessionId),
              eq(substitutionRequests.approvedTeacherId, user.teacherId),
              eq(substitutionRequests.status, 'APPROVED'),
            ),
          )
          .limit(1);
        if (sub) {
          isApprovedSubstitute = true;
        }
      }

      if (!isAssignedTeacher && !isApprovedSubstitute) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_RESOURCE',
          message: 'Only assigned teachers, approved substitutes, or supervisors can complete a class session',
        });
      }
    }

    // State check
    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot complete a session that is currently in '${session.status}' state`,
      });
    }

    // Execute atomic transaction
    return await this.db.transaction(async (tx: any) => {
      const now = new Date();

      await tx
        .update(classSessions)
        .set({
          status: 'COMPLETED',
          updatedAt: now,
        })
        .where(eq(classSessions.id, sessionId));

      // Also if there is an APPROVED substitution request for this session, transition it to COMPLETED
      await tx
        .update(substitutionRequests)
        .set({
          status: 'COMPLETED',
          updatedAt: now,
        })
        .where(
          and(
            eq(substitutionRequests.classSessionId, sessionId),
            eq(substitutionRequests.status, 'APPROVED'),
          ),
        );

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'COMPLETE_CLASS_SESSION',
        entityType: 'CLASS_SESSION',
        entityId: sessionId,
        metadata: {},
      });

      return {
        id: sessionId,
        status: 'COMPLETED' as const,
        updatedAt: now,
      };
    });
  }

  /**
   * POST /api/v1/sessions/:id/cancel
   * Explicitly transition session status from SCHEDULED to CANCELLED (SUPERVISOR only)
   */
  async cancelSession(
    sessionId: string,
    dto: CancelClassSessionDto,
    user: AuthUser,
  ): Promise<ClassSessionLifecycleResponseDto> {
    const parseResult = CancelClassSessionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    // Authorization check (SUPERVISOR only)
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can cancel a class session',
      });
    }

    const session = await this.getSessionWithClass(sessionId);

    // State check
    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot cancel a session that is currently in '${session.status}' state`,
      });
    }

    // Execute atomic transaction
    return await this.db.transaction(async (tx: any) => {
      const now = new Date();

      await tx
        .update(classSessions)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
        })
        .where(eq(classSessions.id, sessionId));

      // Cancel any active substitution requests for this session
      await tx
        .update(substitutionRequests)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
        })
        .where(
          and(
            eq(substitutionRequests.classSessionId, sessionId),
            eq(substitutionRequests.status, 'REQUESTED'),
          ),
        );

      const metadata: Record<string, any> = {};
      if (data.reason) {
        metadata.reason = data.reason;
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CANCEL_CLASS_SESSION',
        entityType: 'CLASS_SESSION',
        entityId: sessionId,
        metadata,
      });

      return {
        id: sessionId,
        status: 'CANCELLED' as const,
        updatedAt: now,
      };
    });
  }

  /**
   * PATCH /api/v1/sessions/:id
   * Update session schedule/date details (SUPERVISOR only)
   */
  async updateSession(
    sessionId: string,
    dto: UpdateClassSessionDto,
    user: AuthUser,
  ): Promise<ClassSessionDetailDto> {
    const parseResult = UpdateClassSessionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    // Authorization check (SUPERVISOR only)
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can update class session details',
      });
    }

    const session = await this.getSessionWithClass(sessionId);

    // State check
    if (session.status !== 'SCHEDULED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot edit a session that is in '${session.status}' state`,
      });
    }

    // Validate start/end time ordering if both or one updated
    const finalStart = data.startTime ?? session.startTime;
    const finalEnd = data.endTime ?? session.endTime;
    if (finalStart >= finalEnd) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'startTime must precede endTime',
      });
    }

    return await this.db.transaction(async (tx: any) => {
      const now = new Date();
      const updatePayload: Record<string, any> = {
        updatedAt: now,
      };

      if (data.sessionDate !== undefined) updatePayload.sessionDate = data.sessionDate;
      if (data.startTime !== undefined) updatePayload.startTime = data.startTime;
      if (data.endTime !== undefined) updatePayload.endTime = data.endTime;

      let updated;
      try {
        [updated] = await tx
          .update(classSessions)
          .set(updatePayload)
          .where(eq(classSessions.id, sessionId))
          .returning();
      } catch (err: any) {
        const isUniqueViolation =
          err.code === '23505' ||
          err.cause?.code === '23505' ||
          err.message?.includes('unique constraint') ||
          err.message?.includes('23505') ||
          err.message?.includes('class_schedule_date_unique') ||
          err.cause?.message?.includes('unique constraint') ||
          err.cause?.message?.includes('class_sessions_class_schedule_date_unique');

        if (isUniqueViolation) {
          throw new BadRequestException({
            code: 'DUPLICATE_SESSION',
            message: 'A session for this class and schedule already exists on the specified date',
          });
        }
        throw err;
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_CLASS_SESSION',
        entityType: 'CLASS_SESSION',
        entityId: sessionId,
        metadata: {
          ...data,
          previousSessionDate: session.sessionDate,
          previousStartTime: session.startTime,
          previousEndTime: session.endTime,
        },
      });

      return {
        id: updated.id,
        classId: updated.classId,
        scheduleId: updated.scheduleId,
        sessionDate: updated.sessionDate,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        class: {
          id: session.classId,
          academicTermId: session.classAcademicTermId,
          bookId: session.classBookId,
          teacherId: session.classTeacherId,
          capacity: session.classCapacity,
          status: session.classStatus,
        },
      };
    });
  }
}
