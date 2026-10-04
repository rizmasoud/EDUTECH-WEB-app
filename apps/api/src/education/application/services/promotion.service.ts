import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, gt, asc, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import { promotions, exams, examResults } from '../../../infrastructure/database/schema/education.schema';
import { classes } from '../../../infrastructure/database/schema/classes.schema';
import { books } from '../../../infrastructure/database/schema/academics.schema';
import { students } from '../../../infrastructure/database/schema/students.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { DecidePromotionSchema } from '@edutech/shared';
import type {
  DecidePromotionDto,
  PromotionDetailDto,
  PromotionStatus,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class PromotionService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Helper to verify supervisor access
   */
  private assertSupervisor(user: AuthUser) {
    if (!user.roles.includes('SUPERVISOR')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can perform this operation',
      });
    }
  }

  /**
   * Process an ExamResult into a Promotion record.
   * Driven by ExamResult. Idempotent.
   */
  async processExamResult(
    examResultId: string,
    user: AuthUser,
  ): Promise<PromotionDetailDto> {
    // 1. Idempotency Check: if promotion already exists, return existing
    const [existing] = await this.db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.examResultId, examResultId))
      .limit(1);

    if (existing) {
      return this.getPromotion(existing.id, user);
    }

    // 2. Lookup ExamResult with Exam, Class, and Book
    const [row] = await this.db
      .select({
        examResult: examResults,
        exam: exams,
        cls: classes,
        book: books,
      })
      .from(examResults)
      .innerJoin(exams, eq(examResults.examId, exams.id))
      .innerJoin(classes, eq(exams.classId, classes.id))
      .innerJoin(books, eq(classes.bookId, books.id))
      .where(eq(examResults.id, examResultId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam result with id ${examResultId} not found`,
      });
    }

    // 3. Authorization Check
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isAssignedTeacher =
      user.roles.includes('TEACHER') &&
      Boolean(user.teacherId) &&
      row.cls.teacherId === user.teacherId;

    if (!isSupervisor && !isAssignedTeacher) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to process promotion for this exam result',
      });
    }

    // 4. Resolve Data
    const studentId = row.examResult.studentId;
    const fromBook = row.book;
    const fromBookId = fromBook.id;
    const score = parseFloat(row.examResult.score);

    // 5. Evaluate Promotion Policy
    let status: PromotionStatus;
    let toBookId: string | null = null;

    if (score >= 70.0) {
      if (fromBook.isTerminal) {
        status = 'TERMINAL_COMPLETION';
        toBookId = null;
      } else {
        const [nextBook] = await this.db
          .select()
          .from(books)
          .where(
            and(
              gt(books.sequenceOrder, fromBook.sequenceOrder),
              eq(books.isActive, true),
            ),
          )
          .orderBy(asc(books.sequenceOrder))
          .limit(1);

        if (nextBook) {
          status = 'AUTOMATIC';
          toBookId = nextBook.id;
        } else {
          status = 'TERMINAL_COMPLETION';
          toBookId = null;
        }
      }
    } else {
      // Both 60 <= score < 70 and score < 60 become PENDING_DECISION
      status = 'PENDING_DECISION';
      toBookId = null;
    }

    // 6. Transactional persistence with Audit Log
    const createdId = await this.db.transaction(async (tx: any) => {
      // Double check in transaction in case of race condition
      const [raceExisting] = await tx
        .select({ id: promotions.id })
        .from(promotions)
        .where(eq(promotions.examResultId, examResultId))
        .limit(1);

      if (raceExisting) {
        return raceExisting.id;
      }

      const [promo] = await tx
        .insert(promotions)
        .values({
          studentId,
          fromBookId,
          toBookId,
          examResultId,
          status,
          decision: null,
          decidedBy: null,
          decidedAt: null,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_PROMOTION',
        entityType: 'PROMOTION',
        entityId: promo.id,
        metadata: {
          studentId,
          fromBookId,
          toBookId,
          examResultId,
          status,
          score,
        },
      });

      return promo.id;
    });

    return this.getPromotion(createdId, user);
  }

  /**
   * Supervisor makes a decision on a pending promotion.
   */
  async decidePromotion(
    promotionId: string,
    dto: DecidePromotionDto,
    user: AuthUser,
  ): Promise<PromotionDetailDto> {
    this.assertSupervisor(user);

    const parseResult = DecidePromotionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    const [row] = await this.db
      .select({
        promotion: promotions,
        fromBook: books,
      })
      .from(promotions)
      .innerJoin(books, eq(promotions.fromBookId, books.id))
      .where(eq(promotions.id, promotionId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Promotion with id ${promotionId} not found`,
      });
    }

    if (row.promotion.status !== 'PENDING_DECISION') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: `Cannot decide an already finalized promotion with status ${row.promotion.status}`,
      });
    }

    let newStatus: PromotionStatus;
    let toBookId: string | null = null;

    if (data.decision === 'PROMOTE') {
      newStatus = 'PROMOTED';
      if (!row.fromBook.isTerminal) {
        const [nextBook] = await this.db
          .select()
          .from(books)
          .where(
            and(
              gt(books.sequenceOrder, row.fromBook.sequenceOrder),
              eq(books.isActive, true),
            ),
          )
          .orderBy(asc(books.sequenceOrder))
          .limit(1);

        toBookId = nextBook ? nextBook.id : null;
      }
    } else {
      // DO_NOT_PROMOTE, REPEAT, REMEDIAL
      newStatus = 'NOT_PROMOTED';
      toBookId = null;
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(promotions)
        .set({
          status: newStatus,
          decision: data.decision,
          toBookId,
          decidedBy: user.id,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(promotions.id, promotionId));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_PROMOTION',
        entityType: 'PROMOTION',
        entityId: promotionId,
        metadata: {
          previousStatus: row.promotion.status,
          newStatus,
          decision: data.decision,
          studentId: row.promotion.studentId,
          fromBookId: row.promotion.fromBookId,
          toBookId,
          reason: data.reason || null,
        },
      });
    });

    return this.getPromotion(promotionId, user);
  }

  /**
   * Get Promotion detail by ID
   */
  async getPromotion(id: string, user: AuthUser): Promise<PromotionDetailDto> {
    const toBooks = alias(books, 'to_books');

    const [row] = await this.db
      .select({
        promotion: promotions,
        student: students,
        fromBook: books,
        toBook: toBooks,
        examResult: examResults,
      })
      .from(promotions)
      .innerJoin(students, eq(promotions.studentId, students.id))
      .innerJoin(books, eq(promotions.fromBookId, books.id))
      .leftJoin(toBooks, eq(promotions.toBookId, toBooks.id))
      .innerJoin(examResults, eq(promotions.examResultId, examResults.id))
      .where(eq(promotions.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Promotion with id ${id} not found`,
      });
    }

    return {
      id: row.promotion.id,
      studentId: row.promotion.studentId,
      fromBookId: row.promotion.fromBookId,
      toBookId: row.promotion.toBookId,
      examResultId: row.promotion.examResultId,
      status: row.promotion.status,
      decision: row.promotion.decision,
      decidedBy: row.promotion.decidedBy,
      decidedAt: row.promotion.decidedAt,
      createdAt: row.promotion.createdAt,
      updatedAt: row.promotion.updatedAt,
      student: {
        id: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
      },
      fromBook: {
        id: row.fromBook.id,
        name: row.fromBook.name,
        level: row.fromBook.level,
        sequenceOrder: row.fromBook.sequenceOrder,
        isTerminal: row.fromBook.isTerminal,
      },
      toBook: row.toBook
        ? {
            id: row.toBook.id,
            name: row.toBook.name,
            level: row.toBook.level,
            sequenceOrder: row.toBook.sequenceOrder,
            isTerminal: row.toBook.isTerminal,
          }
        : null,
      examResult: {
        id: row.examResult.id,
        examId: row.examResult.examId,
        score: parseFloat(row.examResult.score),
      },
    };
  }

  /**
   * List promotions with optional filtering
   */
  async listPromotions(
    filter: { studentId?: string; status?: PromotionStatus },
    user: AuthUser,
  ): Promise<PromotionDetailDto[]> {
    const toBooks = alias(books, 'to_books');

    let query = this.db
      .select({
        promotion: promotions,
        student: students,
        fromBook: books,
        toBook: toBooks,
        examResult: examResults,
      })
      .from(promotions)
      .innerJoin(students, eq(promotions.studentId, students.id))
      .innerJoin(books, eq(promotions.fromBookId, books.id))
      .leftJoin(toBooks, eq(promotions.toBookId, toBooks.id))
      .innerJoin(examResults, eq(promotions.examResultId, examResults.id));

    const conditions: any[] = [];
    if (filter.studentId) {
      conditions.push(eq(promotions.studentId, filter.studentId));
    }
    if (filter.status) {
      conditions.push(eq(promotions.status, filter.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(promotions.createdAt));

    return rows.map((row: any) => ({
      id: row.promotion.id,
      studentId: row.promotion.studentId,
      fromBookId: row.promotion.fromBookId,
      toBookId: row.promotion.toBookId,
      examResultId: row.promotion.examResultId,
      status: row.promotion.status,
      decision: row.promotion.decision,
      decidedBy: row.promotion.decidedBy,
      decidedAt: row.promotion.decidedAt,
      createdAt: row.promotion.createdAt,
      updatedAt: row.promotion.updatedAt,
      student: {
        id: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
      },
      fromBook: {
        id: row.fromBook.id,
        name: row.fromBook.name,
        level: row.fromBook.level,
        sequenceOrder: row.fromBook.sequenceOrder,
        isTerminal: row.fromBook.isTerminal,
      },
      toBook: row.toBook
        ? {
            id: row.toBook.id,
            name: row.toBook.name,
            level: row.toBook.level,
            sequenceOrder: row.toBook.sequenceOrder,
            isTerminal: row.toBook.isTerminal,
          }
        : null,
      examResult: {
        id: row.examResult.id,
        examId: row.examResult.examId,
        score: parseFloat(row.examResult.score),
      },
    }));
  }

  /**
   * List promotions for a specific student
   */
  async listPromotionsForStudent(
    studentId: string,
    user: AuthUser,
  ): Promise<PromotionDetailDto[]> {
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);

    if (!student) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Student with id ${studentId} not found`,
      });
    }

    return this.listPromotions({ studentId }, user);
  }
}
