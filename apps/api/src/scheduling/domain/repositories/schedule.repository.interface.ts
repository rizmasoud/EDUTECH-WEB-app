import type { Schedule, ScheduleProps } from '../entities/schedule.entity';
import type { FindSchedulesFilter } from '@edutech/shared';

export interface CreateScheduleData {
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface IScheduleRepository {
  findById(id: string): Promise<Schedule | null>;
  findByClassId(classId: string): Promise<Schedule[]>;
  findByTeacherId(teacherId: string): Promise<Schedule[]>;
  findAll(filter?: FindSchedulesFilter): Promise<Schedule[]>;
  create(data: CreateScheduleData): Promise<Schedule>;
  update(id: string, updates: Partial<ScheduleProps>): Promise<Schedule>;
  delete(id: string): Promise<boolean>;
  deleteByClassId(classId: string): Promise<number>;
}
