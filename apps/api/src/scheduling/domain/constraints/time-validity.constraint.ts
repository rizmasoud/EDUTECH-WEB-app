import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class TimeValidityConstraint implements IHardConstraint {
  readonly name = 'TimeValidity';

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    if (!slot.isValid()) {
      return {
        constraintName: this.name,
        passed: false,
        message: 'Start time must be strictly before end time, and day of week must be between 0 and 6.',
        conflict: {
          code: SchedulingConflictCode.INVALID_TIME_RANGE,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId: context.classInfo.teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Invalid time range: ${slot.startTime} to ${slot.endTime}. Start time must precede end time.`,
        },
      };
    }

    return {
      constraintName: this.name,
      passed: true,
    };
  }
}
