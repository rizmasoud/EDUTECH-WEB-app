import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import { SchedulingDayPolicy } from '../policies/scheduling-day.policy';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class FridayUnavailableConstraint implements IHardConstraint {
  readonly name = 'FridayUnavailable';

  constructor(private readonly dayPolicy: SchedulingDayPolicy = new SchedulingDayPolicy()) {}

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    if (!this.dayPolicy.isDayAllowed(slot.dayOfWeek)) {
      return {
        constraintName: this.name,
        passed: false,
        message: 'Friday is unavailable for class scheduling by default.',
        conflict: {
          code: SchedulingConflictCode.FRIDAY_UNAVAILABLE,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId: context.classInfo.teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: 'Friday is closed/unavailable for regular scheduled classes.',
        },
      };
    }

    return {
      constraintName: this.name,
      passed: true,
    };
  }
}
