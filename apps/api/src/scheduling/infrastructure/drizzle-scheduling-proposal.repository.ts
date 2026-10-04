import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql, desc, count, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { schedulingProposals } from '../../infrastructure/database/schema/scheduling.schema';
import {
  SchedulingProposal,
  type SchedulingProposalProps,
} from '../domain/entities/scheduling-proposal.entity';
import type {
  ISchedulingProposalRepository,
  CreateSchedulingProposalData,
} from '../domain/repositories/scheduling-proposal.repository.interface';
import type { FindSchedulingProposalsFilter } from '@edutech/shared';

@Injectable()
export class DrizzleSchedulingProposalRepository
  implements ISchedulingProposalRepository
{
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapToEntity(record: any): SchedulingProposal {
    return new SchedulingProposal({
      id: record.id,
      academicTermId: record.academicTermId ?? null,
      createdBy: record.createdBy ?? null,
      status: record.status,
      data: record.data,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      acceptedAt: record.acceptedAt ?? null,
      rejectedAt: record.rejectedAt ?? null,
    });
  }

  async findById(id: string): Promise<SchedulingProposal | null> {
    const [record] = await this.db
      .select()
      .from(schedulingProposals)
      .where(eq(schedulingProposals.id, id))
      .limit(1);

    if (!record) return null;
    return this.mapToEntity(record);
  }

  async findAll(
    filter?: FindSchedulingProposalsFilter,
  ): Promise<{ items: SchedulingProposal[]; total: number }> {
    const conditions: SQL[] = [];

    if (filter?.academicTermId) {
      conditions.push(
        eq(schedulingProposals.academicTermId, filter.academicTermId),
      );
    }

    if (filter?.status) {
      conditions.push(eq(schedulingProposals.status, filter.status));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(schedulingProposals)
      .where(whereClause);

    const records = await this.db
      .select()
      .from(schedulingProposals)
      .where(whereClause)
      .orderBy(desc(schedulingProposals.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: records.map((r: any) => this.mapToEntity(r)),
      total: Number(totalResult?.count || 0),
    };
  }

  async create(
    data: CreateSchedulingProposalData,
  ): Promise<SchedulingProposal> {
    const [record] = await this.db
      .insert(schedulingProposals)
      .values({
        academicTermId: data.academicTermId ?? null,
        createdBy: data.createdBy ?? null,
        status: data.status ?? 'PENDING_REVIEW',
        data: data.data,
      })
      .returning();

    return this.mapToEntity(record);
  }

  async update(
    id: string,
    updates: Partial<SchedulingProposalProps>,
  ): Promise<SchedulingProposal> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.data !== undefined) updateValues.data = updates.data;
    if (updates.acceptedAt !== undefined)
      updateValues.acceptedAt = updates.acceptedAt;
    if (updates.rejectedAt !== undefined)
      updateValues.rejectedAt = updates.rejectedAt;

    const [record] = await this.db
      .update(schedulingProposals)
      .set(updateValues)
      .where(eq(schedulingProposals.id, id))
      .returning();

    return this.mapToEntity(record);
  }
}
