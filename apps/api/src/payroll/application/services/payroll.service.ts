import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, ne, desc, asc, inArray } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  payrolls,
  payrollItems,
} from '../../../infrastructure/database/schema/payroll.schema';
import { teachers } from '../../../infrastructure/database/schema/teachers.schema';
import { academicTerms, books } from '../../../infrastructure/database/schema/academics.schema';
import { classes, classSessions } from '../../../infrastructure/database/schema/classes.schema';
import { teacherAttendanceRecords } from '../../../infrastructure/database/schema/attendance.schema';
import { substitutionRequests } from '../../../infrastructure/database/schema/substitutions.schema';
import { lessonPlans } from '../../../infrastructure/database/schema/education.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PayrollPolicy } from '../../domain/policies/payroll.policy';
import {
  CreatePayrollSchema,
  CreatePayrollAdjustmentSchema,
  QueryPayrollsSchema,
} from '@edutech/shared';
import type {
  AuthUser,
  CreatePayrollDto,
  CreatePayrollAdjustmentDto,
  QueryPayrollsDto,
  PayrollDto,
  PayrollDetailDto,
  PayrollItemDto,
} from '@edutech/shared';

@Injectable()
export class PayrollService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
    @Inject(PayrollPolicy)
    private readonly payrollPolicy: PayrollPolicy,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper to verify supervisor role
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
   * Helper to check object-level access for teacher vs supervisor
   */
  private checkPayrollAccess(payroll: any, user: AuthUser) {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isOwner = user.teacherId && payroll.teacherId === user.teacherId;

    if (!isSupervisor && !isOwner) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You do not have permission to access this payroll',
      });
    }
  }

  /**
   * Helper to map database payroll record and relations to PayrollDetailDto
   */
  private mapToDetailDto(
    payroll: any,
    items: any[] = [],
    teacher?: any,
    term?: any,
  ): PayrollDetailDto {
    return {
      id: payroll.id,
      teacherId: payroll.teacherId,
      academicTermId: payroll.academicTermId,
      status: payroll.status,
      totalAmount: String(payroll.totalAmount),
      finalizedAt: payroll.finalizedAt,
      createdAt: payroll.createdAt,
      updatedAt: payroll.updatedAt,
      teacher: teacher
        ? {
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            baseRate: teacher.baseRate ? String(teacher.baseRate) : null,
            accountId: teacher.accountId,
          }
        : undefined,
      academicTerm: term
        ? {
            id: term.id,
            name: term.name,
            startDate: term.startDate,
            endDate: term.endDate,
          }
        : undefined,
      items: items.map((item) => ({
        id: item.id,
        payrollId: item.payrollId,
        type: item.type,
        quantity: String(item.quantity),
        rate: String(item.rate),
        amount: String(item.amount),
        referenceId: item.referenceId,
        description: item.description,
        createdAt: item.createdAt,
      })),
    };
  }

  /**
   * POST /api/v1/payrolls
   * Create a new payroll (default status: DRAFT)
   */
  async createPayroll(dto: CreatePayrollDto, user: AuthUser): Promise<PayrollDetailDto> {
    this.assertSupervisor(user);

    const parseResult = CreatePayrollSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const { teacherId, academicTermId } = parseResult.data;

    // Verify teacher exists
    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);

    if (!teacher) {
      throw new NotFoundException({
        code: 'TEACHER_NOT_FOUND',
        message: `Teacher with id ${teacherId} does not exist`,
      });
    }

    // Verify academic term exists
    const [term] = await this.db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.id, academicTermId))
      .limit(1);

    if (!term) {
      throw new NotFoundException({
        code: 'ACADEMIC_TERM_NOT_FOUND',
        message: `Academic term with id ${academicTermId} does not exist`,
      });
    }

    // Check for existing payroll for this teacher & term
    const existingPayrolls = await this.db
      .select()
      .from(payrolls)
      .where(
        and(
          eq(payrolls.teacherId, teacherId),
          eq(payrolls.academicTermId, academicTermId),
        ),
      );

    const finalizedPayroll = existingPayrolls.find((p: any) => p.status === 'FINALIZED');
    if (finalizedPayroll) {
      throw new BadRequestException({
        code: 'PAYROLL_ALREADY_FINALIZED',
        message: 'A finalized payroll already exists for this teacher and academic term',
      });
    }

    const activeDraft = existingPayrolls.find((p: any) => p.status !== 'FINALIZED');
    if (activeDraft) {
      // Return existing active payroll
      return this.findById(activeDraft.id, user);
    }

    const now = new Date();
    const [newPayroll] = await this.db.transaction(async (tx: any) => {
      const [inserted] = await tx
        .insert(payrolls)
        .values({
          teacherId,
          academicTermId,
          status: 'DRAFT',
          totalAmount: '0.00',
          finalizedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_PAYROLL',
        entityType: 'PAYROLL',
        entityId: inserted.id,
        metadata: {
          teacherId,
          academicTermId,
          status: 'DRAFT',
        },
      });

      return [inserted];
    });

    return this.findById(newPayroll.id, user);
  }

  /**
   * POST /api/v1/payrolls/:id/calculate
   * Calculate/recalculate payroll items and total amount
   */
  async calculatePayroll(payrollId: string, user: AuthUser): Promise<PayrollDetailDto> {
    this.assertSupervisor(user);

    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    if (payroll.status === 'FINALIZED') {
      throw new BadRequestException({
        code: 'PAYROLL_ALREADY_FINALIZED',
        message: 'Cannot recalculate a finalized payroll',
      });
    }

    // 1. Get teacher info
    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, payroll.teacherId))
      .limit(1);

    const baseRate = this.payrollPolicy.getTeacherBaseRate(teacher);

    // 2. Query all classes for this academic term where the teacher is assigned
    const assignedClasses = await this.db
      .select({
        class: classes,
        book: books,
      })
      .from(classes)
      .leftJoin(books, eq(classes.bookId, books.id))
      .where(
        and(
          eq(classes.academicTermId, payroll.academicTermId),
          eq(classes.teacherId, payroll.teacherId),
        ),
      );

    const assignedClassIds = assignedClasses.map((ac: any) => ac.class.id);

    // Query sessions for assigned classes
    let primarySessions: any[] = [];
    if (assignedClassIds.length > 0) {
      primarySessions = await this.db
        .select({
          session: classSessions,
        })
        .from(classSessions)
        .where(inArray(classSessions.classId, assignedClassIds));
    }

    // 3. Query teacher attendance records for the teacher
    const teacherAttendances = await this.db
      .select()
      .from(teacherAttendanceRecords)
      .where(eq(teacherAttendanceRecords.teacherId, payroll.teacherId));

    const attendanceBySessionId = new Map<string, any>();
    for (const att of teacherAttendances) {
      attendanceBySessionId.set(att.classSessionId, att);
    }

    // 4. Query substitutions where this teacher's sessions were substituted out
    const primarySessionIds = primarySessions.map((ps: any) => ps.session.id);
    let substitutedOutRequests: any[] = [];
    if (primarySessionIds.length > 0) {
      substitutedOutRequests = await this.db
        .select()
        .from(substitutionRequests)
        .where(
          and(
            inArray(substitutionRequests.classSessionId, primarySessionIds),
            eq(substitutionRequests.status, 'APPROVED'),
          ),
        );
    }
    const substitutedOutSessionIds = new Set(
      substitutedOutRequests
        .filter((sr: any) => sr.approvedTeacherId && sr.approvedTeacherId !== payroll.teacherId)
        .map((sr: any) => sr.classSessionId),
    );

    // 5. Query approved substitutions where THIS teacher was the substitute
    const substitutedInRequests = await this.db
      .select({
        substitution: substitutionRequests,
        session: classSessions,
        class: classes,
      })
      .from(substitutionRequests)
      .innerJoin(classSessions, eq(substitutionRequests.classSessionId, classSessions.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(substitutionRequests.approvedTeacherId, payroll.teacherId),
          eq(substitutionRequests.status, 'APPROVED'),
          eq(classes.academicTermId, payroll.academicTermId),
        ),
      );

    // 6. Query lesson plans for completed syllabus items
    const teacherLessonPlans = await this.db
      .select({
        lessonPlan: lessonPlans,
        class: classes,
      })
      .from(lessonPlans)
      .innerJoin(classes, eq(lessonPlans.classId, classes.id))
      .where(
        and(
          eq(lessonPlans.teacherId, payroll.teacherId),
          eq(classes.academicTermId, payroll.academicTermId),
        ),
      );

    // 7. Query existing ADJUSTMENT items to preserve manual adjustments
    const existingAdjustments = await this.db
      .select()
      .from(payrollItems)
      .where(
        and(
          eq(payrollItems.payrollId, payroll.id),
          eq(payrollItems.type, 'ADJUSTMENT'),
        ),
      );

    // Derive calculated items using PayrollPolicy
    const calculatedItems: any[] = [];

    // Calculate regular and private class session items
    const classById = new Map<string, any>();
    for (const ac of assignedClasses) {
      classById.set(ac.class.id, ac);
    }

    for (const ps of primarySessions) {
      const sess = ps.session;
      const classInfo = classById.get(sess.classId);
      const att = attendanceBySessionId.get(sess.id);

      if (!att) continue;

      const isSubstitutedOut = substitutedOutSessionIds.has(sess.id);

      const item = this.payrollPolicy.calculateSessionItem(
        {
          sessionId: sess.id,
          sessionDate: sess.sessionDate,
          sessionStatus: sess.status,
          classType: classInfo?.class?.classType || 'REGULAR',
          className: classInfo?.class?.id,
          bookTitle: classInfo?.book?.name,
          teacherAttendanceStatus: att.status,
          isSubstitutedOut,
        },
        baseRate,
      );

      if (item) {
        calculatedItems.push(item);
      }
    }

    // Calculate substitution items
    for (const subIn of substitutedInRequests) {
      const sess = subIn.session;
      const att = attendanceBySessionId.get(sess.id);
      if (!att) continue;

      const item = this.payrollPolicy.calculateSubstitutionItem(
        {
          substitutionRequestId: subIn.substitution.id,
          sessionId: sess.id,
          sessionDate: sess.sessionDate,
          sessionStatus: sess.status,
          classType: subIn.class.classType,
          teacherAttendanceStatus: att.status,
        },
        baseRate,
      );

      if (item) {
        calculatedItems.push(item);
      }
    }

    // Calculate lesson plan completion items
    const lessonPlanInputs = teacherLessonPlans.map((tlp: any) => ({
      lessonPlanId: tlp.lessonPlan.id,
      classId: tlp.class.id,
      status: tlp.lessonPlan.status,
      submittedAt: tlp.lessonPlan.submittedAt,
      approvedAt: tlp.lessonPlan.approvedAt,
    }));
    const lpItems = this.payrollPolicy.calculateLessonPlanItems(lessonPlanInputs);
    calculatedItems.push(...lpItems);

    // Compute total combining calculated items and preserved adjustments
    const allItemsForTotal = [
      ...calculatedItems,
      ...existingAdjustments.map((adj: any) => ({ amount: adj.amount })),
    ];
    const totalAmount = this.payrollPolicy.computeTotal(allItemsForTotal);

    const now = new Date();

    // Persist in transaction: remove old auto items, insert new auto items, update payroll
    await this.db.transaction(async (tx: any) => {
      // Delete non-adjustment items
      await tx
        .delete(payrollItems)
        .where(
          and(
            eq(payrollItems.payrollId, payroll.id),
            ne(payrollItems.type, 'ADJUSTMENT'),
          ),
        );

      // Insert new calculated items
      if (calculatedItems.length > 0) {
        await tx.insert(payrollItems).values(
          calculatedItems.map((item) => ({
            payrollId: payroll.id,
            type: item.type,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            referenceId: item.referenceId,
            description: item.description,
            createdAt: now,
          })),
        );
      }

      // Update payroll record
      await tx
        .update(payrolls)
        .set({
          status: 'CALCULATED',
          totalAmount,
          updatedAt: now,
        })
        .where(eq(payrolls.id, payroll.id));

      // Record audit log
      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CALCULATE_PAYROLL',
        entityType: 'PAYROLL',
        entityId: payroll.id,
        metadata: {
          teacherId: payroll.teacherId,
          academicTermId: payroll.academicTermId,
          itemCount: calculatedItems.length + existingAdjustments.length,
          totalAmount,
          status: 'CALCULATED',
        },
      });
    });

    // Notify teacher account if available (safe dispatch)
    if (teacher?.accountId) {
      await this.notificationService.createNotification(
        {
          recipientAccountId: teacher.accountId,
          type: 'PAYROLL_READY',
          title: 'Payroll Calculated',
          message: `Your payroll for the current academic term has been calculated (Total: ${totalAmount}).`,
          referenceEntityType: 'PAYROLL',
          referenceEntityId: payroll.id,
        },
        true,
      );
    }

    return this.findById(payroll.id, user);
  }

  /**
   * POST /api/v1/payrolls/:id/review
   * Mark payroll as reviewed
   */
  async reviewPayroll(payrollId: string, user: AuthUser): Promise<PayrollDetailDto> {
    this.assertSupervisor(user);

    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    if (payroll.status === 'FINALIZED') {
      throw new BadRequestException({
        code: 'PAYROLL_ALREADY_FINALIZED',
        message: 'Cannot review an already finalized payroll',
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(payrolls)
        .set({
          status: 'REVIEWED',
          updatedAt: now,
        })
        .where(eq(payrolls.id, payroll.id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'REVIEW_PAYROLL',
        entityType: 'PAYROLL',
        entityId: payroll.id,
        metadata: {
          status: 'REVIEWED',
        },
      });
    });

    return this.findById(payroll.id, user);
  }

  /**
   * POST /api/v1/payrolls/:id/finalize
   * Finalize payroll and lock further direct modifications
   */
  async finalizePayroll(payrollId: string, user: AuthUser): Promise<PayrollDetailDto> {
    this.assertSupervisor(user);

    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    if (payroll.status === 'FINALIZED') {
      throw new BadRequestException({
        code: 'PAYROLL_ALREADY_FINALIZED',
        message: 'Payroll is already finalized',
      });
    }

    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, payroll.teacherId))
      .limit(1);

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(payrolls)
        .set({
          status: 'FINALIZED',
          finalizedAt: now,
          updatedAt: now,
        })
        .where(eq(payrolls.id, payroll.id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'FINALIZE_PAYROLL',
        entityType: 'PAYROLL',
        entityId: payroll.id,
        metadata: {
          teacherId: payroll.teacherId,
          academicTermId: payroll.academicTermId,
          totalAmount: String(payroll.totalAmount),
          finalizedAt: now.toISOString(),
          status: 'FINALIZED',
        },
      });
    });

    // Notify teacher account (safe dispatch)
    if (teacher?.accountId) {
      await this.notificationService.createNotification(
        {
          recipientAccountId: teacher.accountId,
          type: 'PAYROLL_FINALIZED',
          title: 'Payroll Finalized',
          message: `Your payroll of ${payroll.totalAmount} has been finalized.`,
          referenceEntityType: 'PAYROLL',
          referenceEntityId: payroll.id,
        },
        true,
      );
    }

    return this.findById(payroll.id, user);
  }

  /**
   * POST /api/v1/payrolls/:id/adjustments
   * Add a manual audited adjustment item to payroll
   */
  async addAdjustment(
    payrollId: string,
    dto: CreatePayrollAdjustmentDto,
    user: AuthUser,
  ): Promise<PayrollDetailDto> {
    this.assertSupervisor(user);

    const parseResult = CreatePayrollAdjustmentSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const { amount, description, referenceId } = parseResult.data;

    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    if (payroll.status === 'FINALIZED') {
      throw new BadRequestException({
        code: 'PAYROLL_ALREADY_FINALIZED',
        message: 'Cannot add adjustments to an already finalized payroll',
      });
    }

    const adjustmentItem = this.payrollPolicy.calculateAdjustmentItem(
      amount,
      description,
      referenceId,
    );

    const now = new Date();

    await this.db.transaction(async (tx: any) => {
      // Insert adjustment item
      await tx.insert(payrollItems).values({
        payrollId: payroll.id,
        type: adjustmentItem.type,
        quantity: adjustmentItem.quantity,
        rate: adjustmentItem.rate,
        amount: adjustmentItem.amount,
        referenceId: adjustmentItem.referenceId,
        description: adjustmentItem.description,
        createdAt: now,
      });

      // Recalculate totalAmount
      const allItems = await tx
        .select()
        .from(payrollItems)
        .where(eq(payrollItems.payrollId, payroll.id));

      const newTotal = this.payrollPolicy.computeTotal(allItems);

      await tx
        .update(payrolls)
        .set({
          totalAmount: newTotal,
          updatedAt: now,
        })
        .where(eq(payrolls.id, payroll.id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_PAYROLL_ADJUSTMENT',
        entityType: 'PAYROLL',
        entityId: payroll.id,
        metadata: {
          amount: adjustmentItem.amount,
          description,
          referenceId,
          newTotal,
        },
      });
    });

    return this.findById(payroll.id, user);
  }

  /**
   * GET /api/v1/payrolls
   * Query list of payrolls with filters
   */
  async findAll(filter: QueryPayrollsDto, user: AuthUser): Promise<PayrollDto[]> {
    const isSupervisor = user.roles.includes('SUPERVISOR');

    const conditions: any[] = [];

    if (!isSupervisor) {
      if (!user.teacherId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_RESOURCE',
          message: 'Teacher account is not associated with a teacher record',
        });
      }
      conditions.push(eq(payrolls.teacherId, user.teacherId));
    } else if (filter.teacherId) {
      conditions.push(eq(payrolls.teacherId, filter.teacherId));
    }

    if (filter.academicTermId) {
      conditions.push(eq(payrolls.academicTermId, filter.academicTermId));
    }

    if (filter.status) {
      conditions.push(eq(payrolls.status, filter.status));
    }

    const results = await this.db
      .select()
      .from(payrolls)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payrolls.createdAt));

    return results.map((p: any) => ({
      id: p.id,
      teacherId: p.teacherId,
      academicTermId: p.academicTermId,
      status: p.status,
      totalAmount: String(p.totalAmount),
      finalizedAt: p.finalizedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * GET /api/v1/payrolls/:id
   * Get detailed payroll including itemized breakdown
   */
  async findById(payrollId: string, user: AuthUser): Promise<PayrollDetailDto> {
    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    this.checkPayrollAccess(payroll, user);

    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, payroll.teacherId))
      .limit(1);

    const [term] = await this.db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.id, payroll.academicTermId))
      .limit(1);

    const items = await this.db
      .select()
      .from(payrollItems)
      .where(eq(payrollItems.payrollId, payroll.id))
      .orderBy(asc(payrollItems.createdAt));

    return this.mapToDetailDto(payroll, items, teacher, term);
  }

  /**
   * GET /api/v1/payrolls/:id/items
   * Get itemized breakdown for a payroll
   */
  async findItems(payrollId: string, user: AuthUser): Promise<PayrollItemDto[]> {
    const [payroll] = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.id, payrollId))
      .limit(1);

    if (!payroll) {
      throw new NotFoundException({
        code: 'PAYROLL_NOT_FOUND',
        message: `Payroll with id ${payrollId} does not exist`,
      });
    }

    this.checkPayrollAccess(payroll, user);

    const items = await this.db
      .select()
      .from(payrollItems)
      .where(eq(payrollItems.payrollId, payroll.id))
      .orderBy(asc(payrollItems.createdAt));

    return items.map((item: any) => ({
      id: item.id,
      payrollId: item.payrollId,
      type: item.type,
      quantity: String(item.quantity),
      rate: String(item.rate),
      amount: String(item.amount),
      referenceId: item.referenceId,
      description: item.description,
      createdAt: item.createdAt,
    }));
  }

  /**
   * GET /api/v1/teachers/:id/payrolls
   * Get all payrolls for a specific teacher
   */
  async findTeacherPayrolls(teacherId: string, user: AuthUser): Promise<PayrollDto[]> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isOwner = user.teacherId === teacherId;

    if (!isSupervisor && !isOwner) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You can only view your own payroll records',
      });
    }

    const results = await this.db
      .select()
      .from(payrolls)
      .where(eq(payrolls.teacherId, teacherId))
      .orderBy(desc(payrolls.createdAt));

    return results.map((p: any) => ({
      id: p.id,
      teacherId: p.teacherId,
      academicTermId: p.academicTermId,
      status: p.status,
      totalAmount: String(p.totalAmount),
      finalizedAt: p.finalizedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }
}
