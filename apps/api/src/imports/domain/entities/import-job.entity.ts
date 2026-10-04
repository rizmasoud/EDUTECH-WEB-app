import type { ImportStatus } from '@edutech/shared';

export class ImportJob {
  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly status: ImportStatus,
    public readonly fileName: string,
    public readonly createdBy: string,
    public readonly startedAt: Date | null,
    public readonly completedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  public canTransitionTo(targetStatus: ImportStatus): boolean {
    if (this.status === 'PENDING') {
      return (
        targetStatus === 'PROCESSING' ||
        targetStatus === 'CANCELLED' ||
        targetStatus === 'FAILED'
      );
    }
    if (this.status === 'PROCESSING') {
      return (
        targetStatus === 'COMPLETED' ||
        targetStatus === 'COMPLETED_WITH_ERRORS' ||
        targetStatus === 'FAILED' ||
        targetStatus === 'CANCELLED'
      );
    }
    return false;
  }

  public isPending(): boolean {
    return this.status === 'PENDING';
  }

  public isProcessing(): boolean {
    return this.status === 'PROCESSING';
  }

  public isTerminal(): boolean {
    return (
      this.status === 'COMPLETED' ||
      this.status === 'COMPLETED_WITH_ERRORS' ||
      this.status === 'FAILED' ||
      this.status === 'CANCELLED'
    );
  }
}
