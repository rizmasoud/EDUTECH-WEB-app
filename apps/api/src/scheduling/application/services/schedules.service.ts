import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  classes,
  enrollments,
  schedules,
} from '../../../infrastructure/database/schema/classes.schema';
import { teachers, teacherSkills } from '../../../infrastructure/database/schema/teachers.schema';
import {
  SCHEDULE_REPOSITORY,
  SCHEDULING_ENGINE,
} from '../../domain/tokens';
import type { IScheduleRepository } from '../../domain/repositories/schedule.repository.interface';
import { SchedulingEngine } from '../../domain/engine/scheduling.engine';
import { Schedule } from '../../domain/entities/schedule.entity';
import { TimeSlot } from '../../domain/value-objects/time-slot.vo';
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  type CreateScheduleDto,
  type UpdateScheduleDto,
  type ScheduleDto,
  type FindSchedulesFilter,
  type AuthUser,
  RoleName,
} from '@edutech/shared';
import type {
  SchedulingClassContext,
  ExistingClassSchedule,
} from '../../domain/engine/scheduling-context.interface';

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IScheduleRepository,
    @Inject(SCHEDULING_ENGINE)
    private readonly engine: SchedulingEngine,
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapToDto(schedule: Schedule): ScheduleDto {
    return schedule.toDto();
  }

  async findAll(filter: FindSchedulesFilter, user: AuthUser): Promise<ScheduleDto[]> {
    const isSupervisor = user.roles.includes(RoleName.SUPERVISOR);
    const isTeacher = user.roles.includes(RoleName.TEACHER);

    if (!isSupervisor && isTeacher) {
      if (!user.teacherId) {
        throw new ForbiddenException({
          code: 'UNASSOCIATED_TEACHER_ACCOUNT',
          message: 'Teacher account is not associated with a Teacher profile',
        });
      }
      // Restrict to teacher's assigned classes
      const items = await this.scheduleRepo.findAll({
        ...filter,
        teacherId: user.teacherId,
      });
      return items.map((s) => this.mapToDto(s));
    }

    const items = await this.scheduleRepo.findAll(filter);
    return items.map((s) => this.mapToDto(s));
  }

  async findById(id: string, user: AuthUser): Promise<ScheduleDto> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Schedule with id ${id} not found`,
      });
    }

    const isSupervisor = user.roles.includes(RoleName.SUPERVISOR);
    const isTeacher = user.roles.includes(RoleName.TEACHER);

    if (!isSupervisor && isTeacher) {
      // Verify teacher is assigned to this class
      const [cls] = await this.db
        .select()
        .from(classes)
        .where(eq(classes.id, schedule.classId))
        .limit(1);

      if (!cls || cls.teacherId !== user.teacherId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_RESOURCE',
          message: 'You can only view schedules for your own classes',
        });
      }
    }

    return this.mapToDto(schedule);
  }

  private async buildClassContext(
    classId: string,
    excludeScheduleId?: string,
  ): Promise<SchedulingClassContext> {
    const [cls] = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${classId} not found`,
      });
    }

    // Load enrolled students
    const enrRecords = await this.db
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'ACTIVE')));

    const enrolledStudentIds = enrRecords.map((e: any) => e.studentId);

    // Load existing schedules for this class
    const classSchedulesRecords = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.classId, classId));

    const existingClassSchedules: ExistingClassSchedule[] = classSchedulesRecords
      .filter((s: any) => s.id !== excludeScheduleId)
      .map((s: any) => ({
        id: s.id,
        classId: s.classId,
        teacherId: cls.teacherId,
        slot: new TimeSlot(s.dayOfWeek, s.startTime, s.endTime),
        enrolledStudentIds,
      }));

    // Load existing teacher schedules across other classes
    let existingTeacherSchedules: ExistingClassSchedule[] = [];
    let skills: Array<{ teacherId: string; bookId: string }> = [];

    if (cls.teacherId) {
      const teacherScheduleRecords = await this.db
        .select({
          id: schedules.id,
          classId: schedules.classId,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id))
        .where(eq(classes.teacherId, cls.teacherId));

      existingTeacherSchedules = teacherScheduleRecords
        .filter((s: any) => s.id !== excludeScheduleId)
        .map((s: any) => ({
          id: s.id,
          classId: s.classId,
          teacherId: cls.teacherId,
          slot: new TimeSlot(s.dayOfWeek, s.startTime, s.endTime),
        }));

      const skillRecords = await this.db
        .select({ teacherId: teacherSkills.teacherId, bookId: teacherSkills.bookId })
        .from(teacherSkills)
        .where(eq(teacherSkills.teacherId, cls.teacherId));

      skills = skillRecords;
    }

    // Load existing student schedules in other classes
    const existingStudentSchedules = new Map<string, ExistingClassSchedule[]>();
    if (enrolledStudentIds.length > 0) {
      for (const studentId of enrolledStudentIds) {
        const studentClassRecords = await this.db
          .select({
            id: schedules.id,
            classId: schedules.classId,
            dayOfWeek: schedules.dayOfWeek,
            startTime: schedules.startTime,
            endTime: schedules.endTime,
          })
          .from(schedules)
          .innerJoin(enrollments, eq(schedules.classId, enrollments.classId))
          .where(
            and(
              eq(enrollments.studentId, studentId),
              eq(enrollments.status, 'ACTIVE'),
            ),
          );

        const studentScheds: ExistingClassSchedule[] = studentClassRecords
          .filter((s: any) => s.classId !== classId && s.id !== excludeScheduleId)
          .map((s: any) => ({
            id: s.id,
            classId: s.classId,
            slot: new TimeSlot(s.dayOfWeek, s.startTime, s.endTime),
          }));

        existingStudentSchedules.set(studentId, studentScheds);
      }
    }

    return {
      classInfo: {
        id: cls.id,
        academicTermId: cls.academicTermId,
        bookId: cls.bookId,
        bookSegmentId: cls.bookSegmentId,
        teacherId: cls.teacherId,
        capacity: cls.capacity,
        classType: cls.classType,
        status: cls.status,
        enrolledStudentIds,
      },
      existingClassSchedules,
      existingTeacherSchedules,
      existingStudentSchedules,
      teacherSkills: skills,
    };
  }

  async create(input: CreateScheduleDto, _user: AuthUser): Promise<ScheduleDto> {
    const parseResult = CreateScheduleSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const requestedSlot = new TimeSlot(data.dayOfWeek, data.startTime, data.endTime);

    // Build context & validate with pure domain engine
    const context = await this.buildClassContext(data.classId);
    const evaluation = this.engine.evaluateSlot(requestedSlot, context);

    if (!evaluation.isValid) {
      const primaryConflict = evaluation.conflicts[0];
      throw new BadRequestException({
        code: primaryConflict?.code || 'INVALID_SCHEDULE_SLOT',
        message: primaryConflict?.message || 'Schedule slot violates scheduling constraints.',
        details: {
          conflicts: evaluation.conflicts,
          failedConstraints: evaluation.hardConstraintReports
            .filter((r) => !r.passed)
            .map((r) => r.constraintName),
        },
      });
    }

    const created = await this.scheduleRepo.create({
      classId: data.classId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      startsOn: data.startsOn ?? null,
      endsOn: data.endsOn ?? null,
    });

    return this.mapToDto(created);
  }

  async update(id: string, input: UpdateScheduleDto, _user: AuthUser): Promise<ScheduleDto> {
    const parseResult = UpdateScheduleSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Schedule with id ${id} not found`,
      });
    }

    const data = parseResult.data;
    const targetDayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
    const targetStartTime = data.startTime ?? existing.startTime;
    const targetEndTime = data.endTime ?? existing.endTime;

    const requestedSlot = new TimeSlot(targetDayOfWeek, targetStartTime, targetEndTime);

    // Build context excluding this schedule to allow updating
    const context = await this.buildClassContext(existing.classId, id);
    const evaluation = this.engine.evaluateSlot(requestedSlot, context);

    if (!evaluation.isValid) {
      const primaryConflict = evaluation.conflicts[0];
      throw new BadRequestException({
        code: primaryConflict?.code || 'INVALID_SCHEDULE_SLOT',
        message: primaryConflict?.message || 'Updated schedule slot violates scheduling constraints.',
        details: {
          conflicts: evaluation.conflicts,
          failedConstraints: evaluation.hardConstraintReports
            .filter((r) => !r.passed)
            .map((r) => r.constraintName),
        },
      });
    }

    const updated = await this.scheduleRepo.update(id, {
      dayOfWeek: targetDayOfWeek,
      startTime: targetStartTime,
      endTime: targetEndTime,
      startsOn: data.startsOn,
      endsOn: data.endsOn,
    });

    return this.mapToDto(updated);
  }

  async delete(id: string, _user: AuthUser): Promise<boolean> {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Schedule with id ${id} not found`,
      });
    }

    return this.scheduleRepo.delete(id);
  }
}
