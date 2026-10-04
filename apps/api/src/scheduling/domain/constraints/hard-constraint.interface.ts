import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import type { ConstraintEvaluationReport } from '@edutech/shared';

export interface IHardConstraint {
  readonly name: string;
  evaluate(slot: TimeSlot, context: SchedulingClassContext): ConstraintEvaluationReport;
}
