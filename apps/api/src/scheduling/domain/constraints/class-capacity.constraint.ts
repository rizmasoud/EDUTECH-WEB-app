import type { IHardConstraint } from './hard-constraint.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import { SchedulingCapacityPolicy } from '../policies/scheduling-capacity.policy';
import {
  SchedulingConflictCode,
  ConflictSeverity,
  type ConstraintEvaluationReport,
} from '@edutech/shared';

export class ClassCapacityConstraint implements IHardConstraint {
  readonly name = 'ClassCapacity';

  constructor(
    private readonly capacityPolicy: SchedulingCapacityPolicy = new SchedulingCapacityPolicy(),
  ) {}

  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport {
    const capacity = context.classInfo.capacity;
    if (!this.capacityPolicy.isCapacityValid(capacity)) {
      return {
        constraintName: this.name,
        passed: false,
        message: `Class capacity (${capacity}) is invalid. It must be between ${this.capacityPolicy.minCapacity} and ${this.capacityPolicy.maxCapacity}.`,
        conflict: {
          code: SchedulingConflictCode.CAPACITY_VIOLATION,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId: context.classInfo.teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Capacity ${capacity} violates policy bounds [${this.capacityPolicy.minCapacity}..${this.capacityPolicy.maxCapacity}].`,
          details: { capacity },
        },
      };
    }

    const enrolledCount = context.classInfo.enrolledStudentIds?.length ?? 0;
    if (this.capacityPolicy.isOverCapacity(enrolledCount, capacity)) {
      return {
        constraintName: this.name,
        passed: false,
        message: `Class has ${enrolledCount} enrolled students, exceeding capacity ${capacity}.`,
        conflict: {
          code: SchedulingConflictCode.CAPACITY_VIOLATION,
          severity: ConflictSeverity.HARD_CONSTRAINT,
          classId: context.classInfo.id,
          teacherId: context.classInfo.teacherId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          message: `Enrolled student count (${enrolledCount}) exceeds class capacity limit (${capacity}).`,
          details: { enrolledCount, capacity },
        },
      };
    }

    return {
      constraintName: this.name,
      passed: true,
    };
  }
}
