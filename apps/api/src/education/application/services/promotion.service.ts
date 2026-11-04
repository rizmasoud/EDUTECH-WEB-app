import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, gt, asc, desc } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import { promotions, exams, examResults } from '../../../infrastructure/database/schema/education.schema';
import { classes, enrollments } from '../../../infrastructure/database/schema/classes.schema';
import { books } from '../../../infrastructure/database/schema/academics.schema';
import { students } from '../../../infrastructure/database/schema/students.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { resolveDataScope, forbiddenResource } from '../../../auth/presentation/policies/teacher-data-scope';
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
   * Read scope for promotions: a promotion belongs to the class of the exam its exam result came from (the same
   * rule the process-promotion check uses). Supervisors see all; a teacher only promotions from their own classes.
   * Requires the query to join examResults -> exams -> classes.
   */
  private teacherScopeConditions(user: AuthUser): SQL[] {
    const scope = resolveDataScope(user);
    if (scope.kind === 'ALL') return [];
    if (scope.kind === 'NONE') throw forbiddenResource('You do not have permission to access promotions');
    return [eq(classes.teacherId, scope.teacherId)];
  }

  /**
   * Process an ExamResult into a Promotion record.
   * Driven by ExamResult. Idempotent.
   */
  async processExamResult(
    examResultId: string,
    user: AuthUser,
  ): Promise<PromotionDetailDto> {
    // 1. Lookup ExamResult with Exam, Class, and Book
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

    // 2. Authorization Check (shared teacher data-access pattern). It runs BEFORE the 404 and BEFORE the
    // idempotency lookup, so a teacher gets the same 403 for a missing result and for another teacher's result,
    // and an existing promotion is never returned to a caller who may not access its result.
    const scope = resolveDataScope(user);
    if (scope.kind === 'NONE' || (scope.kind === 'TEACHER' && row?.cls.teacherId !== scope.teacherId)) {
      throw forbiddenResource('You do not have permission to process promotion for this exam result');
    }
    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam result with id ${examResultId} not found`,
      });
    }

    // 3. Idempotency Check: if promotion already exists, return existing (the caller is already authorized)
    const [existing] = await this.db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.examResultId, examResultId))
      .limit(1);

    if (existing) {
      return this.getPromotion(existing.id, user);
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
    } else if (score >= 60.0) {
      // Conditional range (60 <= score < 70): awaits a decision.
      status = 'PENDING_DECISION';
      toBookId = null;
    } else {
      // Below 60 does not qualify for promotion. Provisional policy (decision D5): the outcome is
      // NOT_PROMOTED straight away, with no pending decision, no decider and no teacher exception.
      status = 'NOT_PROMOTED';
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
   * Conditional Promotion decision on a pending promotion.
   * A Supervisor may decide any pending promotion. A teacher may decide only a pending promotion whose exam belongs
   * to one of their own classes and whose linked score is in [60, 70). Ownership is part of the lookup itself.
   */
  async decidePromotion(
    promotionId: string,
    dto: DecidePromotionDto,
    user: AuthUser,
  ): Promise<PromotionDetailDto> {
    const scope = resolveDataScope(user);
    if (scope.kind === 'NONE') {
      throw forbiddenResource('You do not have permission to decide this promotion');
    }

    const parseResult = DecidePromotionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const now = new Date();

    await this.db.transaction(async (tx: any) => {
      // Lock in a stable order. The promotion lock serializes competing decisions;
      // the result and class locks prevent score/ownership changes until commit.
      const [promotion] = await tx
        .select()
        .from(promotions)
        .where(eq(promotions.id, promotionId))
        .for('update')
        .limit(1);

      if (!promotion) {
        if (scope.kind !== 'ALL') {
          throw forbiddenResource('You do not have permission to decide this promotion');
        }
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Promotion with id ${promotionId} not found`,
        });
      }

      const [examResult] = await tx
        .select()
        .from(examResults)
        .where(eq(examResults.id, promotion.examResultId))
        .for('update')
        .limit(1);

      const [exam] = examResult
        ? await tx
            .select()
            .from(exams)
            .where(eq(exams.id, examResult.examId))
            .for('update')
            .limit(1)
        : [];

      const [cls] = exam
        ? await tx
            .select()
            .from(classes)
            .where(eq(classes.id, exam.classId))
            .for('update')
            .limit(1)
        : [];

      // Preserve the existing anti-enumeration behavior for teachers.
      if (!examResult || !exam || !cls) {
        if (scope.kind !== 'ALL') {
          throw forbiddenResource('You do not have permission to decide this promotion');
        }
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Promotion with id ${promotionId} not found`,
        });
      }

      if (scope.kind === 'TEACHER' && cls.teacherId !== scope.teacherId) {
        throw forbiddenResource('You do not have permission to decide this promotion');
      }

      if (promotion.status !== 'PENDING_DECISION') {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `Cannot decide an already finalized promotion with status ${promotion.status}`,
        });
      }

      const score = parseFloat(examResult.score);
      if (scope.kind === 'TEACHER' && !(score >= 60.0 && score < 70.0)) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'This promotion does not require a conditional promotion decision',
        });
      }

      const [fromBook] = await tx
        .select()
        .from(books)
        .where(eq(books.id, promotion.fromBookId))
        .for('update')
        .limit(1);

      if (!fromBook) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Source book for promotion ${promotionId} not found`,
        });
      }

      let newStatus: PromotionStatus;
      let toBookId: string | null = null;

      if (data.decision === 'PROMOTE') {
        newStatus = 'PROMOTED';
        if (!fromBook.isTerminal) {
          const eligibleNextBooks = await tx
            .select()
            .from(books)
            .where(
              and(
                gt(books.sequenceOrder, fromBook.sequenceOrder),
                eq(books.isActive, true),
              ),
            )
            .orderBy(asc(books.sequenceOrder))
            .for('update');

          // Lock the current eligible set in sequence order so edits to another
          // candidate cannot silently change which book is considered "next".
          const nextBook = eligibleNextBooks[0];
          toBookId = nextBook ? nextBook.id : null;
        }
      } else {
        // DO_NOT_PROMOTE, REPEAT, REMEDIAL
        newStatus = 'NOT_PROMOTED';
      }

      const updated = await tx
        .update(promotions)
        .set({
          status: newStatus,
          decision: data.decision,
          toBookId,
          decidedBy: user.id,
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(promotions.id, promotionId), eq(promotions.status, 'PENDING_DECISION')))
        .returning({ id: promotions.id });

      // Retain a conditional update as a second line of defense.
      if (updated.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'Cannot decide an already finalized promotion',
        });
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_PROMOTION',
        entityType: 'PROMOTION',
        entityId: promotionId,
        metadata: {
          previousStatus: promotion.status,
          newStatus,
          decision: data.decision,
          studentId: promotion.studentId,
          fromBookId: promotion.fromBookId,
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
      .innerJoin(exams, eq(examResults.examId, exams.id))
      .innerJoin(classes, eq(exams.classId, classes.id))
      .where(and(eq(promotions.id, id), ...this.teacherScopeConditions(user)))
      .limit(1);

    if (!row) {
      // A teacher gets the same 403 whether the promotion is someone else's or does not exist.
      if (resolveDataScope(user).kind !== 'ALL') {
        throw forbiddenResource('You do not have permission to access this promotion');
      }
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
      .innerJoin(examResults, eq(promotions.examResultId, examResults.id))
      .innerJoin(exams, eq(examResults.examId, exams.id))
      .innerJoin(classes, eq(exams.classId, classes.id));

    const conditions: SQL[] = [...this.teacherScopeConditions(user)];
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
   * List promotions for a specific student.
   * A teacher may list a student's promotions only if the student is in the teacher's authorized scope: enrolled
   * (any enrollment status, so historical records stay readable) in a class the teacher teaches. A student who does
   * not exist and a student outside that scope get the same 403, so ids cannot be probed; an in-scope student with
   * no promotions gets 200 with an empty list. A supervisor is unrestricted and gets a 404 for a missing student.
   */
  async listPromotionsForStudent(
    studentId: string,
    user: AuthUser,
  ): Promise<PromotionDetailDto[]> {
    const scope = resolveDataScope(user);

    if (scope.kind === 'NONE') {
      throw forbiddenResource('You do not have permission to access this student');
    }

    if (scope.kind === 'TEACHER') {
      const [link] = await this.db
        .select({ id: enrollments.id })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(and(eq(enrollments.studentId, studentId), eq(classes.teacherId, scope.teacherId)))
        .limit(1);

      if (!link) {
        throw forbiddenResource('You do not have permission to access this student');
      }
    } else {
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
    }

    return this.listPromotions({ studentId }, user);
  }
}
