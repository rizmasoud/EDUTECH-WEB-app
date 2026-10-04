import type { AcademicTermStatus } from '@edutech/shared';

export class AcademicTerm {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly status: AcademicTermStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static validateDates(startDate: string, endDate: string): void {
    if (new Date(startDate) >= new Date(endDate)) {
      throw new Error('startDate must be before endDate');
    }
  }

  canTransitionTo(targetStatus: AcademicTermStatus): boolean {
    if (this.status === 'PLANNED' && targetStatus === 'ACTIVE') return true;
    if (this.status === 'ACTIVE' && targetStatus === 'CLOSED') return true;
    return false;
  }

  canBeModified(): boolean {
    return this.status !== 'CLOSED';
  }
}
