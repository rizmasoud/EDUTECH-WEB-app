import { Injectable, Inject } from '@nestjs/common';
import { eq, asc, and, count } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { importResults } from '../../infrastructure/database/schema/imports.schema';
import { ImportResult } from '../domain/entities/import-result.entity';
import type {
  IImportResultRepository,
  CreateImportResultData,
} from '../domain/repositories/import-result.repository.interface';
import type { ImportResultStatus, FindImportResultsFilter } from '@edutech/shared';

@Injectable()
export class DrizzleImportResultRepository implements IImportResultRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof importResults.$inferSelect): ImportResult {
    return new ImportResult(
      row.id,
      row.importJobId,
      row.rowNumber,
      row.status as ImportResultStatus,
      row.message,
      row.createdAt,
    );
  }

  async createMany(results: CreateImportResultData[]): Promise<ImportResult[]> {
    if (results.length === 0) return [];

    const rows = await this.db
      .insert(importResults)
      .values(
        results.map((r) => ({
          importJobId: r.importJobId,
          rowNumber: r.rowNumber,
          status: r.status,
          message: r.message,
        })),
      )
      .returning();

    return rows.map((r: typeof importResults.$inferSelect) => this.mapRowToEntity(r));
  }

  async findAllByJobId(
    jobId: string,
    filter?: FindImportResultsFilter,
  ): Promise<{ items: ImportResult[]; total: number }> {
    const conditions = [eq(importResults.importJobId, jobId)];

    if (filter?.status) {
      conditions.push(eq(importResults.status, filter.status));
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ val: count() })
      .from(importResults)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(importResults)
      .where(whereClause)
      .orderBy(asc(importResults.rowNumber))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof importResults.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async deleteByJobId(jobId: string): Promise<void> {
    await this.db.delete(importResults).where(eq(importResults.importJobId, jobId));
  }
}
