import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import { classes, enrollments } from '../../../infrastructure/database/schema/classes.schema';
import { students } from '../../../infrastructure/database/schema/students.schema';
import { exams, examResults } from '../../../infrastructure/database/schema/education.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import {
  CreateExamSchema,
  UpdateExamSchema,
  CreateExamResultSchema,
  UpdateExamResultSchema,
  deriveAssessmentStatus,
} from '@edutech/shared';
import type {
  CreateExamDto,
  UpdateExamDto,
  CreateExamResultDto,
  UpdateExamResultDto,
  ExamDetailDto,
  ExamResultDetailDto,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class ExamService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Helper to verify user permissions for a class
   */
  private assertClassAccess(classRecord: any, user: AuthUser) {
    if (user.roles.includes('SUPERVISOR')) {
      return;
    }

    if (user.roles.includes('TEACHER')) {
      if (user.teacherId && classRecord.teacherId === user.teacherId) {
        return;
      }
    }

    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access exams for this class',
    });
  }

  /**
   * POST /api/v1/classes/:classId/exams
   */
  async createExam(
    classId: string,
    dto: CreateExamDto,
    user: AuthUser,
  ): Promise<ExamDetailDto> {
    const [cls] = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${classId} not found`,
      });
    }

    this.assertClassAccess(cls, user);

    const parseResult = CreateExamSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    const createdId = await this.db.transaction(async (tx: any) => {
      const [exam] = await tx
        .insert(exams)
        .values({
          classId,
          examDate: data.examDate,
          type: data.type,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_EXAM',
        entityType: 'EXAM',
        entityId: exam.id,
        metadata: {
          classId,
          examDate: data.examDate,
          type: data.type,
        },
      });

      return exam.id;
    });

    return this.getExam(createdId, user);
  }

  /**
   * GET /api/v1/classes/:classId/exams
   */
  async listExamsForClass(
    classId: string,
    user: AuthUser,
  ): Promise<ExamDetailDto[]> {
    const [cls] = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${classId} not found`,
      });
    }

    this.assertClassAccess(cls, user);

    const examList = await this.db
      .select()
      .from(exams)
      .where(eq(exams.classId, classId))
      .orderBy(desc(exams.examDate), desc(exams.createdAt));

    const result: ExamDetailDto[] = [];
    for (const ex of examList) {
      const [countRow] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(examResults)
        .where(eq(examResults.examId, ex.id));

      result.push({
        id: ex.id,
        classId: ex.classId,
        examDate: ex.examDate,
        type: ex.type,
        createdAt: ex.createdAt,
        updatedAt: ex.updatedAt,
        class: {
          id: cls.id,
          academicTermId: cls.academicTermId,
          bookId: cls.bookId,
          bookSegmentId: cls.bookSegmentId,
          teacherId: cls.teacherId,
          classType: cls.classType,
          status: cls.status,
        },
        resultsCount: countRow?.count ?? 0,
      });
    }

    return result;
  }

  /**
   * GET /api/v1/exams/:id
   */
  async getExam(id: string, user: AuthUser): Promise<ExamDetailDto> {
    const [row] = await this.db
      .select({
        exam: exams,
        cls: classes,
      })
      .from(exams)
      .innerJoin(classes, eq(exams.classId, classes.id))
      .where(eq(exams.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam with id ${id} not found`,
      });
    }

    this.assertClassAccess(row.cls, user);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(examResults)
      .where(eq(examResults.examId, id));

    return {
      id: row.exam.id,
      classId: row.exam.classId,
      examDate: row.exam.examDate,
      type: row.exam.type,
      createdAt: row.exam.createdAt,
      updatedAt: row.exam.updatedAt,
      class: {
        id: row.cls.id,
        academicTermId: row.cls.academicTermId,
        bookId: row.cls.bookId,
        bookSegmentId: row.cls.bookSegmentId,
        teacherId: row.cls.teacherId,
        classType: row.cls.classType,
        status: row.cls.status,
      },
      resultsCount: countRow?.count ?? 0,
    };
  }

  /**
   * PATCH /api/v1/exams/:id
   */
  async updateExam(
    id: string,
    dto: UpdateExamDto,
    user: AuthUser,
  ): Promise<ExamDetailDto> {
    const [row] = await this.db
      .select({
        exam: exams,
        cls: classes,
      })
      .from(exams)
      .innerJoin(classes, eq(exams.classId, classes.id))
      .where(eq(exams.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam with id ${id} not found`,
      });
    }

    this.assertClassAccess(row.cls, user);

    const parseResult = UpdateExamSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    await this.db.transaction(async (tx: any) => {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (data.examDate !== undefined) {
        updatePayload.examDate = data.examDate;
      }
      if (data.type !== undefined) {
        updatePayload.type = data.type;
      }

      await tx.update(exams).set(updatePayload).where(eq(exams.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_EXAM',
        entityType: 'EXAM',
        entityId: id,
        metadata: {
          examDate: data.examDate,
          type: data.type,
        },
      });
    });

    return this.getExam(id, user);
  }

  /**
   * GET /api/v1/exams/:examId/results
   */
  async listResultsForExam(
    examId: string,
    user: AuthUser,
  ): Promise<ExamResultDetailDto[]> {
    const [examRow] = await this.db
      .select({
        exam: exams,
        cls: classes,
      })
      .from(exams)
      .innerJoin(classes, eq(exams.classId, classes.id))
      .where(eq(exams.id, examId))
      .limit(1);

    if (!examRow) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam with id ${examId} not found`,
      });
    }

    this.assertClassAccess(examRow.cls, user);

    const rows = await this.db
      .select({
        result: examResults,
        student: students,
      })
      .from(examResults)
      .innerJoin(students, eq(examResults.studentId, students.id))
      .where(eq(examResults.examId, examId))
      .orderBy(students.lastName, students.firstName);

    return rows.map((r: any) => {
      const numericScore = parseFloat(r.result.score);
      return {
        id: r.result.id,
        examId: r.result.examId,
        studentId: r.result.studentId,
        score: numericScore,
        status: deriveAssessmentStatus(numericScore),
        createdAt: r.result.createdAt,
        updatedAt: r.result.updatedAt,
        student: {
          id: r.student.id,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
        },
      };
    });
  }

  /**
   * POST /api/v1/exams/:examId/results
   */
  async createExamResult(
    examId: string,
    dto: CreateExamResultDto,
    user: AuthUser,
  ): Promise<ExamResultDetailDto> {
    const [examRow] = await this.db
      .select({
        exam: exams,
        cls: classes,
      })
      .from(exams)
      .innerJoin(classes, eq(exams.classId, classes.id))
      .where(eq(exams.id, examId))
      .limit(1);

    if (!examRow) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam with id ${examId} not found`,
      });
    }

    this.assertClassAccess(examRow.cls, user);

    const parseResult = CreateExamResultSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const numericScore =
      typeof data.score === 'string' ? parseFloat(data.score) : data.score;

    // Validate student exists
    const [student] = await this.db
      .select()
      .from(students)
      .where(eq(students.id, data.studentId))
      .limit(1);

    if (!student) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Student with id ${data.studentId} not found`,
      });
    }

    // Validate student is enrolled in the exam's class
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.classId, examRow.cls.id),
          eq(enrollments.studentId, data.studentId),
        ),
      )
      .limit(1);

    if (!enrollment) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Student is not enrolled in the class for this exam',
      });
    }

    // Check if result already exists for this student on this exam
    const [existingResult] = await this.db
      .select()
      .from(examResults)
      .where(
        and(
          eq(examResults.examId, examId),
          eq(examResults.studentId, data.studentId),
        ),
      )
      .limit(1);

    if (existingResult) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Exam result already exists for this student on this exam',
      });
    }

    const derivedStatus = deriveAssessmentStatus(numericScore);

    const createdId = await this.db.transaction(async (tx: any) => {
      const [res] = await tx
        .insert(examResults)
        .values({
          examId,
          studentId: data.studentId,
          score: numericScore.toFixed(2),
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_EXAM_RESULT',
        entityType: 'EXAM_RESULT',
        entityId: res.id,
        metadata: {
          examId,
          studentId: data.studentId,
          score: numericScore,
          status: derivedStatus,
        },
      });

      return res.id;
    });

    const [created] = await this.db
      .select()
      .from(examResults)
      .where(eq(examResults.id, createdId))
      .limit(1);

    return {
      id: created.id,
      examId: created.examId,
      studentId: created.studentId,
      score: numericScore,
      status: derivedStatus,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
      },
    };
  }

  /**
   * PATCH /api/v1/exam-results/:id
   */
  async updateExamResult(
    id: string,
    dto: UpdateExamResultDto,
    user: AuthUser,
  ): Promise<ExamResultDetailDto> {
    const [row] = await this.db
      .select({
        result: examResults,
        exam: exams,
        cls: classes,
        student: students,
      })
      .from(examResults)
      .innerJoin(exams, eq(examResults.examId, exams.id))
      .innerJoin(classes, eq(exams.classId, classes.id))
      .innerJoin(students, eq(examResults.studentId, students.id))
      .where(eq(examResults.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Exam result with id ${id} not found`,
      });
    }

    this.assertClassAccess(row.cls, user);

    const parseResult = UpdateExamResultSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const previousScore = parseFloat(row.result.score);
    const previousStatus = deriveAssessmentStatus(previousScore);

    const newScore =
      typeof data.score === 'string' ? parseFloat(data.score) : data.score;
    const newStatus = deriveAssessmentStatus(newScore);

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(examResults)
        .set({
          score: newScore.toFixed(2),
          updatedAt: now,
        })
        .where(eq(examResults.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_EXAM_RESULT',
        entityType: 'EXAM_RESULT',
        entityId: id,
        metadata: {
          previousScore,
          newScore,
          previousStatus,
          newStatus,
        },
      });
    });

    return {
      id: row.result.id,
      examId: row.result.examId,
      studentId: row.result.studentId,
      score: newScore,
      status: newStatus,
      createdAt: row.result.createdAt,
      updatedAt: now,
      student: {
        id: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
      },
    };
  }
}
