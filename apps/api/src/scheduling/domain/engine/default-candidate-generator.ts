import type { ICandidateGenerator } from './candidate-generator.interface';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type { SchedulingClassContext } from './scheduling-context.interface';
import { SchedulingDayPolicy } from '../policies/scheduling-day.policy';

export interface CandidateGeneratorConfig {
  dayPolicy?: SchedulingDayPolicy;
  timeSlotGrid?: Array<{ startTime: string; endTime: string }>;
}

export class DefaultCandidateGenerator implements ICandidateGenerator {
  private readonly dayPolicy: SchedulingDayPolicy;
  private readonly timeSlotGrid: Array<{ startTime: string; endTime: string }>;

  constructor(config?: CandidateGeneratorConfig) {
    this.dayPolicy = config?.dayPolicy ?? new SchedulingDayPolicy();
    this.timeSlotGrid = config?.timeSlotGrid ?? [
      { startTime: '08:00', endTime: '09:30' },
      { startTime: '09:45', endTime: '11:15' },
      { startTime: '11:30', endTime: '13:00' },
      { startTime: '14:00', endTime: '15:30' },
      { startTime: '15:45', endTime: '17:15' },
      { startTime: '17:30', endTime: '19:00' },
      { startTime: '19:15', endTime: '20:45' },
    ];
  }

  generateCandidates(_context: SchedulingClassContext): TimeSlot[] {
    const allowedDays = this.dayPolicy.getAllowedDays();
    const candidates: TimeSlot[] = [];

    for (const day of allowedDays) {
      for (const slot of this.timeSlotGrid) {
        candidates.push(new TimeSlot(day, slot.startTime, slot.endTime));
      }
    }

    return candidates;
  }
}
