import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from '../engine/scheduling-context.interface';
import type { PreferenceEvaluationReport } from '@edutech/shared';

export interface ISoftPreference {
  readonly name: string;
  evaluate(slot: TimeSlot, context: SchedulingClassContext): PreferenceEvaluationReport;
}
