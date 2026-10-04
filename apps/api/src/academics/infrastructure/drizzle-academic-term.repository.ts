import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, asc, ilike, and, sql, count } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { academicTerms } from '../../infrastructure/database/schema/academics.schema';
import { AcademicTerm } from '../domain/entities/academic-term.entity';
import type {
  IAcademicTermRepository,
  FindTermsFilter,
} from '../domain/repositories/academic-term.repository.interface';
import type { AcademicTermStatus } from '@edutech/shared';

@Injectable()
export class DrizzleAcademicTermRepository implements IAcademicTermRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof academicTerms.$inferSelect): AcademicTerm {
    return new AcademicTerm(
      row.id,
      row.name,
      row.startDate,
      row.endDate,
      row.status as AcademicTermStatus,
      row.createdAt,
      row.updatedAt,
    );
  }

  async findById(id: string): Promise<AcademicTerm | null> {
    const [row] = await this.db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: FindTermsFilter): Promise<{ items: AcademicTerm[]; total: number }> {
    const conditions: any[] = [];

    if (filter?.status) {
      conditions.push(eq(academicTerms.status, filter.status));
    }
    if (filter?.search) {
      conditions.push(ilike(academicTerms.name, `%${filter.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const [countResult] = await this.db
      .select({ val: count() })
      .from(academicTerms)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(academicTerms)
      .where(whereClause)
      .orderBy(desc(academicTerms.startDate))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof academicTerms.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async create(data: {
    name: string;
    startDate: string;
    endDate: string;
    status: AcademicTermStatus;
  }): Promise<AcademicTerm> {
    const [row] = await this.db
      .insert(academicTerms)
      .values({
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
      })
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(
    id: string,
    updates: Partial<{
      name: string;
      startDate: string;
      endDate: string;
      status: AcademicTermStatus;
    }>,
  ): Promise<AcademicTerm> {
    const values: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) values.name = updates.name;
    if (updates.startDate !== undefined) values.startDate = updates.startDate;
    if (updates.endDate !== undefined) values.endDate = updates.endDate;
    if (updates.status !== undefined) values.status = updates.status;

    const [row] = await this.db
      .update(academicTerms)
      .set(values)
      .where(eq(academicTerms.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }

  async findConflictingActiveTerm(excludeId?: string): Promise<AcademicTerm | null> {
    const conditions = [eq(academicTerms.status, 'ACTIVE')];
    if (excludeId) {
      conditions.push(sql`${academicTerms.id} != ${excludeId}`);
    }

    const [row] = await this.db
      .select()
      .from(academicTerms)
      .where(and(...conditions))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }
}
