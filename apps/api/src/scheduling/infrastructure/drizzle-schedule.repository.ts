import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql, desc, inArray, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { schedules, classes } from '../../infrastructure/database/schema/classes.schema';
import { Schedule, type ScheduleProps } from '../domain/entities/schedule.entity';
import type {
  IScheduleRepository,
  CreateScheduleData,
} from '../domain/repositories/schedule.repository.interface';
import type { FindSchedulesFilter } from '@edutech/shared';

@Injectable()
export class DrizzleScheduleRepository implements IScheduleRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapToEntity(record: any): Schedule {
    return new Schedule({
      id: record.id,
      classId: record.classId,
      dayOfWeek: record.dayOfWeek,
      startTime: record.startTime,
      endTime: record.endTime,
      startsOn: record.startsOn ?? null,
      endsOn: record.endsOn ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<Schedule | null> {
    const [record] = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.id, id))
      .limit(1);

    if (!record) return null;
    return this.mapToEntity(record);
  }

  async findByClassId(classId: string): Promise<Schedule[]> {
    const records = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.classId, classId))
      .orderBy(schedules.dayOfWeek, schedules.startTime);

    return records.map((r: any) => this.mapToEntity(r));
  }

  async findByTeacherId(teacherId: string): Promise<Schedule[]> {
    const records = await this.db
      .select({
        id: schedules.id,
        classId: schedules.classId,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        startsOn: schedules.startsOn,
        endsOn: schedules.endsOn,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
      })
      .from(schedules)
      .innerJoin(classes, eq(schedules.classId, classes.id))
      .where(eq(classes.teacherId, teacherId))
      .orderBy(schedules.dayOfWeek, schedules.startTime);

    return records.map((r: any) => this.mapToEntity(r));
  }

  async findAll(filter?: FindSchedulesFilter): Promise<Schedule[]> {
    const conditions: SQL[] = [];

    if (filter?.classId) {
      conditions.push(eq(schedules.classId, filter.classId));
    }

    if (filter?.dayOfWeek !== undefined) {
      conditions.push(eq(schedules.dayOfWeek, filter.dayOfWeek));
    }

    if (filter?.teacherId) {
      const records = await this.db
        .select({
          id: schedules.id,
          classId: schedules.classId,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          startsOn: schedules.startsOn,
          endsOn: schedules.endsOn,
          createdAt: schedules.createdAt,
          updatedAt: schedules.updatedAt,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id))
        .where(
          conditions.length > 0
            ? and(eq(classes.teacherId, filter.teacherId), ...conditions)
            : eq(classes.teacherId, filter.teacherId),
        )
        .orderBy(schedules.dayOfWeek, schedules.startTime);

      return records.map((r: any) => this.mapToEntity(r));
    }

    const records = await this.db
      .select()
      .from(schedules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(schedules.dayOfWeek, schedules.startTime);

    return records.map((r: any) => this.mapToEntity(r));
  }

  async create(data: CreateScheduleData): Promise<Schedule> {
    const [record] = await this.db
      .insert(schedules)
      .values({
        classId: data.classId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startsOn: data.startsOn ?? null,
        endsOn: data.endsOn ?? null,
      })
      .returning();

    return this.mapToEntity(record);
  }

  async update(id: string, updates: Partial<ScheduleProps>): Promise<Schedule> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.dayOfWeek !== undefined) updateValues.dayOfWeek = updates.dayOfWeek;
    if (updates.startTime !== undefined) updateValues.startTime = updates.startTime;
    if (updates.endTime !== undefined) updateValues.endTime = updates.endTime;
    if (updates.startsOn !== undefined) updateValues.startsOn = updates.startsOn;
    if (updates.endsOn !== undefined) updateValues.endsOn = updates.endsOn;

    const [record] = await this.db
      .update(schedules)
      .set(updateValues)
      .where(eq(schedules.id, id))
      .returning();

    return this.mapToEntity(record);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(schedules)
      .where(eq(schedules.id, id))
      .returning();

    return deleted.length > 0;
  }

  async deleteByClassId(classId: string): Promise<number> {
    const deleted = await this.db
      .delete(schedules)
      .where(eq(schedules.classId, classId))
      .returning();

    return deleted.length;
  }
}
