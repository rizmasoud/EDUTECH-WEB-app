import type { ClassStatus, ClassType } from '@edutech/shared';

export class Class {
  public static readonly DEFAULT_CAPACITY = 12;
  public static readonly MAX_CAPACITY = 15;
  public static readonly MIN_CAPACITY = 1;

  constructor(
    public readonly id: string,
    public readonly academicTermId: string,
    public readonly bookId: string,
    public readonly bookSegmentId: string | null,
    public readonly teacherId: string | null,
    public readonly classType: ClassType,
    public readonly status: ClassStatus,
    public readonly capacity: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  public static validateCapacity(capacity: number): void {
    if (!Number.isInteger(capacity)) {
      throw new Error('Class capacity must be an integer');
    }
    if (capacity < Class.MIN_CAPACITY || capacity > Class.MAX_CAPACITY) {
      throw new Error(
        `Class capacity must be between ${Class.MIN_CAPACITY} and ${Class.MAX_CAPACITY}`,
      );
    }
  }

  public canTransitionTo(targetStatus: ClassStatus): boolean {
    if (this.status === 'DRAFT') {
      return targetStatus === 'ACTIVE' || targetStatus === 'CANCELLED';
    }
    if (this.status === 'ACTIVE') {
      return targetStatus === 'COMPLETED' || targetStatus === 'CANCELLED';
    }
    return false;
  }

  public canBeModified(): boolean {
    return this.status === 'DRAFT' || this.status === 'ACTIVE';
  }

  public isDraft(): boolean {
    return this.status === 'DRAFT';
  }

  public isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  public isTerminal(): boolean {
    return this.status === 'COMPLETED' || this.status === 'CANCELLED';
  }
}
