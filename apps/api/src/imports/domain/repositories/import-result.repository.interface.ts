import type { ImportResult } from '../entities/import-result.entity';
import type { ImportResultStatus, FindImportResultsFilter } from '@edutech/shared';

export interface CreateImportResultData {
  importJobId: string;
  rowNumber: number;
  status: ImportResultStatus;
  message: string;
}

export interface IImportResultRepository {
  createMany(results: CreateImportResultData[]): Promise<ImportResult[]>;
  findAllByJobId(
    jobId: string,
    filter?: FindImportResultsFilter,
  ): Promise<{ items: ImportResult[]; total: number }>;
  deleteByJobId(jobId: string): Promise<void>;
}
