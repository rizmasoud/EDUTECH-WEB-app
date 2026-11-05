import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  classSessions,
  classes,
  enrollments,
} from '../../../infrastructure/database/schema/classes.schema';
import {
  attendanceRecords,
  teacherAttendanceRecords,
} from '../../../infrastructure/database/schema/attendance.schema';
import { substitutionRequests } from '../../../infrastructure/database/schema/substitutions.schema';
import { SUBSTITUTE_EFFECTIVE_STATUSES } from '../../../substitution/domain/substitution-status';
import { hasSessionStarted, resolveBusinessTimeZone } from '../../domain/session-start';
import { CLOCK, systemClock } from '../../../shared/clock';
import type { Clock } from '../../../shared/clock';
import { students } from '../../../infrastructure/database/schema/students.schema';
import { teachers } from '../../../infrastructure/database/schema/teachers.schema';
import { academicTerms } from '../../../infrastructure/database/schema/academics.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import {
  RecordStudentAttendanceSchema,
  RecordTeacherAttendanceSchema,
} from '@edutech/shared';
import type {
  RecordStudentAttendanceDto,
  RecordTeacherAttendanceDto,
  TeacherAttendanceSummaryDto,
  TeacherAttendanceSummaryScope,
  AttendanceRecordWithStudentDto,
  ClassSessionDetailDto,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
    @Optional()
    @Inject(CLOCK)
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Helper to load session with class metadata.
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
   * Helper to verify user permissions for a session, taking approved substitution into account.
   */
  private async checkUserSessionAccess(session: any, user: AuthUser) {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isTeacher = user.roles.includes('TEACHER');

    if (isSupervisor) return;

    if (isTeacher) {
      if (user.teacherId) {
        // Direct assigned teacher
        if (session.classTeacherId === user.teacherId) {
          return;
        }

        // Approved substitute teacher
        const [sub] = await this.db
          .select()
          .from(substitutionRequests)
          .where(
            and(
              eq(substitutionRequests.classSessionId, session.id),
              eq(substitutionRequests.approvedTeacherId, user.teacherId),
              eq(substitutionRequests.status, 'APPROVED'),
            ),
          )
          .limit(1);

        if (sub) {
          return;
        }
      }

      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Teacher is not assigned or approved as substitute for this class session',
      });
    }

    throw new ForbiddenException({
      code: 'FORBIDDEN_RESOURCE',
      message: 'User is not authorized to access this session',
    });
  }

  /**
   * GET /api/v1/sessions/:id
   * Get single session detail with class metadata
   */
  async findSessionDetail(
    sessionId: string,
    user: AuthUser,
  ): Promise<ClassSessionDetailDto> {
    const s = await this.getSessionWithClass(sessionId);
    await this.checkUserSessionAccess(s, user);

    return {
      id: s.id,
      classId: s.classId,
      scheduleId: s.scheduleId,
      sessionDate: s.sessionDate,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      class: {
        id: s.classId,
        academicTermId: s.classAcademicTermId,
        bookId: s.classBookId,
        teacherId: s.classTeacherId,
        capacity: s.classCapacity,
        status: s.classStatus,
      },
    };
  }

  /**
   * GET /api/v1/sessions/:sessionId/attendance
   * Get student attendance records for a session
   */
  async findStudentAttendance(
    sessionId: string,
    user: AuthUser,
  ): Promise<AttendanceRecordWithStudentDto[]> {
    const s = await this.getSessionWithClass(sessionId);
    await this.checkUserSessionAccess(s, user);

    const records = await this.db
      .select({
        id: attendanceRecords.id,
        classSessionId: attendanceRecords.classSessionId,
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
        recordedBy: attendanceRecords.recordedBy,
        recordedAt: attendanceRecords.recordedAt,
        updatedAt: attendanceRecords.updatedAt,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        studentShahvarCode: students.shahvarCode,
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(attendanceRecords.studentId, students.id))
      .where(eq(attendanceRecords.classSessionId, sessionId));

    return records.map((r: any) => ({
      id: r.id,
      classSessionId: r.classSessionId,
      studentId: r.studentId,
      status: r.status,
      recordedBy: r.recordedBy,
      recordedAt: r.recordedAt,
      updatedAt: r.updatedAt,
      student: {
        id: r.studentId,
        firstName: r.studentFirstName,
        lastName: r.studentLastName,
        shahvarCode: r.studentShahvarCode,
      },
    }));
  }

  /**
   * POST /api/v1/sessions/:sessionId/attendance
   * Submit student attendance records in a single atomic transaction
   */
  async recordStudentAttendance(
    sessionId: string,
    dto: RecordStudentAttendanceDto,
    user: AuthUser,
  ): Promise<{ recordedCount: number; sessionStatus: string }> {
    const parseResult = RecordStudentAttendanceSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const isSupervisor = user.roles.includes('SUPERVISOR');

    // Execute atomic transaction
    return await this.db.transaction(async (tx: any) => {
      // 1. Session lookup
      const [session] = await tx
        .select({
          id: classSessions.id,
          classId: classSessions.classId,
          status: classSessions.status,
          sessionDate: classSessions.sessionDate,
          startTime: classSessions.startTime,
          classTeacherId: classes.teacherId,
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

      // 2. Reject cancelled sessions
      if (session.status === 'CANCELLED') {
        throw new BadRequestException({
          code: 'INVALID_STATE',
          message: 'Cannot record attendance for a cancelled session',
        });
      }

      // 3. Authorization check (Supervisor, Assigned Teacher, or Approved Substitute)
      if (!isSupervisor) {
        const isAssignedTeacher =
          user.teacherId && session.classTeacherId === user.teacherId;

        let isApprovedSubstitute = false;
        if (user.teacherId) {
          const [sub] = await tx
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
            message: 'Teacher is not assigned or approved as substitute for this class session',
          });
        }
      }

      // 4. Validate Student Enrollments (all submitted students must belong to session's class)
      const validEnrollments = await tx
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, session.classId),
            inArray(enrollments.status, ['ACTIVE', 'COMPLETED']),
          ),
        );

      const enrolledStudentIds = new Set(validEnrollments.map((e: any) => e.studentId));

      for (const item of data.items) {
        if (!enrolledStudentIds.has(item.studentId)) {
          throw new BadRequestException({
            code: 'INVALID_ENROLLMENT',
            message: `Student ${item.studentId} is not enrolled in class ${session.classId}`,
          });
        }
      }

      // 5. Existing attendance check for Teachers (read-once, writable only once)
      const existingRecords = await tx
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.classSessionId, sessionId));

      if (!isSupervisor && existingRecords.length > 0) {
        throw new BadRequestException({
          code: 'ATTENDANCE_ALREADY_RECORDED',
          message:
            'Attendance has already been recorded for this session. Teachers cannot directly rewrite existing attendance.',
        });
      }

      // 6. Attendance can only be recorded once the scheduled start has been reached. The session
      // date/time are school wall-clock values, so they are interpreted in the business time zone
      // (never the server's). Rejecting here, before any write, leaves the records untouched.
      const businessTimeZone = resolveBusinessTimeZone();
      if (!hasSessionStarted(session, this.clock.now(), businessTimeZone)) {
        throw new BadRequestException({
          code: 'SESSION_NOT_STARTED',
          message: `Attendance cannot be recorded before the session starts (${session.sessionDate} ${String(session.startTime).slice(0, 5)} ${businessTimeZone}).`,
        });
      }

      // 7. Bulk writes & Audit logging
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let excusedCount = 0;

      for (const item of data.items) {
        if (item.status === 'PRESENT') presentCount++;
        else if (item.status === 'ABSENT') absentCount++;
        else if (item.status === 'LATE') lateCount++;
        else if (item.status === 'EXCUSED') excusedCount++;

        const existingRecord = existingRecords.find(
          (r: any) => r.studentId === item.studentId,
        );

        if (existingRecord) {
          if (isSupervisor) {
            await tx
              .update(attendanceRecords)
              .set({
                status: item.status,
                recordedBy: user.id,
                updatedAt: new Date(),
              })
              .where(eq(attendanceRecords.id, existingRecord.id));
          }
        } else {
          await tx.insert(attendanceRecords).values({
            classSessionId: sessionId,
            studentId: item.studentId,
            status: item.status,
            recordedBy: user.id,
          });
        }
      }

      // Write Audit Log
      const isOverride = existingRecords.length > 0;
      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: isOverride
          ? 'OVERRIDE_STUDENT_ATTENDANCE'
          : 'RECORD_STUDENT_ATTENDANCE',
        entityType: 'CLASS_SESSION',
        entityId: sessionId,
        metadata: {
          studentCount: data.items.length,
          presentCount,
          absentCount,
          lateCount,
          excusedCount,
        },
      });

      return {
        recordedCount: data.items.length,
        sessionStatus: session.status,
      };
    });
  }

  /**
   * GET /api/v1/sessions/:sessionId/teacher-attendance
   * Get teacher attendance record for a session
   */
  async findTeacherAttendance(
    sessionId: string,
    user: AuthUser,
  ): Promise<any> {
    const s = await this.getSessionWithClass(sessionId);
    await this.checkUserSessionAccess(s, user);

    // A teacher only ever reads their OWN attendance record for the session (never the substitute's or the
    // assigned teacher's); a supervisor reads the session's record.
    const [record] = await this.db
      .select()
      .from(teacherAttendanceRecords)
      .where(
        and(
          eq(teacherAttendanceRecords.classSessionId, sessionId),
          ...(user.roles.includes('SUPERVISOR')
            ? []
            : [eq(teacherAttendanceRecords.teacherId, user.teacherId as string)]),
        ),
      )
      .limit(1);

    if (!record) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher attendance record for session ${sessionId} not found`,
      });
    }

    return record;
  }

  /**
   * GET /api/v1/teachers/:id/attendance-summary
   * How many sessions the teacher attended / missed AS A TEACHER (teacher_attendance_records; student attendance
   * lives in a different table). A teacher may read only their own summary; a supervisor any teacher's.
   * `term`: 'all' (default), 'current' (classes of the ACTIVE term) or an academic term id. Counts only,
   * nothing financial.
   */
  async getTeacherAttendanceSummary(
    teacherId: string,
    user: AuthUser,
    term?: string,
  ): Promise<TeacherAttendanceSummaryDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor && !(user.roles.includes('TEACHER') && user.teacherId === teacherId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You can only view your own attendance',
      });
    }

    const [teacher] = await this.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${teacherId} not found`,
      });
    }

    // Which terms to count. A record belongs to the term of the class its session belongs to
    // (teacher_attendance_records -> class_sessions -> classes -> academic_terms); every link is a NOT NULL
    // foreign key, so every record has exactly one term and none is left unclassified.
    const conditions: SQL[] = [eq(teacherAttendanceRecords.teacherId, teacherId)];
    let scope: TeacherAttendanceSummaryScope = 'ALL';
    let academicTermId: string | null = null;

    if (term === undefined || term === '' || term === 'all') {
      scope = 'ALL';
    } else if (term === 'current') {
      scope = 'CURRENT';
      const active: Array<{ id: string }> = await this.db
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.status, 'ACTIVE'));
      academicTermId = active.length === 1 ? active[0].id : null;
      conditions.push(eq(academicTerms.status, 'ACTIVE'));
    } else {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: "term must be 'current', 'all' or an academic term id",
        });
      }
      const [found] = await this.db
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.id, term))
        .limit(1);
      if (!found) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Academic term with id ${term} not found`,
        });
      }
      scope = 'TERM';
      academicTermId = found.id;
      conditions.push(eq(academicTerms.id, found.id));
    }

    const rows: Array<{ status: string; n: number }> = await this.db
      .select({ status: teacherAttendanceRecords.status, n: sql<number>`count(*)::int` })
      .from(teacherAttendanceRecords)
      .innerJoin(classSessions, eq(teacherAttendanceRecords.classSessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .innerJoin(academicTerms, eq(classes.academicTermId, academicTerms.id))
      .where(and(...conditions))
      .groupBy(teacherAttendanceRecords.status);

    const count = (status: string) => Number(rows.find((r) => r.status === status)?.n ?? 0);
    const sessionsAttended = count('PRESENT');
    const sessionsAbsent = count('ABSENT');
    const sessionsExcused = count('EXCUSED');
    return {
      teacherId,
      scope,
      academicTermId,
      sessionsAttended,
      sessionsAbsent,
      sessionsExcused,
      sessionsRecorded: sessionsAttended + sessionsAbsent + sessionsExcused,
    };
  }

  /**
   * POST /api/v1/sessions/:sessionId/teacher-attendance
   * Submit/record teacher attendance for a session (SUPERVISOR only)
   */
  async recordTeacherAttendance(
    sessionId: string,
    dto: RecordTeacherAttendanceDto,
    user: AuthUser,
  ): Promise<any> {
    const parseResult = RecordTeacherAttendanceSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const isSupervisor = user.roles.includes('SUPERVISOR');

    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can record teacher attendance',
      });
    }

    return await this.db.transaction(async (tx: any) => {
      const [session] = await tx
        .select({
          id: classSessions.id,
          status: classSessions.status,
          classTeacherId: classes.teacherId,
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

      if (session.status === 'CANCELLED') {
        throw new BadRequestException({
          code: 'INVALID_STATE',
          message: 'Cannot record teacher attendance for a cancelled session',
        });
      }

      // Check if teacher is either assigned class teacher OR approved substitute teacher
      const isAssigned = session.classTeacherId === data.teacherId;
      const [sub] = await tx
        .select()
        .from(substitutionRequests)
        .where(
          and(
            eq(substitutionRequests.classSessionId, sessionId),
            eq(substitutionRequests.approvedTeacherId, data.teacherId),
            inArray(substitutionRequests.status, [...SUBSTITUTE_EFFECTIVE_STATUSES]),
          ),
        )
        .limit(1);

      if (!isAssigned && !sub) {
        throw new BadRequestException({
          code: 'INVALID_TEACHER_ASSIGNMENT',
          message: `Teacher ${data.teacherId} is neither assigned nor an approved substitute for this class session`,
        });
      }

      // Upsert teacher attendance record
      const [existing] = await tx
        .select()
        .from(teacherAttendanceRecords)
        .where(
          and(
            eq(teacherAttendanceRecords.classSessionId, sessionId),
            eq(teacherAttendanceRecords.teacherId, data.teacherId),
          ),
        )
        .limit(1);

      let record;
      if (existing) {
        [record] = await tx
          .update(teacherAttendanceRecords)
          .set({
            status: data.status,
            recordedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(teacherAttendanceRecords.id, existing.id))
          .returning();
      } else {
        [record] = await tx
          .insert(teacherAttendanceRecords)
          .values({
            classSessionId: sessionId,
            teacherId: data.teacherId,
            status: data.status,
            recordedBy: user.id,
          })
          .returning();
      }

      // Write Audit Log
      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'RECORD_TEACHER_ATTENDANCE',
        entityType: 'CLASS_SESSION',
        entityId: sessionId,
        metadata: {
          teacherId: data.teacherId,
          status: data.status,
        },
      });

      return record;
    });
  }
}
