import type { AcademicTerm } from '../entities/academic-term.entity';
import type { AcademicTermStatus } from '@edutech/shared';

export interface FindTermsFilter {
  status?: AcademicTermStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface IAcademicTermRepository {
  findById(id: string): Promise<AcademicTerm | null>;
  findAll(filter?: FindTermsFilter): Promise<{ items: AcademicTerm[]; total: number }>;
  create(term: {
    name: string;
    startDate: string;
    endDate: string;
    status: AcademicTermStatus;
  }): Promise<AcademicTerm>;
  update(
    id: string,
    updates: Partial<{
      name: string;
      startDate: string;
      endDate: string;
      status: AcademicTermStatus;
    }>,
  ): Promise<AcademicTerm>;
  findConflictingActiveTerm(excludeId?: string): Promise<AcademicTerm | null>;
}
