import type { ISoftPreference } from './soft-preference.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import type { PreferenceEvaluationReport } from '@edutech/shared';

export class TeacherPreferredTimePreference implements ISoftPreference {
  readonly name = 'TeacherPreferredTimePreference';

  constructor(private readonly bonusWeight: number = 15) {}

  evaluate(slot: TimeSlot, context: SchedulingClassContext): PreferenceEvaluationReport {
    const preferredSlots = context.teacherPreferredTimeSlots || [];
    if (preferredSlots.length === 0) {
      return {
        preferenceName: this.name,
        applied: false,
        scoreContribution: 0,
      };
    }

    const matchesPreference = preferredSlots.some(
      (p) => p.dayOfWeek === slot.dayOfWeek && slot.overlaps(TimeSlot.fromDto(p)),
    );

    if (matchesPreference) {
      return {
        preferenceName: this.name,
        applied: true,
        scoreContribution: this.bonusWeight,
        reason: `Slot matches teacher ${context.classInfo.teacherId} declared preferred availability time.`,
      };
    }

    return {
      preferenceName: this.name,
      applied: false,
      scoreContribution: 0,
    };
  }
}
