import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, gte, lte, inArray, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import { classSessions, classes, schedules } from '../../../infrastructure/database/schema/classes.schema';
import { academicTerms } from '../../../infrastructure/database/schema/academics.schema';
import { GenerateClassSessionsSchema, FindClassSessionsFilterSchema } from '@edutech/shared';
import type { GenerateClassSessionsDto, FindClassSessionsFilterDto, ClassSessionDto, AuthUser } from '@edutech/shared';

@Injectable()
export class SessionGenerationService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Helper to generate timezone-safe ISO dates for a given day of week within a range.
   * Excludes Fridays (Day 5) by default.
   */
  generateDatesForDay(
    startDateStr: string,
    endDateStr: string,
    dayOfWeek: number,
    excludeFridays = true
  ): string[] {
    const dates: string[] = [];
    const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
    const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

    const current = new Date(sYear, sMonth - 1, sDay);
    const end = new Date(eYear, eMonth - 1, eDay);

    while (current <= end) {
      const currentDay = current.getDay(); // 0: Sunday, ..., 6: Saturday
      if (currentDay === dayOfWeek) {
        if (!excludeFridays || currentDay !== 5) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const date = String(current.getDate()).padStart(2, '0');
          dates.push(`${year}-${month}-${date}`);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Generates Class Sessions based on Class schedules and Academic Term dates.
   * Fully idempotent and non-destructive.
   */
  async generate(dto: GenerateClassSessionsDto): Promise<{
    generatedCount: number;
    skippedCount: number;
    sessionIds: string[];
  }> {
    const parseResult = GenerateClassSessionsSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    // Load active classes to process
    let targetClasses: any[] = [];
    if (data.classId) {
      const results = await this.db
        .select()
        .from(classes)
        .where(eq(classes.id, data.classId));
      
      if (results.length === 0) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Class with id ${data.classId} not found`,
        });
      }
      targetClasses = results;
    } else if (data.academicTermId) {
      const results = await this.db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.academicTermId, data.academicTermId),
            eq(classes.status, 'ACTIVE')
          )
        );
      targetClasses = results;
    }

    if (targetClasses.length === 0) {
      return { generatedCount: 0, skippedCount: 0, sessionIds: [] };
    }

    let generatedCount = 0;
    let skippedCount = 0;
    const sessionIds: string[] = [];

    for (const cls of targetClasses) {
      // Load term
      const [term] = await this.db
        .select()
        .from(academicTerms)
        .where(eq(academicTerms.id, cls.academicTermId))
        .limit(1);

      if (!term) continue;

      // Load class schedules
      const classSchedules = await this.db
        .select()
        .from(schedules)
        .where(eq(schedules.classId, cls.id));

      for (const schedule of classSchedules) {
        // Calculate intersected date range
        const startRange = [term.startDate];
        if (schedule.startsOn) {
          startRange.push(schedule.startsOn);
        }
        const endRange = [term.endDate];
        if (schedule.endsOn) {
          endRange.push(schedule.endsOn);
        }

        const genStart = startRange.sort().pop(); // latest date
        const genEnd = endRange.sort()[0]; // earliest date

        if (!genStart || !genEnd || genStart > genEnd) {
          continue;
        }

        // Generate all candidate dates
        const candidateDates = this.generateDatesForDay(genStart, genEnd, schedule.dayOfWeek, true);

        for (const sessionDate of candidateDates) {
          // Check if session already exists for this specific schedule
          const [existing] = await this.db
            .select()
            .from(classSessions)
            .where(
              and(
                eq(classSessions.classId, cls.id),
                eq(classSessions.scheduleId, schedule.id),
                eq(classSessions.sessionDate, sessionDate)
              )
            )
            .limit(1);

          if (existing) {
            skippedCount++;
            continue;
          }

          // Create new session in status 'SCHEDULED'
          try {
            const [created] = await this.db
              .insert(classSessions)
              .values({
                classId: cls.id,
                scheduleId: schedule.id,
                sessionDate,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                status: 'SCHEDULED',
              })
              .returning();

            generatedCount++;
            sessionIds.push(created.id);
          } catch (err: any) {
            // Gracefully catch unique constraint violation from concurrent generation requests
            const isUniqueViolation =
              err.code === '23505' ||
              err.message?.includes('unique constraint') ||
              err.message?.includes('23505') ||
              err.message?.includes('class_schedule_date_unique');

            if (isUniqueViolation) {
              skippedCount++;
            } else {
              throw err;
            }
          }
        }
      }
    }

    return {
      generatedCount,
      skippedCount,
      sessionIds,
    };
  }

  /**
   * Lists generated class sessions with pagination and RBAC boundaries.
   */
  async findAll(filter: FindClassSessionsFilterDto, user: AuthUser): Promise<ClassSessionDto[]> {
    const parseResult = FindClassSessionsFilterSchema.safeParse(filter);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isTeacher = user.roles.includes('TEACHER');

    const conditions: SQL[] = [];

    // Filter parameters
    if (data.classId) {
      conditions.push(eq(classSessions.classId, data.classId));
    }
    if (data.startDate) {
      conditions.push(gte(classSessions.sessionDate, data.startDate));
    }
    if (data.endDate) {
      conditions.push(lte(classSessions.sessionDate, data.endDate));
    }

    // Filter by academicTermId requires joining on classes table
    if (data.academicTermId) {
      const termClasses = await this.db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.academicTermId, data.academicTermId));
      
      const classIds = termClasses.map((c: any) => c.id);
      if (classIds.length === 0) {
        return [];
      }
      conditions.push(inArray(classSessions.classId, classIds));
    }

    // Role-based Access Control (RBAC) boundaries
    if (!isSupervisor && isTeacher) {
      if (!user.teacherId) {
        return [];
      }
      // Teachers can only view sessions for their assigned classes
      const teacherClasses = await this.db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.teacherId, user.teacherId as string));
      
      const teacherClassIds = teacherClasses.map((c: any) => c.id);
      if (teacherClassIds.length === 0) {
        return [];
      }
      conditions.push(inArray(classSessions.classId, teacherClassIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select()
      .from(classSessions)
      .where(whereClause);

    return results.map((s: any) => ({
      id: s.id,
      classId: s.classId,
      scheduleId: s.scheduleId,
      sessionDate: s.sessionDate,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }
}
