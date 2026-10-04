import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, and, count, not } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { classes, enrollments } from '../../infrastructure/database/schema/classes.schema';
import { academicTerms, books, bookParts, bookSegments } from '../../infrastructure/database/schema/academics.schema';
import { teachers, teacherSkills } from '../../infrastructure/database/schema/teachers.schema';
import { students } from '../../infrastructure/database/schema/students.schema';
import { Class } from '../domain/entities/class.entity';
import type {
  IClassRepository,
  CreateClassData,
  UpdateClassData,
} from '../domain/repositories/class.repository.interface';
import type { ClassStatus, ClassType, FindClassesFilter } from '@edutech/shared';

@Injectable()
export class DrizzleClassRepository implements IClassRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof classes.$inferSelect): Class {
    return new Class(
      row.id,
      row.academicTermId,
      row.bookId,
      row.bookSegmentId ?? null,
      row.teacherId ?? null,
      row.classType as ClassType,
      row.status as ClassStatus,
      row.capacity,
      row.createdAt,
      row.updatedAt,
    );
  }

  async findById(id: string): Promise<Class | null> {
    const [row] = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: FindClassesFilter): Promise<{ items: Class[]; total: number }> {
    const conditions: any[] = [];

    if (filter?.academicTermId) {
      conditions.push(eq(classes.academicTermId, filter.academicTermId));
    }
    if (filter?.bookId) {
      conditions.push(eq(classes.bookId, filter.bookId));
    }
    if (filter?.teacherId) {
      conditions.push(eq(classes.teacherId, filter.teacherId));
    }
    if (filter?.status) {
      conditions.push(eq(classes.status, filter.status));
    }
    if (filter?.classType) {
      conditions.push(eq(classes.classType, filter.classType));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(classes)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(classes)
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof classes.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async create(data: CreateClassData): Promise<Class> {
    const [row] = await this.db
      .insert(classes)
      .values({
        academicTermId: data.academicTermId,
        bookId: data.bookId,
        bookSegmentId: data.bookSegmentId ?? null,
        teacherId: data.teacherId ?? null,
        classType: data.classType,
        status: data.status,
        capacity: data.capacity,
      })
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: UpdateClassData): Promise<Class> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.bookSegmentId !== undefined) {
      updateValues.bookSegmentId = updates.bookSegmentId;
    }
    if (updates.teacherId !== undefined) {
      updateValues.teacherId = updates.teacherId;
    }
    if (updates.classType !== undefined) {
      updateValues.classType = updates.classType;
    }
    if (updates.status !== undefined) {
      updateValues.status = updates.status;
    }
    if (updates.capacity !== undefined) {
      updateValues.capacity = updates.capacity;
    }

    const [row] = await this.db
      .update(classes)
      .set(updateValues)
      .where(eq(classes.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }

  async countActiveEnrollments(classId: string): Promise<number> {
    const [res] = await this.db
      .select({ val: count() })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'ACTIVE')));

    return Number(res?.val || 0);
  }

  async verifyTeacherSkill(teacherId: string, bookId: string): Promise<boolean> {
    const [skill] = await this.db
      .select()
      .from(teacherSkills)
      .where(
        and(
          eq(teacherSkills.teacherId, teacherId),
          eq(teacherSkills.bookId, bookId),
        ),
      )
      .limit(1);

    return Boolean(skill);
  }

  async verifyTeacherExistsAndActive(teacherId: string): Promise<boolean> {
    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.isActive, true)))
      .limit(1);

    return Boolean(teacher);
  }

  async verifyStudentExistsAndActive(studentId: string): Promise<boolean> {
    const [student] = await this.db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.isActive, true)))
      .limit(1);

    return Boolean(student);
  }

  async verifyTermExistsAndNotClosed(termId: string): Promise<boolean> {
    const [term] = await this.db
      .select()
      .from(academicTerms)
      .where(and(eq(academicTerms.id, termId), not(eq(academicTerms.status, 'CLOSED'))))
      .limit(1);

    return Boolean(term);
  }

  async verifyBookExistsAndActive(bookId: string): Promise<boolean> {
    const [book] = await this.db
      .select()
      .from(books)
      .where(and(eq(books.id, bookId), eq(books.isActive, true)))
      .limit(1);

    return Boolean(book);
  }

  async verifySegmentBelongsToBook(segmentId: string, bookId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ segmentId: bookSegments.id })
      .from(bookSegments)
      .innerJoin(bookParts, eq(bookSegments.bookPartId, bookParts.id))
      .innerJoin(books, eq(bookParts.bookId, books.id))
      .where(and(eq(bookSegments.id, segmentId), eq(books.id, bookId)))
      .limit(1);

    return Boolean(result);
  }

  async hasHistoricalRecords(classId: string): Promise<boolean> {
    const [enrCount] = await this.db
      .select({ val: count() })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));

    return Number(enrCount?.val || 0) > 0;
  }

  async deleteClass(id: string): Promise<void> {
    await this.db.delete(classes).where(eq(classes.id, id));
  }
}
