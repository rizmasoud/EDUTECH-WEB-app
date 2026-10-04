import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  classes,
  classSessions,
} from '../../../infrastructure/database/schema/classes.schema';
import {
  teachers,
} from '../../../infrastructure/database/schema/teachers.schema';
import {
  lessonPlans,
  lessonPlanItems,
} from '../../../infrastructure/database/schema/education.schema';
import {
  syllabi,
  syllabusItems,
} from '../../../infrastructure/database/schema/academics.schema';
import { substitutionRequests } from '../../../infrastructure/database/schema/substitutions.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import {
  CreateLessonPlanSchema,
  UpdateLessonPlanSchema,
  RejectLessonPlanSchema,
} from '@edutech/shared';
import type {
  CreateLessonPlanDto,
  UpdateLessonPlanDto,
  RejectLessonPlanDto,
  LessonPlanDetailDto,
  LessonPlanItemDto,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class LessonPlanService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Helper to verify user permissions for a class (direct assigned teacher or supervisor).
   * Used for mutations like create, update, submit.
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
      message: 'You do not have permission to access lesson plans for this class',
    });
  }

  /**
   * Helper to verify read access to a lesson plan for a class.
   * Supervisors, assigned class teachers, and approved substitute teachers on sessions of this class can view.
   */
  private async assertClassReadAccess(classId: string, classTeacherId: string | null, user: AuthUser) {
    if (user.roles.includes('SUPERVISOR')) {
      return;
    }

    if (user.roles.includes('TEACHER') && user.teacherId) {
      // 1. Direct class assigned teacher
      if (classTeacherId === user.teacherId) {
        return;
      }

      // 2. Approved substitute teacher on any session of this class
      const [approvedSub] = await this.db
        .select({ id: substitutionRequests.id })
        .from(substitutionRequests)
        .innerJoin(
          classSessions,
          eq(substitutionRequests.classSessionId, classSessions.id),
        )
        .where(
          and(
            eq(classSessions.classId, classId),
            eq(substitutionRequests.approvedTeacherId, user.teacherId),
            eq(substitutionRequests.status, 'APPROVED'),
          ),
        )
        .limit(1);

      if (approvedSub) {
        return;
      }
    }

    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to view lesson plans for this class',
    });
  }

  /**
   * Helper to load items for a lesson plan
   */
  private async loadItems(lessonPlanId: string): Promise<LessonPlanItemDto[]> {
    const items = await this.db
      .select()
      .from(lessonPlanItems)
      .where(eq(lessonPlanItems.lessonPlanId, lessonPlanId))
      .orderBy(lessonPlanItems.createdAt);

    return items.map((i: any) => ({
      id: i.id,
      lessonPlanId: i.lessonPlanId,
      syllabusItemId: i.syllabusItemId,
      title: i.title,
      description: i.description,
      completed: i.completed,
      completedAt: i.completedAt,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  /**
   * POST /api/v1/classes/:classId/lesson-plans
   */
  async create(
    classId: string,
    dto: CreateLessonPlanDto,
    user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
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

    const parseResult = CreateLessonPlanSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    let targetTeacherId = cls.teacherId;
    if (user.roles.includes('SUPERVISOR') && data.teacherId) {
      const [t] = await this.db
        .select()
        .from(teachers)
        .where(eq(teachers.id, data.teacherId))
        .limit(1);
      if (!t) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Teacher with id ${data.teacherId} not found`,
        });
      }
      targetTeacherId = data.teacherId;
    } else if (user.roles.includes('TEACHER') && user.teacherId) {
      targetTeacherId = user.teacherId;
    }

    if (!targetTeacherId) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'A valid teacherId is required to create a lesson plan',
      });
    }

    const createdId = await this.db.transaction(async (tx: any) => {
      const [plan] = await tx
        .insert(lessonPlans)
        .values({
          classId,
          teacherId: targetTeacherId,
          status: 'DRAFT',
        })
        .returning();

      if (data.initialItems && data.initialItems.length > 0) {
        for (const item of data.initialItems) {
          await tx.insert(lessonPlanItems).values({
            lessonPlanId: plan.id,
            title: item.title,
            description: item.description || null,
            syllabusItemId: item.syllabusItemId || null,
            completed: false,
          });
        }
      } else if (data.copySyllabusItems !== false) {
        // Automatically populate from canonical syllabus items if available (default true when initialItems is omitted)
        let syllabusQuery = tx
          .select()
          .from(syllabi)
          .where(eq(syllabi.bookId, cls.bookId));

        if (cls.bookSegmentId) {
          syllabusQuery = tx
            .select()
            .from(syllabi)
            .where(
              and(
                eq(syllabi.bookId, cls.bookId),
                eq(syllabi.bookSegmentId, cls.bookSegmentId),
              ),
            );
        }

        const [canonicalSyllabus] = await syllabusQuery.limit(1);

        if (canonicalSyllabus) {
          const sItems = await tx
            .select()
            .from(syllabusItems)
            .where(eq(syllabusItems.syllabusId, canonicalSyllabus.id))
            .orderBy(syllabusItems.sequenceOrder);

          for (const sItem of sItems) {
            await tx.insert(lessonPlanItems).values({
              lessonPlanId: plan.id,
              title: sItem.title,
              description: sItem.description,
              syllabusItemId: sItem.id,
              completed: false,
            });
          }
        }
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_LESSON_PLAN',
        entityType: 'LESSON_PLAN',
        entityId: plan.id,
        metadata: {
          classId,
          teacherId: targetTeacherId,
          status: 'DRAFT',
        },
      });

      return plan.id;
    });

    return this.findOne(createdId, user);
  }

  /**
   * GET /api/v1/classes/:classId/lesson-plans
   */
  async findByClass(classId: string, user: AuthUser): Promise<LessonPlanDetailDto[]> {
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

    await this.assertClassReadAccess(cls.id, cls.teacherId, user);

    const plans = await this.db
      .select({
        id: lessonPlans.id,
        classId: lessonPlans.classId,
        teacherId: lessonPlans.teacherId,
        status: lessonPlans.status,
        submittedAt: lessonPlans.submittedAt,
        approvedAt: lessonPlans.approvedAt,
        createdAt: lessonPlans.createdAt,
        updatedAt: lessonPlans.updatedAt,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
      })
      .from(lessonPlans)
      .innerJoin(teachers, eq(lessonPlans.teacherId, teachers.id))
      .where(eq(lessonPlans.classId, classId))
      .orderBy(desc(lessonPlans.createdAt));

    const result: LessonPlanDetailDto[] = [];
    for (const p of plans) {
      const items = await this.loadItems(p.id);
      result.push({
        id: p.id,
        classId: p.classId,
        teacherId: p.teacherId,
        status: p.status,
        submittedAt: p.submittedAt,
        approvedAt: p.approvedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        class: {
          id: cls.id,
          academicTermId: cls.academicTermId,
          bookId: cls.bookId,
          bookSegmentId: cls.bookSegmentId,
          classType: cls.classType,
          status: cls.status,
        },
        teacher: {
          id: p.teacherId,
          firstName: p.teacherFirstName,
          lastName: p.teacherLastName,
        },
        items,
      });
    }

    return result;
  }

  /**
   * GET /api/v1/lesson-plans/:id
   */
  async findOne(id: string, user: AuthUser): Promise<LessonPlanDetailDto> {
    const [plan] = await this.db
      .select({
        id: lessonPlans.id,
        classId: lessonPlans.classId,
        teacherId: lessonPlans.teacherId,
        status: lessonPlans.status,
        submittedAt: lessonPlans.submittedAt,
        approvedAt: lessonPlans.approvedAt,
        createdAt: lessonPlans.createdAt,
        updatedAt: lessonPlans.updatedAt,
        classAcademicTermId: classes.academicTermId,
        classBookId: classes.bookId,
        classBookSegmentId: classes.bookSegmentId,
        classType: classes.classType,
        classStatus: classes.status,
        classTeacherId: classes.teacherId,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
      })
      .from(lessonPlans)
      .innerJoin(classes, eq(lessonPlans.classId, classes.id))
      .innerJoin(teachers, eq(lessonPlans.teacherId, teachers.id))
      .where(eq(lessonPlans.id, id))
      .limit(1);

    if (!plan) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Lesson plan with id ${id} not found`,
      });
    }

    await this.assertClassReadAccess(
      plan.classId,
      plan.classTeacherId,
      user,
    );

    const items = await this.loadItems(id);

    return {
      id: plan.id,
      classId: plan.classId,
      teacherId: plan.teacherId,
      status: plan.status,
      submittedAt: plan.submittedAt,
      approvedAt: plan.approvedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      class: {
        id: plan.classId,
        academicTermId: plan.classAcademicTermId,
        bookId: plan.classBookId,
        bookSegmentId: plan.classBookSegmentId,
        classType: plan.classType,
        status: plan.classStatus,
      },
      teacher: {
        id: plan.teacherId,
        firstName: plan.teacherFirstName,
        lastName: plan.teacherLastName,
      },
      items,
    };
  }

  /**
   * PATCH /api/v1/lesson-plans/:id
   */
  async update(
    id: string,
    dto: UpdateLessonPlanDto,
    user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    const existing = await this.findOne(id, user);

    // Only direct assigned teacher or supervisor can mutate lesson plan
    this.assertClassAccess(
      { id: existing.classId, teacherId: existing.teacherId },
      user,
    );

    if (existing.status === 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot modify an APPROVED lesson plan. Approved plans are immutable.',
      });
    }

    if (existing.status === 'SUBMITTED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot modify a SUBMITTED lesson plan. It must be reviewed or rejected first.',
      });
    }

    const parseResult = UpdateLessonPlanSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    await this.db.transaction(async (tx: any) => {
      if (data.items !== undefined) {
        await tx
          .delete(lessonPlanItems)
          .where(eq(lessonPlanItems.lessonPlanId, id));

        for (const item of data.items) {
          await tx.insert(lessonPlanItems).values({
            lessonPlanId: id,
            title: item.title,
            description: item.description || null,
            syllabusItemId: item.syllabusItemId || null,
            completed: false,
          });
        }
      }

      await tx
        .update(lessonPlans)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(lessonPlans.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_LESSON_PLAN',
        entityType: 'LESSON_PLAN',
        entityId: id,
        metadata: {
          itemCount: data.items?.length,
          status: existing.status,
        },
      });
    });

    return this.findOne(id, user);
  }

  /**
   * POST /api/v1/lesson-plans/:id/submit
   */
  async submit(id: string, user: AuthUser): Promise<LessonPlanDetailDto> {
    const existing = await this.findOne(id, user);

    // Only direct assigned teacher or supervisor can submit lesson plan
    this.assertClassAccess(
      { id: existing.classId, teacherId: existing.teacherId },
      user,
    );

    if (existing.status === 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot submit an already APPROVED lesson plan.',
      });
    }

    if (existing.status === 'SUBMITTED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Lesson plan is already SUBMITTED.',
      });
    }

    if (!existing.items || existing.items.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot submit an empty lesson plan. Add at least one item.',
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(lessonPlans)
        .set({
          status: 'SUBMITTED',
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(lessonPlans.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'SUBMIT_LESSON_PLAN',
        entityType: 'LESSON_PLAN',
        entityId: id,
        metadata: {
          previousStatus: existing.status,
          newStatus: 'SUBMITTED',
        },
      });
    });

    return this.findOne(id, user);
  }

  /**
   * POST /api/v1/lesson-plans/:id/approve (SUPERVISOR only)
   */
  async approve(id: string, user: AuthUser): Promise<LessonPlanDetailDto> {
    if (!user.roles.includes('SUPERVISOR')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can approve lesson plans',
      });
    }

    const existing = await this.findOne(id, user);

    if (existing.status === 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Lesson plan is already APPROVED.',
      });
    }

    if (existing.status !== 'SUBMITTED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: `Only SUBMITTED lesson plans can be approved. Current status is ${existing.status}.`,
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(lessonPlans)
        .set({
          status: 'APPROVED',
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(lessonPlans.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'APPROVE_LESSON_PLAN',
        entityType: 'LESSON_PLAN',
        entityId: id,
        metadata: {
          previousStatus: 'SUBMITTED',
          newStatus: 'APPROVED',
        },
      });
    });

    return this.findOne(id, user);
  }

  /**
   * POST /api/v1/lesson-plans/:id/reject (SUPERVISOR only)
   */
  async reject(
    id: string,
    dto: RejectLessonPlanDto,
    user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    if (!user.roles.includes('SUPERVISOR')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can reject lesson plans',
      });
    }

    const parseResult = RejectLessonPlanSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const existing = await this.findOne(id, user);

    if (existing.status === 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Cannot reject an already APPROVED lesson plan.',
      });
    }

    if (existing.status !== 'SUBMITTED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: `Only SUBMITTED lesson plans can be rejected. Current status is ${existing.status}.`,
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(lessonPlans)
        .set({
          status: 'REJECTED',
          updatedAt: new Date(),
        })
        .where(eq(lessonPlans.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'REJECT_LESSON_PLAN',
        entityType: 'LESSON_PLAN',
        entityId: id,
        metadata: {
          previousStatus: 'SUBMITTED',
          newStatus: 'REJECTED',
          reason: parseResult.data?.reason || null,
        },
      });
    });

    return this.findOne(id, user);
  }

  /**
   * POST /api/v1/lesson-plan-items/:id/complete
   */
  async completeItem(itemId: string, user: AuthUser): Promise<LessonPlanItemDto> {
    const [item] = await this.db
      .select({
        id: lessonPlanItems.id,
        lessonPlanId: lessonPlanItems.lessonPlanId,
        syllabusItemId: lessonPlanItems.syllabusItemId,
        title: lessonPlanItems.title,
        description: lessonPlanItems.description,
        completed: lessonPlanItems.completed,
        completedAt: lessonPlanItems.completedAt,
        createdAt: lessonPlanItems.createdAt,
        updatedAt: lessonPlanItems.updatedAt,
        planStatus: lessonPlans.status,
        classId: lessonPlans.classId,
        classTeacherId: classes.teacherId,
      })
      .from(lessonPlanItems)
      .innerJoin(lessonPlans, eq(lessonPlanItems.lessonPlanId, lessonPlans.id))
      .innerJoin(classes, eq(lessonPlans.classId, classes.id))
      .where(eq(lessonPlanItems.id, itemId))
      .limit(1);

    if (!item) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Lesson plan item with id ${itemId} not found`,
      });
    }

    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isAssignedTeacher =
      user.roles.includes('TEACHER') &&
      Boolean(user.teacherId) &&
      user.teacherId === item.classTeacherId;

    if (!isSupervisor && !isAssignedTeacher) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only assigned teachers or supervisors can complete lesson plan items',
      });
    }

    if (item.planStatus !== 'APPROVED') {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: `Only items of an APPROVED lesson plan can be marked as complete. Current plan status is ${item.planStatus}.`,
      });
    }

    // Idempotent: If already completed, return existing state without changing completedAt
    if (item.completed) {
      return {
        id: item.id,
        lessonPlanId: item.lessonPlanId,
        syllabusItemId: item.syllabusItemId,
        title: item.title,
        description: item.description,
        completed: item.completed,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(lessonPlanItems)
        .set({
          completed: true,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(lessonPlanItems.id, itemId));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'COMPLETE_LESSON_PLAN_ITEM',
        entityType: 'LESSON_PLAN_ITEM',
        entityId: itemId,
        metadata: {
          lessonPlanId: item.lessonPlanId,
          classId: item.classId,
          completed: true,
          completedAt: now,
        },
      });
    });

    return {
      id: item.id,
      lessonPlanId: item.lessonPlanId,
      syllabusItemId: item.syllabusItemId,
      title: item.title,
      description: item.description,
      completed: true,
      completedAt: now,
      createdAt: item.createdAt,
      updatedAt: now,
    };
  }
}
