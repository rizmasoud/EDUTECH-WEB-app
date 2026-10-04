import type { ISoftPreference } from './soft-preference.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import { SchedulingDayPolicy } from '../policies/scheduling-day.policy';
import type { PreferenceEvaluationReport } from '@edutech/shared';

export class ThursdayMorningPreference implements ISoftPreference {
  readonly name = 'ThursdayMorningPreference';

  constructor(
    private readonly dayPolicy: SchedulingDayPolicy = new SchedulingDayPolicy(),
    private readonly bonusWeight: number = 10,
  ) {}

  evaluate(slot: TimeSlot, context: SchedulingClassContext): PreferenceEvaluationReport {
    if (this.dayPolicy.isThursdayMorning(slot.dayOfWeek, slot.startTime)) {
      return {
        preferenceName: this.name,
        applied: true,
        scoreContribution: this.bonusWeight,
        reason: 'Preferred Thursday morning time slot matched.',
      };
    }

    return {
      preferenceName: this.name,
      applied: false,
      scoreContribution: 0,
    };
  }
}
