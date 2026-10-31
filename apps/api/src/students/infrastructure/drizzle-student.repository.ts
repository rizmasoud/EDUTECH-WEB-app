import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, and, ilike, count, or, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { students } from '../../infrastructure/database/schema/students.schema';
import { enrollments, classes } from '../../infrastructure/database/schema/classes.schema';
import { Student } from '../domain/entities/student.entity';
import type {
  IStudentRepository,
  CreateStudentData,
  UpdateStudentData,
  StudentScope,
} from '../domain/repositories/student.repository.interface';
import type { FindStudentsFilter } from '@edutech/shared';

@Injectable()
export class DrizzleStudentRepository implements IStudentRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof students.$inferSelect): Student {
    return new Student(
      row.id,
      row.firstName,
      row.lastName,
      row.shahvarCode ?? null,
      row.isActive,
      row.createdAt,
      row.updatedAt,
    );
  }

  async findById(id: string): Promise<Student | null> {
    const [row] = await this.db
      .select()
      .from(students)
      .where(eq(students.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  /** Ids of students with an ACTIVE enrollment in a class taught by the given teacher. */
  private activeStudentIdsOfTeacher(teacherId: string) {
    return this.db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .where(and(eq(classes.teacherId, teacherId), eq(enrollments.status, 'ACTIVE')));
  }

  async isActivelyEnrolledWithTeacher(studentId: string, teacherId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(classes.teacherId, teacherId),
          eq(enrollments.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findAll(
    filter?: FindStudentsFilter,
    scope?: StudentScope,
  ): Promise<{ items: Student[]; total: number }> {
    const conditions: SQL[] = [];

    if (scope) {
      conditions.push(inArray(students.id, this.activeStudentIdsOfTeacher(scope.teacherId)));
    }

    if (filter?.isActive !== undefined) {
      conditions.push(eq(students.isActive, filter.isActive));
    }
    if (filter?.search) {
      const searchPattern = `%${filter.search}%`;
      const searchCondition = or(
        ilike(students.firstName, searchPattern),
        ilike(students.lastName, searchPattern),
        ilike(students.shahvarCode, searchPattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(students)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(students)
      .where(whereClause)
      .orderBy(desc(students.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof students.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async create(data: CreateStudentData): Promise<Student> {
    const [row] = await this.db
      .insert(students)
      .values({
        firstName: data.firstName,
        lastName: data.lastName,
        shahvarCode: data.shahvarCode ?? null,
        isActive: data.isActive ?? true,
      })
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: UpdateStudentData): Promise<Student> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.firstName !== undefined) {
      updateValues.firstName = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      updateValues.lastName = updates.lastName;
    }
    if (updates.shahvarCode !== undefined) {
      updateValues.shahvarCode = updates.shahvarCode;
    }
    if (updates.isActive !== undefined) {
      updateValues.isActive = updates.isActive;
    }

    const [row] = await this.db
      .update(students)
      .set(updateValues)
      .where(eq(students.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }
}
