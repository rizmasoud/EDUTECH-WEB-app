import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class TeacherSkillConstraint implements IHardConstraint {
  readonly name = 'TeacherSkill';

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    const teacherId = context.classInfo.teacherId;
    if (!teacherId) {
      // If no teacher is assigned, skill constraint is not violated yet (waiting for assignment)
      return {
        constraintName: this.name,
        passed: true,
      };
    }

    const hasSkill = context.teacherSkills.some(
      (ts) => ts.teacherId === teacherId && ts.bookId === context.classInfo.bookId,
    );

    if (!hasSkill) {
      return {
        constraintName: this.name,
        passed: false,
        message: `Teacher ${teacherId} is not qualified to teach Book ${context.classInfo.bookId}.`,
        conflict: {
          code: SchedulingConflictCode.UNQUALIFIED_TEACHER,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Teacher ${teacherId} lacks the required TeacherSkill qualification for Book ${context.classInfo.bookId}.`,
          details: {
            bookId: context.classInfo.bookId,
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
