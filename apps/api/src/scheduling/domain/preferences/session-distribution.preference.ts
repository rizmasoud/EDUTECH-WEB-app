import type { ISoftPreference } from './soft-preference.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import { SchedulingDayPolicy } from '../policies/scheduling-day.policy';
import type { PreferenceEvaluationReport } from '@edutech/shared';

export class SessionDistributionPreference implements ISoftPreference {
  readonly name = 'SessionDistributionPreference';

  constructor(
    private readonly dayPolicy: SchedulingDayPolicy = new SchedulingDayPolicy(),
    private readonly bonusWeight: number = 5,
  ) {}

  evaluate(slot: TimeSlot, context: SchedulingClassContext): PreferenceEvaluationReport {
    const existingSchedules = context.existingClassSchedules || [];
    if (existingSchedules.length === 0) {
      // First slot for this class: prefer standard Odd or Even day
      const pattern = this.dayPolicy.getDayPattern(slot.dayOfWeek);
      if (pattern === 'ODD' || pattern === 'EVEN') {
        return {
          preferenceName: this.name,
          applied: true,
          scoreContribution: this.bonusWeight,
          reason: `Slot belongs to standard ${pattern} day pattern.`,
        };
      }
    } else {
      // Subsequent slot: check if it matches the pattern of already scheduled days for this class
      const firstScheduleDay = existingSchedules[0].slot.dayOfWeek;
      const targetPattern = this.dayPolicy.getDayPattern(firstScheduleDay);
      const slotPattern = this.dayPolicy.getDayPattern(slot.dayOfWeek);

      if (targetPattern === slotPattern && targetPattern !== 'CUSTOM') {
        return {
          preferenceName: this.name,
          applied: true,
          scoreContribution: this.bonusWeight,
          reason: `Slot matches harmonious ${targetPattern} day cluster for this class.`,
        };
      }
    }

    return {
      preferenceName: this.name,
      applied: false,
      scoreContribution: 0,
    };
  }
}
