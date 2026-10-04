export interface CapacityPolicyConfig {
  minCapacity?: number;
  targetCapacity?: number;
  maxCapacity?: number;
}

export class SchedulingCapacityPolicy {
  readonly minCapacity: number;
  readonly targetCapacity: number;
  readonly maxCapacity: number;

  constructor(config?: CapacityPolicyConfig) {
    this.minCapacity = config?.minCapacity ?? 1;
    this.targetCapacity = config?.targetCapacity ?? 12;
    this.maxCapacity = config?.maxCapacity ?? 15;
  }

  isCapacityValid(capacity: number): boolean {
    return (
      Number.isInteger(capacity) &&
      capacity >= this.minCapacity &&
      capacity <= this.maxCapacity
    );
  }

  isOverCapacity(enrolledCount: number, capacity: number): boolean {
    return enrolledCount > capacity;
  }
}
