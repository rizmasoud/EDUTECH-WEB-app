import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, and, ilike, count, or } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import { teachers, teacherSkills } from '../../infrastructure/database/schema/teachers.schema';
import { books } from '../../infrastructure/database/schema/academics.schema';
import { Teacher } from '../domain/entities/teacher.entity';
import { TeacherSkill } from '../domain/entities/teacher-skill.entity';
import type {
  ITeacherRepository,
  CreateTeacherData,
  UpdateTeacherData,
} from '../domain/repositories/teacher.repository.interface';
import type { FindTeachersFilter } from '@edutech/shared';

@Injectable()
export class DrizzleTeacherRepository implements ITeacherRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapRowToEntity(row: typeof teachers.$inferSelect): Teacher {
    return new Teacher(
      row.id,
      row.accountId ?? null,
      row.firstName,
      row.lastName,
      row.baseRate,
      row.isActive,
      row.createdAt,
      row.updatedAt,
    );
  }

  async findById(id: string): Promise<Teacher | null> {
    const [row] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, id))
      .limit(1);

    return row ? this.mapRowToEntity(row) : null;
  }

  async findAll(filter?: FindTeachersFilter): Promise<{ items: Teacher[]; total: number }> {
    const conditions: any[] = [];

    if (filter?.isActive !== undefined) {
      conditions.push(eq(teachers.isActive, filter.isActive));
    }
    if (filter?.search) {
      const searchPattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(teachers.firstName, searchPattern),
          ilike(teachers.lastName, searchPattern),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(teachers)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(teachers)
      .where(whereClause)
      .orderBy(desc(teachers.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof teachers.$inferSelect) => this.mapRowToEntity(r)),
      total,
    };
  }

  async create(data: CreateTeacherData): Promise<Teacher> {
    const [row] = await this.db
      .insert(teachers)
      .values({
        accountId: data.accountId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        baseRate: data.baseRate ?? '0.00',
        isActive: data.isActive ?? true,
      })
      .returning();

    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: UpdateTeacherData): Promise<Teacher> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.firstName !== undefined) {
      updateValues.firstName = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      updateValues.lastName = updates.lastName;
    }
    if (updates.baseRate !== undefined) {
      updateValues.baseRate = updates.baseRate;
    }
    if (updates.isActive !== undefined) {
      updateValues.isActive = updates.isActive;
    }

    const [row] = await this.db
      .update(teachers)
      .set(updateValues)
      .where(eq(teachers.id, id))
      .returning();

    return this.mapRowToEntity(row);
  }

  async findSkills(teacherId: string): Promise<TeacherSkill[]> {
    const rows = await this.db
      .select({
        id: teacherSkills.id,
        teacherId: teacherSkills.teacherId,
        bookId: teacherSkills.bookId,
        createdAt: teacherSkills.createdAt,
        bookName: books.name,
        bookLevel: books.level,
      })
      .from(teacherSkills)
      .innerJoin(books, eq(teacherSkills.bookId, books.id))
      .where(eq(teacherSkills.teacherId, teacherId))
      .orderBy(desc(teacherSkills.createdAt));

    return rows.map(
      (r: any) =>
        new TeacherSkill(
          r.id,
          r.teacherId,
          r.bookId,
          r.createdAt,
          r.bookName,
          r.bookLevel,
        ),
    );
  }

  async findSkillByTeacherAndBook(teacherId: string, bookId: string): Promise<TeacherSkill | null> {
    const [row] = await this.db
      .select()
      .from(teacherSkills)
      .where(
        and(
          eq(teacherSkills.teacherId, teacherId),
          eq(teacherSkills.bookId, bookId),
        ),
      )
      .limit(1);

    return row ? new TeacherSkill(row.id, row.teacherId, row.bookId, row.createdAt) : null;
  }

  async addSkill(teacherId: string, bookId: string): Promise<TeacherSkill> {
    const [row] = await this.db
      .insert(teacherSkills)
      .values({
        teacherId,
        bookId,
      })
      .returning();

    return new TeacherSkill(row.id, row.teacherId, row.bookId, row.createdAt);
  }

  async deleteSkill(teacherId: string, skillId: string): Promise<void> {
    await this.db
      .delete(teacherSkills)
      .where(and(eq(teacherSkills.id, skillId), eq(teacherSkills.teacherId, teacherId)));
  }

  async verifyBookExistsAndActive(bookId: string): Promise<boolean> {
    const [book] = await this.db
      .select()
      .from(books)
      .where(and(eq(books.id, bookId), eq(books.isActive, true)))
      .limit(1);

    return Boolean(book);
  }
}
