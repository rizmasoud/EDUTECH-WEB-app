import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { importJobs, importResults } from '../../infrastructure/database/schema/imports.schema';
import { ImportJob } from '../domain/entities/import-job.entity';
import type {
  IImportJobRepository,
  CreateImportJobData,
  UpdateImportJobData,
} from '../domain/repositories/import-job.repository.interface';
import type { ImportStatus, FindImportJobsFilter } from '@edutech/shared';

@Injectable()
export class DrizzleImportJobRepository implements IImportJobRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof importJobs.$inferSelect): ImportJob {
    return new ImportJob(
      row.id,
      row.type,
      row.status as ImportStatus,
      row.fileName,
      row.createdBy,
      row.startedAt,
      row.completedAt,
      row.createdAt,
    );
  }

  async findById(id: string): Promise<ImportJob | null> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: FindImportJobsFilter): Promise<{ items: ImportJob[]; total: number }> {
    const conditions: any[] = [];

    if (filter?.type) {
      conditions.push(eq(importJobs.type, filter.type));
    }
    if (filter?.status) {
      conditions.push(eq(importJobs.status, filter.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(importJobs)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(importJobs)
      .where(whereClause)
      .orderBy(desc(importJobs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof importJobs.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async create(data: CreateImportJobData): Promise<ImportJob> {
    const [row] = await this.db
      .insert(importJobs)
      .values({
        type: data.type,
        fileName: data.fileName,
        createdBy: data.createdBy,
        status: data.status ?? 'PENDING',
      })
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: UpdateImportJobData): Promise<ImportJob> {
    const updateValues: Record<string, any> = {};

    if (updates.status !== undefined) {
      updateValues.status = updates.status;
    }
    if (updates.startedAt !== undefined) {
      updateValues.startedAt = updates.startedAt;
    }
    if (updates.completedAt !== undefined) {
      updateValues.completedAt = updates.completedAt;
    }

    const [row] = await this.db
      .update(importJobs)
      .set(updateValues)
      .where(eq(importJobs.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }

  async getResultsCount(jobId: string): Promise<{
    total: number;
    success: number;
    warning: number;
    error: number;
    skipped: number;
  }> {
    const rows = await this.db
      .select({
        status: importResults.status,
        count: count(),
      })
      .from(importResults)
      .where(eq(importResults.importJobId, jobId))
      .groupBy(importResults.status);

    const counts = {
      total: 0,
      success: 0,
      warning: 0,
      error: 0,
      skipped: 0,
    };

    for (const r of rows) {
      const c = Number(r.count || 0);
      counts.total += c;
      if (r.status === 'SUCCESS') counts.success += c;
      else if (r.status === 'WARNING') counts.warning += c;
      else if (r.status === 'ERROR') counts.error += c;
      else if (r.status === 'SKIPPED') counts.skipped += c;
    }

    return counts;
  }
}
