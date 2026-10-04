import type { ImportJob } from '../entities/import-job.entity';
import type { ImportStatus, FindImportJobsFilter } from '@edutech/shared';

export interface CreateImportJobData {
  type: string;
  fileName: string;
  createdBy: string;
  status?: ImportStatus;
}

export interface UpdateImportJobData {
  status?: ImportStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface IImportJobRepository {
  findById(id: string): Promise<ImportJob | null>;
  findAll(filter?: FindImportJobsFilter): Promise<{ items: ImportJob[]; total: number }>;
  create(data: CreateImportJobData): Promise<ImportJob>;
  update(id: string, updates: UpdateImportJobData): Promise<ImportJob>;
  getResultsCount(jobId: string): Promise<{
    total: number;
    success: number;
    warning: number;
    error: number;
    skipped: number;
  }>;
}
