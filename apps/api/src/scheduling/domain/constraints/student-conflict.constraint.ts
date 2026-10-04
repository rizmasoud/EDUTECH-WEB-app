import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class StudentConflictConstraint implements IHardConstraint {
  readonly name = 'StudentConflict';

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    const enrolledStudentIds = context.classInfo.enrolledStudentIds || [];

    for (const studentId of enrolledStudentIds) {
      const studentOtherSchedules = context.existingStudentSchedules.get(studentId) || [];
      const conflictingSchedule = studentOtherSchedules.find(
        (s) => s.classId !== context.classInfo.id && s.slot.overlaps(slot),
      );

      if (conflictingSchedule) {
        return {
          constraintName: this.name,
          passed: false,
          message: `Student ${studentId} is already enrolled in class ${conflictingSchedule.classId} with an overlapping schedule at ${slot.toString()}.`,
          conflict: {
            code: SchedulingConflictCode.STUDENT_CONFLICT,
            severity: ConflictSeverity.HARD_CONSTRAINT,
            classId: context.classInfo.id,
            studentId,
            teacherId: context.classInfo.teacherId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            message: `Student ${studentId} has a schedule overlap with another enrolled class (${conflictingSchedule.classId}) at ${slot.toString()}.`,
            details: {
              conflictingClassId: conflictingSchedule.classId,
              conflictingScheduleId: conflictingSchedule.id,
              conflictingSlot: conflictingSchedule.slot.toDto(),
            },
          },
        };
      }
    }

    return {
      constraintName: this.name,
      passed: true,
    };
  }
}
