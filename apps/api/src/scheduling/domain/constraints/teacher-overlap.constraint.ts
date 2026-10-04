import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class TeacherOverlapConstraint implements IHardConstraint {
  readonly name = 'TeacherOverlap';

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    const teacherId = context.classInfo.teacherId;
    if (!teacherId) {
      // If no teacher is assigned yet (e.g. draft class proposal), teacher overlap is not violated
      return {
        constraintName: this.name,
        passed: true,
      };
    }

    const overlappingSchedule = context.existingTeacherSchedules.find(
      (s) => s.classId !== context.classInfo.id && s.slot.overlaps(slot),
    );

    if (overlappingSchedule) {
      return {
        constraintName: this.name,
        passed: false,
        message: `Teacher ${teacherId} already has an overlapping teaching schedule in class ${overlappingSchedule.classId}.`,
        conflict: {
          code: SchedulingConflictCode.TEACHER_OVERLAP,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Teacher ${teacherId} has an overlapping schedule with class ${overlappingSchedule.classId} at ${slot.toString()}.`,
          details: {
            conflictingClassId: overlappingSchedule.classId,
            conflictingSlot: overlappingSchedule.slot.toDto(),
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
