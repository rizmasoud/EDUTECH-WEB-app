import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from './scheduling-context.interface';

export interface ICandidateGenerator {
  generateCandidates(context: SchedulingClassContext): TimeSlot[];
}
