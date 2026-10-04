import type { ImportResultStatus } from '@edutech/shared';

export class ImportResult {
  constructor(
    public readonly id: string,
    public readonly importJobId: string,
    public readonly rowNumber: number,
    public readonly status: ImportResultStatus,
    public readonly message: string,
    public readonly createdAt: Date,
  ) {}

  public isError(): boolean {
    return this.status === 'ERROR';
  }

  public isWarning(): boolean {
    return this.status === 'WARNING';
  }

  public isSuccess(): boolean {
    return this.status === 'SUCCESS';
  }

  public isSkipped(): boolean {
    return this.status === 'SKIPPED';
  }
}
