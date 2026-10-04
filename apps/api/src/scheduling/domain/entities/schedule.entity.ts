import { TimeSlot } from '../value-objects/time-slot.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import type { ScheduleDto } from '@edutech/shared';

export interface ScheduleProps {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function normalizeTime(t: string): string {
  if (!t) return t;
  const parts = t.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return t;
}

export class Schedule {
  readonly id: string;
  readonly classId: string;
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ScheduleProps) {
    this.id = props.id;
    this.classId = props.classId;
    this.dayOfWeek = props.dayOfWeek;
    this.startTime = normalizeTime(props.startTime);
    this.endTime = normalizeTime(props.endTime);
    this.startsOn = props.startsOn ?? null;
    this.endsOn = props.endsOn ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  getTimeSlot(): TimeSlot {
    return new TimeSlot(this.dayOfWeek, this.startTime, this.endTime);
  }

  getTimeRange(): TimeRange {
    return new TimeRange(this.startTime, this.endTime);
  }

  isValid(): boolean {
    return this.getTimeSlot().isValid();
  }

  overlaps(other: Schedule): boolean {
    return this.getTimeSlot().overlaps(other.getTimeSlot());
  }

  toDto(): ScheduleDto {
    return {
      id: this.id,
      classId: this.classId,
      dayOfWeek: this.dayOfWeek,
      startTime: this.startTime,
      endTime: this.endTime,
      startsOn: this.startsOn,
      endsOn: this.endsOn,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
