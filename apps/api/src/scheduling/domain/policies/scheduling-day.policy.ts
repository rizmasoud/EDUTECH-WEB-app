import { DayOfWeek, type DayPattern } from '@edutech/shared';
import { TimeRange } from '../value-objects/time-range.vo';

export interface SchedulingDayPolicyConfig {
  allowFriday?: boolean;
  oddDays?: number[];
  evenDays?: number[];
  thursdayMorningEndHour?: number; // default 12 (12:00 PM)
}

export class SchedulingDayPolicy {
  private readonly allowFriday: boolean;
  private readonly oddDays: number[];
  private readonly evenDays: number[];
  private readonly thursdayMorningEndMinutes: number;

  constructor(config?: SchedulingDayPolicyConfig) {
    this.allowFriday = config?.allowFriday ?? false;
    this.oddDays = config?.oddDays ?? [DayOfWeek.SUNDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY];
    this.evenDays = config?.evenDays ?? [DayOfWeek.SATURDAY, DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY];
    this.thursdayMorningEndMinutes = (config?.thursdayMorningEndHour ?? 12) * 60;
  }

  isDayAllowed(dayOfWeek: number): boolean {
    if (dayOfWeek === DayOfWeek.FRIDAY) {
      return this.allowFriday;
    }
    return dayOfWeek >= 0 && dayOfWeek <= 6;
  }

  isFriday(dayOfWeek: number): boolean {
    return dayOfWeek === DayOfWeek.FRIDAY;
  }

  getDayPattern(dayOfWeek: number): DayPattern {
    if (this.oddDays.includes(dayOfWeek)) {
      return 'ODD';
    }
    if (this.evenDays.includes(dayOfWeek)) {
      return 'EVEN';
    }
    return 'CUSTOM';
  }

  getDaysForPattern(pattern: DayPattern): number[] {
    if (pattern === 'ODD') return [...this.oddDays];
    if (pattern === 'EVEN') return [...this.evenDays];
    return [0, 1, 2, 3, 4, 6];
  }

  isThursdayMorning(dayOfWeek: number, startTime: string): boolean {
    if (dayOfWeek !== DayOfWeek.THURSDAY) {
      return false;
    }
    const startMinutes = TimeRange.parseToMinutes(startTime);
    return startMinutes < this.thursdayMorningEndMinutes;
  }

  getAllowedDays(): number[] {
    const days: number[] = [
      DayOfWeek.SATURDAY,
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
    ];
    if (this.allowFriday) {
      days.push(DayOfWeek.FRIDAY);
    }
    return days;
  }
}
