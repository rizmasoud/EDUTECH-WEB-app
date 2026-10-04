import type {
  SchedulingProposal,
  SchedulingProposalProps,
} from '../entities/scheduling-proposal.entity';
import type {
  FindSchedulingProposalsFilter,
  SchedulingProposalStatus,
  SchedulingProposalDataDto,
} from '@edutech/shared';

export interface CreateSchedulingProposalData {
  academicTermId?: string | null;
  createdBy?: string | null;
  status?: SchedulingProposalStatus;
  data: SchedulingProposalDataDto;
}

export interface ISchedulingProposalRepository {
  findById(id: string): Promise<SchedulingProposal | null>;
  findAll(
    filter?: FindSchedulingProposalsFilter,
  ): Promise<{ items: SchedulingProposal[]; total: number }>;
  create(data: CreateSchedulingProposalData): Promise<SchedulingProposal>;
  update(
    id: string,
    updates: Partial<SchedulingProposalProps>,
  ): Promise<SchedulingProposal>;
}
