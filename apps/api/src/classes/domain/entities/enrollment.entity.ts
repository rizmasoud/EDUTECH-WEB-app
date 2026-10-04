import type { EnrollmentStatus } from '@edutech/shared';

export class Enrollment {
  constructor(
    public readonly id: string,
    public readonly classId: string,
    public readonly studentId: string,
    public readonly status: EnrollmentStatus,
    public readonly joinedAt: Date,
    public readonly leftAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  public canTransitionTo(targetStatus: EnrollmentStatus): boolean {
    if (this.status === 'ACTIVE') {
      return targetStatus === 'COMPLETED' || targetStatus === 'WITHDRAWN';
    }
    return false;
  }

  public isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  public isTerminated(): boolean {
    return this.status === 'COMPLETED' || this.status === 'WITHDRAWN';
  }
}
