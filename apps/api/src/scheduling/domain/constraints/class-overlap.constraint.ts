import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class ClassOverlapConstraint implements IHardConstraint {
  readonly name = 'ClassOverlap';

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    // Check if the class already has an existing overlapping schedule
    const overlapping = context.existingClassSchedules.find((s) => s.slot.overlaps(slot));

    if (overlapping) {
      return {
        constraintName: this.name,
        passed: false,
        message: `Class ${context.classInfo.id} already has a conflicting schedule entry at ${slot.toString()}.`,
        conflict: {
          code: SchedulingConflictCode.CLASS_OVERLAP,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId: context.classInfo.teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Contradictory schedule: class already has another schedule on Day ${slot.dayOfWeek} at ${overlapping.slot.timeRange.toString()}.`,
          details: {
            existingScheduleId: overlapping.id,
            existingSlot: overlapping.slot.toDto(),
          },
        },
      };
    }

    return {
      constraintName: this.name,
      passed: true,
    };
  }
}
