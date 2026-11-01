import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, and, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { enrollments, classes } from '../../infrastructure/database/schema/classes.schema';
import { academicTerms } from '../../infrastructure/database/schema/academics.schema';
import { currentTeachingCondition } from './teacher-current-scope';
import { Enrollment } from '../domain/entities/enrollment.entity';
import type {
  IEnrollmentRepository,
  CreateEnrollmentData,
} from '../domain/repositories/enrollment.repository.interface';
import type { EnrollmentStatus, FindEnrollmentsFilter } from '@edutech/shared';

@Injectable()
export class DrizzleEnrollmentRepository implements IEnrollmentRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof enrollments.$inferSelect): Enrollment {
    return new Enrollment(
      row.id,
      row.classId,
      row.studentId,
      row.status as EnrollmentStatus,
      row.joinedAt,
      row.leftAt,
      row.createdAt,
      row.updatedAt,
    );
  }

  async findById(id: string): Promise<Enrollment | null> {
    const [row] = await this.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findByClassAndStudent(classId: string, studentId: string): Promise<Enrollment | null> {
    const [row] = await this.db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findAllByClass(
    classId: string,
    filter?: FindEnrollmentsFilter,
  ): Promise<{ items: Enrollment[]; total: number }> {
    const conditions: SQL[] = [eq(enrollments.classId, classId)];

    if (filter?.status) {
      conditions.push(eq(enrollments.status, filter.status));
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ val: count() })
      .from(enrollments)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(enrollments)
      .where(whereClause)
      .orderBy(desc(enrollments.joinedAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof enrollments.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  /** A teacher's roster for one of their classes: only while the class is current (see currentTeachingCondition). */
  async findCurrentByClassAndTeacher(
    classId: string,
    teacherId: string,
    filter?: FindEnrollmentsFilter,
  ): Promise<{ items: Enrollment[]; total: number }> {
    const whereClause = and(eq(enrollments.classId, classId), currentTeachingCondition(teacherId));
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(academicTerms, eq(classes.academicTermId, academicTerms.id))
      .where(whereClause);

    const rows = await this.db
      .select({ enrollment: enrollments })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(academicTerms, eq(classes.academicTermId, academicTerms.id))
      .where(whereClause)
      .orderBy(desc(enrollments.joinedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((r: { enrollment: typeof enrollments.$inferSelect }) =>
        this.mapRowToEntity(r.enrollment),
      ),
      total: Number(countResult?.val || 0),
    };
  }

  async findCurrentByIdAndTeacher(id: string, teacherId: string): Promise<Enrollment | null> {
    const [row] = await this.db
      .select({ enrollment: enrollments })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(academicTerms, eq(classes.academicTermId, academicTerms.id))
      .where(and(eq(enrollments.id, id), currentTeachingCondition(teacherId)))
      .limit(1);

    return row ? this.mapRowToEntity(row.enrollment) : null;
  }

  async findCurrentByStudentAndTeacher(studentId: string, teacherId: string): Promise<Enrollment[]> {
    const rows = await this.db
      .select({ enrollment: enrollments })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(academicTerms, eq(classes.academicTermId, academicTerms.id))
      .where(and(eq(enrollments.studentId, studentId), currentTeachingCondition(teacherId)))
      .orderBy(desc(enrollments.joinedAt));

    return rows.map((r: { enrollment: typeof enrollments.$inferSelect }) =>
      this.mapRowToEntity(r.enrollment),
    );
  }

  async findAllByStudent(studentId: string): Promise<Enrollment[]> {
    const rows = await this.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentId, studentId))
      .orderBy(desc(enrollments.joinedAt));

    return rows.map((r: typeof enrollments.$inferSelect) => this.mapRowToEntity(r));
  }

  async createWithCapacityCheck(
    data: CreateEnrollmentData,
    maxCapacity: number,
  ): Promise<Enrollment> {
    return await this.db.transaction(async (tx: any) => {
      const [activeCountRes] = await tx
        .select({ val: count() })
        .from(enrollments)
        .where(and(eq(enrollments.classId, data.classId), eq(enrollments.status, 'ACTIVE')));

      const currentActiveCount = Number(activeCountRes?.val || 0);
      if (currentActiveCount >= maxCapacity) {
        throw new Error('CAPACITY_EXCEEDED');
      }

      const [row] = await tx
        .insert(enrollments)
        .values({
          classId: data.classId,
          studentId: data.studentId,
          status: data.status,
        })
        .returning();

      return this.mapRowToEntity(row);
    });
  }

  async updateStatus(
    id: string,
    status: EnrollmentStatus,
    leftAt?: Date | null,
  ): Promise<Enrollment> {
    const updateValues: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };

    if (leftAt !== undefined) {
      updateValues.leftAt = leftAt;
    }

    const [row] = await this.db
      .update(enrollments)
      .set(updateValues)
      .where(eq(enrollments.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }

  async countActiveByClass(classId: string): Promise<number> {
    const [res] = await this.db
      .select({ val: count() })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'ACTIVE')));

    return Number(res?.val || 0);
  }
}
