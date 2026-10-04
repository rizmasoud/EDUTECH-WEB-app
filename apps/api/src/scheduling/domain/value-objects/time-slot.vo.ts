import { TimeRange } from './time-range.vo';
import type { TimeSlotDto } from '@edutech/shared';

export class TimeSlot {
  readonly timeRange: TimeRange;

  constructor(
    readonly dayOfWeek: number,
    startTime: string,
    endTime: string,
  ) {
    this.timeRange = new TimeRange(startTime, endTime);
  }

  get startTime(): string {
    return this.timeRange.startTime;
  }

  get endTime(): string {
    return this.timeRange.endTime;
  }

  isValid(): boolean {
    return this.dayOfWeek >= 0 && this.dayOfWeek <= 6 && this.timeRange.isValid();
  }

  overlaps(other: TimeSlot): boolean {
    return this.dayOfWeek === other.dayOfWeek && this.timeRange.overlaps(other.timeRange);
  }

  toDto(): TimeSlotDto {
    return {
      dayOfWeek: this.dayOfWeek,
      startTime: this.startTime,
      endTime: this.endTime,
    };
  }

  static fromDto(dto: TimeSlotDto): TimeSlot {
    return new TimeSlot(dto.dayOfWeek, dto.startTime, dto.endTime);
  }

  toString(): string {
    return `Day ${this.dayOfWeek} (${this.timeRange.toString()})`;
  }
}
