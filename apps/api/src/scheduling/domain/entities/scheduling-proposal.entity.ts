import type {
  SchedulingProposalStatus,
  SchedulingProposalDataDto,
  SchedulingProposalDto,
} from '@edutech/shared';

export interface SchedulingProposalProps {
  id: string;
  academicTermId?: string | null;
  createdBy?: string | null;
  status?: SchedulingProposalStatus;
  data: SchedulingProposalDataDto;
  createdAt?: Date;
  updatedAt?: Date;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
}

export class SchedulingProposal {
  readonly id: string;
  readonly academicTermId: string | null;
  readonly createdBy: string | null;
  private _status: SchedulingProposalStatus;
  private _data: SchedulingProposalDataDto;
  readonly createdAt: Date;
  private _updatedAt: Date;
  private _acceptedAt: Date | null;
  private _rejectedAt: Date | null;

  constructor(props: SchedulingProposalProps) {
    this.id = props.id;
    this.academicTermId = props.academicTermId ?? null;
    this.createdBy = props.createdBy ?? null;
    this._status = props.status ?? 'PENDING_REVIEW';
    this._data = props.data;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._acceptedAt = props.acceptedAt ?? null;
    this._rejectedAt = props.rejectedAt ?? null;
  }

  get status(): SchedulingProposalStatus {
    return this._status;
  }

  get data(): SchedulingProposalDataDto {
    return this._data;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get acceptedAt(): Date | null {
    return this._acceptedAt;
  }

  get rejectedAt(): Date | null {
    return this._rejectedAt;
  }

  isPending(): boolean {
    return this._status === 'PENDING_REVIEW' || this._status === 'DRAFT';
  }

  isTerminal(): boolean {
    return this._status === 'ACCEPTED' || this._status === 'REJECTED';
  }

  canBeAccepted(): boolean {
    return this._status === 'PENDING_REVIEW' || this._status === 'MODIFIED';
  }

  canBeModified(): boolean {
    return this._status === 'PENDING_REVIEW' || this._status === 'DRAFT' || this._status === 'MODIFIED';
  }

  accept(): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot accept proposal in terminal status: ${this._status}`);
    }
    this._status = 'ACCEPTED';
    this._acceptedAt = new Date();
    this._updatedAt = new Date();
  }

  reject(): void {
    if (this.isTerminal()) {
      throw new Error(`Cannot reject proposal in terminal status: ${this._status}`);
    }
    this._status = 'REJECTED';
    this._rejectedAt = new Date();
    this._updatedAt = new Date();
  }

  modify(newData: SchedulingProposalDataDto): void {
    if (!this.canBeModified()) {
      throw new Error(`Cannot modify proposal in status: ${this._status}`);
    }
    this._data = newData;
    this._status = 'MODIFIED';
    this._updatedAt = new Date();
  }

  toDto(): SchedulingProposalDto {
    return {
      id: this.id,
      academicTermId: this.academicTermId,
      createdBy: this.createdBy,
      status: this._status,
      data: this._data,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      acceptedAt: this._acceptedAt,
      rejectedAt: this._rejectedAt,
    };
  }
}
