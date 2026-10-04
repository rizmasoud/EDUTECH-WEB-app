import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  substitutionRequests,
  substitutionResponses,
} from '../../../infrastructure/database/schema/substitutions.schema';
import {
  classSessions,
  classes,
  schedules,
} from '../../../infrastructure/database/schema/classes.schema';
import {
  teachers,
  teacherSkills,
} from '../../../infrastructure/database/schema/teachers.schema';
import { accounts } from '../../../infrastructure/database/schema/auth.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateSubstitutionRequestSchema,
  RespondSubstitutionSchema,
  ApproveSubstitutionSchema,
} from '@edutech/shared';
import type {
  CreateSubstitutionRequestDto,
  RespondSubstitutionDto,
  ApproveSubstitutionDto,
  SubstitutionRequestDto,
  SubstitutionRequestDetailDto,
  SubstitutionCandidateDto,
  AuthUser,
} from '@edutech/shared';
import { TimeSlot } from '../../../scheduling/domain/value-objects/time-slot.vo';
import { TimeRange } from '../../../scheduling/domain/value-objects/time-range.vo';

@Injectable()
export class SubstitutionService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Helper: Determine the day of week (0 = Sunday, ..., 6 = Saturday) from a YYYY-MM-DD string
   */
  private getDayOfWeekFromDateString(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map((n) => parseInt(n, 10));
    const d = new Date(year, month - 1, day);
    return d.getDay();
  }

  /**
   * Helper: Check if a teacher is eligible for a specific class session.
   * Rules:
   * 1. Teacher must exist and be active.
   * 2. Teacher must not be the assigned class teacher (cannot substitute own class).
   * 3. Teacher must possess the TeacherSkill for the class's Book.
   * 4. Teacher must not have an active/scheduled class session or approved substitution at overlapping time on sessionDate.
   * 5. Teacher must not have an overlapping recurring schedule in another active class on that day of week.
   */
  async evaluateTeacherEligibility(
    teacherId: string,
    sessionId: string,
  ): Promise<{ isEligible: boolean; ineligibilityReason?: string }> {
    // Load target session with class
    const [session] = await this.db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        status: classSessions.status,
        classBookId: classes.bookId,
        classTeacherId: classes.teacherId,
        classAcademicTermId: classes.academicTermId,
        classStatus: classes.status,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(classSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return { isEligible: false, ineligibilityReason: 'Target session not found' };
    }

    // 1. Teacher active check
    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(eq(teachers.id, teacherId))
      .limit(1);

    if (!teacher) {
      return { isEligible: false, ineligibilityReason: 'Teacher not found' };
    }

    if (!teacher.isActive) {
      return { isEligible: false, ineligibilityReason: 'Teacher is not active' };
    }

    // 2. Cannot substitute own class
    if (session.classTeacherId === teacherId) {
      return {
        isEligible: false,
        ineligibilityReason: 'Teacher is already the assigned teacher for this class',
      };
    }

    // 3. TeacherSkill check (must have skill for the Book)
    const [skill] = await this.db
      .select()
      .from(teacherSkills)
      .where(
        and(
          eq(teacherSkills.teacherId, teacherId),
          eq(teacherSkills.bookId, session.classBookId),
        ),
      )
      .limit(1);

    if (!skill) {
      return {
        isEligible: false,
        ineligibilityReason: `Teacher lacks required qualification/skill for Book ${session.classBookId}`,
      };
    }

    // Target session time slot
    const targetRange = new TimeRange(session.startTime, session.endTime);
    const dayOfWeek = this.getDayOfWeekFromDateString(session.sessionDate);

    // 4. Overlapping sessions on the same date:
    // a) Sessions of classes taught by this teacher on sessionDate (status SCHEDULED or COMPLETED)
    const teacherAssignedSessions = await this.db
      .select({
        id: classSessions.id,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        status: classSessions.status,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.teacherId, teacherId),
          eq(classSessions.sessionDate, session.sessionDate),
          inArray(classSessions.status, ['SCHEDULED', 'COMPLETED']),
        ),
      );

    for (const s of teacherAssignedSessions) {
      if (s.id === sessionId) continue;
      const sRange = new TimeRange(s.startTime, s.endTime);
      if (targetRange.overlaps(sRange)) {
        return {
          isEligible: false,
          ineligibilityReason: `Teacher has an overlapping class session on ${session.sessionDate} (${s.startTime}-${s.endTime})`,
        };
      }
    }

    // b) Approved substitution requests for this teacher on sessionDate
    const approvedSubstitutions = await this.db
      .select({
        sessionId: classSessions.id,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
      })
      .from(substitutionRequests)
      .innerJoin(
        classSessions,
        eq(substitutionRequests.classSessionId, classSessions.id),
      )
      .where(
        and(
          eq(substitutionRequests.approvedTeacherId, teacherId),
          eq(substitutionRequests.status, 'APPROVED'),
          eq(classSessions.sessionDate, session.sessionDate),
          inArray(classSessions.status, ['SCHEDULED', 'COMPLETED']),
        ),
      );

    for (const sub of approvedSubstitutions) {
      if (sub.sessionId === sessionId) continue;
      const subRange = new TimeRange(sub.startTime, sub.endTime);
      if (targetRange.overlaps(subRange)) {
        return {
          isEligible: false,
          ineligibilityReason: `Teacher is already approved as substitute for an overlapping session on ${session.sessionDate} (${sub.startTime}-${sub.endTime})`,
        };
      }
    }

    // 5. Overlapping recurring schedules for this teacher
    const teacherSchedules = await this.db
      .select({
        id: schedules.id,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        startsOn: schedules.startsOn,
        endsOn: schedules.endsOn,
        classStatus: classes.status,
      })
      .from(schedules)
      .innerJoin(classes, eq(schedules.classId, classes.id))
      .where(
        and(
          eq(classes.teacherId, teacherId),
          eq(schedules.dayOfWeek, dayOfWeek),
          inArray(classes.status, ['ACTIVE', 'DRAFT']),
        ),
      );

    for (const sch of teacherSchedules) {
      if (sch.startsOn && session.sessionDate < sch.startsOn) continue;
      if (sch.endsOn && session.sessionDate > sch.endsOn) continue;
      const schRange = new TimeRange(sch.startTime, sch.endTime);
      if (targetRange.overlaps(schRange)) {
        return {
          isEligible: false,
          ineligibilityReason: `Teacher has a recurring schedule conflict on day ${dayOfWeek} (${sch.startTime}-${sch.endTime})`,
        };
      }
    }

    return { isEligible: true };
  }

  /**
   * Helper: Find all eligible teachers for a session
   */
  async findEligibleTeachersForSession(sessionId: string): Promise<SubstitutionCandidateDto[]> {
    const allTeachers = await this.db.select().from(teachers);
    const candidates: SubstitutionCandidateDto[] = [];

    for (const t of allTeachers) {
      const { isEligible, ineligibilityReason } = await this.evaluateTeacherEligibility(
        t.id,
        sessionId,
      );
      candidates.push({
        teacherId: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        baseRate: t.baseRate,
        isEligible,
        ineligibilityReason,
      });
    }

    return candidates;
  }

  /**
   * Helper: Load detailed SubstitutionRequest with related session, class, responses, etc.
   */
  async findOneDetail(id: string, user: AuthUser): Promise<SubstitutionRequestDetailDto> {
    const [req] = await this.db
      .select({
        id: substitutionRequests.id,
        classSessionId: substitutionRequests.classSessionId,
        requestedBy: substitutionRequests.requestedBy,
        status: substitutionRequests.status,
        approvedTeacherId: substitutionRequests.approvedTeacherId,
        approvedBy: substitutionRequests.approvedBy,
        approvedAt: substitutionRequests.approvedAt,
        createdAt: substitutionRequests.createdAt,
        updatedAt: substitutionRequests.updatedAt,
        requesterPersonnelCode: accounts.personnelCode,
        sessionDate: classSessions.sessionDate,
        sessionStartTime: classSessions.startTime,
        sessionEndTime: classSessions.endTime,
        sessionStatus: classSessions.status,
        classId: classSessions.classId,
        classAcademicTermId: classes.academicTermId,
        classBookId: classes.bookId,
        classTeacherId: classes.teacherId,
        classType: classes.classType,
        classStatus: classes.status,
      })
      .from(substitutionRequests)
      .innerJoin(accounts, eq(substitutionRequests.requestedBy, accounts.id))
      .innerJoin(
        classSessions,
        eq(substitutionRequests.classSessionId, classSessions.id),
      )
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    // RBAC: Supervisor can access any request. Teacher can access if they are the requester, or the class assigned teacher, or an eligible candidate/responder.
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      const isTeacher = user.roles.includes('TEACHER');
      if (!isTeacher || !user.teacherId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You are not authorized to view this substitution request',
        });
      }

      // Check if user is requester or assigned teacher or approved teacher
      const isRequester = req.requestedBy === user.id;
      const isAssigned = req.classTeacherId === user.teacherId;
      const isApproved = req.approvedTeacherId === user.teacherId;

      // Check if user has responded or is eligible
      const [userResponse] = await this.db
        .select()
        .from(substitutionResponses)
        .where(
          and(
            eq(substitutionResponses.requestId, id),
            eq(substitutionResponses.teacherId, user.teacherId),
          ),
        )
        .limit(1);

      const { isEligible } = await this.evaluateTeacherEligibility(
        user.teacherId,
        req.classSessionId,
      );

      if (!isRequester && !isAssigned && !isApproved && !userResponse && !isEligible) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You are not authorized to view this substitution request',
        });
      }
    }

    // Load responses
    const responsesList = await this.db
      .select({
        id: substitutionResponses.id,
        requestId: substitutionResponses.requestId,
        teacherId: substitutionResponses.teacherId,
        response: substitutionResponses.response,
        respondedAt: substitutionResponses.respondedAt,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
      })
      .from(substitutionResponses)
      .innerJoin(teachers, eq(substitutionResponses.teacherId, teachers.id))
      .where(eq(substitutionResponses.requestId, id))
      .orderBy(substitutionResponses.respondedAt);

    let approvedTeacherObj = null;
    if (req.approvedTeacherId) {
      const [appTeacher] = await this.db
        .select({
          id: teachers.id,
          firstName: teachers.firstName,
          lastName: teachers.lastName,
        })
        .from(teachers)
        .where(eq(teachers.id, req.approvedTeacherId))
        .limit(1);

      if (appTeacher) {
        approvedTeacherObj = appTeacher;
      }
    }

    return {
      id: req.id,
      classSessionId: req.classSessionId,
      requestedBy: req.requestedBy,
      status: req.status,
      approvedTeacherId: req.approvedTeacherId,
      approvedBy: req.approvedBy,
      approvedAt: req.approvedAt,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      requester: {
        id: req.requestedBy,
        personnelCode: req.requesterPersonnelCode,
      },
      classSession: {
        id: req.classSessionId,
        classId: req.classId,
        sessionDate: req.sessionDate,
        startTime: req.sessionStartTime,
        endTime: req.sessionEndTime,
        status: req.sessionStatus,
        class: {
          id: req.classId,
          academicTermId: req.classAcademicTermId,
          bookId: req.classBookId,
          teacherId: req.classTeacherId,
          classType: req.classType,
          status: req.classStatus,
        },
      },
      approvedTeacher: approvedTeacherObj,
      responses: responsesList.map((r: any) => ({
        id: r.id,
        requestId: r.requestId,
        teacherId: r.teacherId,
        response: r.response,
        respondedAt: r.respondedAt,
        teacher: {
          id: r.teacherId,
          firstName: r.teacherFirstName,
          lastName: r.teacherLastName,
        },
      })),
    };
  }

  /**
   * GET /api/v1/substitution-requests
   * Lists substitution requests with RBAC scoping
   */
  async findAll(user: AuthUser): Promise<SubstitutionRequestDetailDto[]> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isTeacher = user.roles.includes('TEACHER');

    const requests = await this.db
      .select({
        id: substitutionRequests.id,
        classSessionId: substitutionRequests.classSessionId,
        requestedBy: substitutionRequests.requestedBy,
        status: substitutionRequests.status,
        approvedTeacherId: substitutionRequests.approvedTeacherId,
        approvedBy: substitutionRequests.approvedBy,
        approvedAt: substitutionRequests.approvedAt,
        createdAt: substitutionRequests.createdAt,
        updatedAt: substitutionRequests.updatedAt,
      })
      .from(substitutionRequests)
      .orderBy(desc(substitutionRequests.createdAt));

    const results: SubstitutionRequestDetailDto[] = [];

    for (const r of requests) {
      try {
        const detail = await this.findOneDetail(r.id, user);
        results.push(detail);
      } catch (err) {
        // Excluded by RBAC check
        continue;
      }
    }

    return results;
  }

  /**
   * POST /api/v1/substitution-requests
   * Creates a new substitution request for a ClassSession
   */
  async create(
    dto: CreateSubstitutionRequestDto,
    user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    const parseResult = CreateSubstitutionRequestSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const { classSessionId } = parseResult.data;

    // Load session with class
    const [session] = await this.db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        sessionDate: classSessions.sessionDate,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
        status: classSessions.status,
        classTeacherId: classes.teacherId,
        classStatus: classes.status,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(eq(classSessions.id, classSessionId))
      .limit(1);

    if (!session) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class session with id ${classSessionId} not found`,
      });
    }

    if (session.status === 'CANCELLED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: 'Cannot request substitution for a cancelled session',
      });
    }

    // RBAC: Supervisor or assigned class teacher can request substitution
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isAssignedTeacher =
      user.roles.includes('TEACHER') &&
      Boolean(user.teacherId) &&
      user.teacherId === session.classTeacherId;

    if (!isSupervisor && !isAssignedTeacher) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors or the assigned teacher can request substitution for this session',
      });
    }

    // Check if there is already an active (non-terminal) substitution request for this session
    const [existingActive] = await this.db
      .select()
      .from(substitutionRequests)
      .where(
        and(
          eq(substitutionRequests.classSessionId, classSessionId),
          inArray(substitutionRequests.status, [
            'REQUESTED',
            'BROADCASTED',
            'RESPONDED',
            'APPROVED',
          ]),
        ),
      )
      .limit(1);

    if (existingActive) {
      throw new BadRequestException({
        code: 'DUPLICATE_REQUEST',
        message: `An active substitution request (${existingActive.id}) already exists for this session in status ${existingActive.status}`,
      });
    }

    const createdId = await this.db.transaction(async (tx: any) => {
      const [req] = await tx
        .insert(substitutionRequests)
        .values({
          classSessionId,
          requestedBy: user.id,
          status: 'REQUESTED',
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: req.id,
        metadata: {
          classSessionId,
          requestedBy: user.id,
          status: 'REQUESTED',
        },
      });

      return req.id;
    });

    return this.findOneDetail(createdId, user);
  }

  /**
   * POST /api/v1/substitution-requests/:id/broadcast
   * Broadcasts request to eligible teachers and transitions status: REQUESTED -> BROADCASTED
   */
  async broadcast(id: string, user: AuthUser): Promise<SubstitutionRequestDetailDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can broadcast substitution requests',
      });
    }

    const [req] = await this.db
      .select()
      .from(substitutionRequests)
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    if (req.status !== 'REQUESTED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot broadcast request in status ${req.status}. Only REQUESTED status can be broadcasted.`,
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(substitutionRequests)
        .set({
          status: 'BROADCASTED',
          updatedAt: new Date(),
        })
        .where(eq(substitutionRequests.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'BROADCAST_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: id,
        metadata: {
          previousStatus: 'REQUESTED',
          newStatus: 'BROADCASTED',
        },
      });
    });

    if (this.notificationService) {
      const candidates = await this.findEligibleTeachersForSession(req.classSessionId);
      for (const cand of candidates) {
        if (!cand.isEligible) continue;
        const [candTeacher] = await this.db
          .select({ accountId: teachers.accountId })
          .from(teachers)
          .where(eq(teachers.id, cand.teacherId))
          .limit(1);
        if (candTeacher?.accountId) {
          await this.notificationService.dispatchOperationalEvent(
            'SUBSTITUTION_REQUEST',
            candTeacher.accountId,
            'Substitution Opportunity',
            'A class session is open for substitution.',
            'SUBSTITUTION_REQUEST',
            id,
          );
        }
      }
    }

    return this.findOneDetail(id, user);
  }

  /**
   * POST /api/v1/substitution-requests/:id/respond
   * Teacher responds (ACCEPT | DECLINE) to a broadcasted substitution request.
   * Enforces:
   * 1. Teacher must be eligible.
   * 2. (request_id, teacher_id) unique constraint.
   * 3. Transitions status BROADCASTED -> RESPONDED on first response.
   */
  async respond(
    id: string,
    dto: RespondSubstitutionDto,
    user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    const parseResult = RespondSubstitutionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const isTeacher = user.roles.includes('TEACHER');
    if (!isTeacher || !user.teacherId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only teachers can respond to substitution requests',
      });
    }

    const [req] = await this.db
      .select()
      .from(substitutionRequests)
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    if (req.status !== 'BROADCASTED' && req.status !== 'RESPONDED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot respond to substitution request in status ${req.status}. Must be BROADCASTED or RESPONDED.`,
      });
    }

    // Check teacher eligibility
    const { isEligible, ineligibilityReason } = await this.evaluateTeacherEligibility(
      user.teacherId,
      req.classSessionId,
    );

    if (!isEligible) {
      throw new ForbiddenException({
        code: 'INELIGIBLE_TEACHER',
        message: `Teacher is not eligible to substitute for this session: ${ineligibilityReason}`,
      });
    }

    // Check existing response
    const [existingResp] = await this.db
      .select()
      .from(substitutionResponses)
      .where(
        and(
          eq(substitutionResponses.requestId, id),
          eq(substitutionResponses.teacherId, user.teacherId),
        ),
      )
      .limit(1);

    if (existingResp) {
      throw new BadRequestException({
        code: 'DUPLICATE_RESPONSE',
        message: `Teacher has already responded to this substitution request with ${existingResp.response}`,
      });
    }

    const { response } = parseResult.data;

    await this.db.transaction(async (tx: any) => {
      await tx.insert(substitutionResponses).values({
        requestId: id,
        teacherId: user.teacherId,
        response,
      });

      // If in BROADCASTED status, advance to RESPONDED
      if (req.status === 'BROADCASTED') {
        await tx
          .update(substitutionRequests)
          .set({
            status: 'RESPONDED',
            updatedAt: new Date(),
          })
          .where(eq(substitutionRequests.id, id));
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'RESPOND_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: id,
        metadata: {
          teacherId: user.teacherId,
          response,
        },
      });
    });

    return this.findOneDetail(id, user);
  }

  /**
   * POST /api/v1/substitution-requests/:id/approve
   * Supervisor selects and approves a teacher as substitute.
   * Enforces:
   * 1. Supervisor authorization only.
   * 2. Request status must be RESPONDED, BROADCASTED, or REQUESTED.
   * 3. Selected teacher must have ACCEPTED if responding via broadcast (or teacherId explicitly provided by supervisor).
   * 4. CRITICAL: Re-check eligibility at approval time!
   * 5. Atomically transitions request to APPROVED with approvedTeacherId, approvedBy, approvedAt.
   */
  async approve(
    id: string,
    dto: ApproveSubstitutionDto,
    user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can approve substitution requests',
      });
    }

    const parseResult = ApproveSubstitutionSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [req] = await this.db
      .select()
      .from(substitutionRequests)
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    if (
      req.status !== 'RESPONDED' &&
      req.status !== 'BROADCASTED' &&
      req.status !== 'REQUESTED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot approve substitution request in status '${req.status}'.`,
      });
    }

    // Determine target teacher
    let targetTeacherId = parseResult.data.teacherId;

    if (!targetTeacherId) {
      // If teacherId not explicitly passed in body, find an accepted response
      const acceptedResponses = await this.db
        .select()
        .from(substitutionResponses)
        .where(
          and(
            eq(substitutionResponses.requestId, id),
            eq(substitutionResponses.response, 'ACCEPT'),
          ),
        );

      if (acceptedResponses.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: 'No accepted teacher responses available to approve. Please specify teacherId.',
        });
      }

      if (acceptedResponses.length > 1) {
        throw new BadRequestException({
          code: 'AMBIGUOUS_SELECTION',
          message: 'Multiple teachers have accepted. Supervisor must explicitly specify teacherId.',
        });
      }

      targetTeacherId = acceptedResponses[0].teacherId;
    }

    const approvedTeacherId = targetTeacherId as string;

    // Check if target teacher has declined
    const [declineResp] = await this.db
      .select()
      .from(substitutionResponses)
      .where(
        and(
          eq(substitutionResponses.requestId, id),
          eq(substitutionResponses.teacherId, approvedTeacherId),
          eq(substitutionResponses.response, 'DECLINE'),
        ),
      )
      .limit(1);

    if (declineResp) {
      throw new BadRequestException({
        code: 'INVALID_SELECTION',
        message: 'Cannot approve a teacher who declined the substitution request',
      });
    }

    // CRITICAL: Re-check eligibility at approval time
    const { isEligible, ineligibilityReason } = await this.evaluateTeacherEligibility(
      approvedTeacherId,
      req.classSessionId,
    );

    if (!isEligible) {
      throw new BadRequestException({
        code: 'INELIGIBLE_TEACHER',
        message: `Selected teacher is no longer eligible: ${ineligibilityReason}`,
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(substitutionRequests)
        .set({
          status: 'APPROVED',
          approvedTeacherId: approvedTeacherId,
          approvedBy: user.id,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(substitutionRequests.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'APPROVE_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: id,
        metadata: {
          approvedTeacherId: approvedTeacherId,
          approvedBy: user.id,
          approvedAt: now,
          previousStatus: req.status,
          newStatus: 'APPROVED',
        },
      });
    });

    if (this.notificationService) {
      const [appTeacher] = await this.db
        .select({ accountId: teachers.accountId })
        .from(teachers)
        .where(eq(teachers.id, approvedTeacherId))
        .limit(1);
      if (appTeacher?.accountId) {
        await this.notificationService.dispatchOperationalEvent(
          'SUBSTITUTION_APPROVAL',
          appTeacher.accountId,
          'Substitution Approved',
          'You have been approved as substitute for a class session.',
          'SUBSTITUTION_REQUEST',
          id,
        );
      }
    }

    return this.findOneDetail(id, user);
  }

  /**
   * POST /api/v1/substitution-requests/:id/reject
   * Supervisor rejects substitution request.
   */
  async reject(id: string, user: AuthUser): Promise<SubstitutionRequestDetailDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can reject substitution requests',
      });
    }

    const [req] = await this.db
      .select()
      .from(substitutionRequests)
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    if (
      req.status === 'APPROVED' ||
      req.status === 'REJECTED' ||
      req.status === 'CANCELLED' ||
      req.status === 'COMPLETED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot reject a request that is already in '${req.status}' state`,
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(substitutionRequests)
        .set({
          status: 'REJECTED',
          updatedAt: new Date(),
        })
        .where(eq(substitutionRequests.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'REJECT_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: id,
        metadata: {
          previousStatus: req.status,
          newStatus: 'REJECTED',
        },
      });
    });

    return this.findOneDetail(id, user);
  }

  /**
   * POST /api/v1/substitution-requests/:id/cancel
   * Supervisor or requester cancels substitution request.
   */
  async cancel(id: string, user: AuthUser): Promise<SubstitutionRequestDetailDto> {
    const [req] = await this.db
      .select()
      .from(substitutionRequests)
      .where(eq(substitutionRequests.id, id))
      .limit(1);

    if (!req) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Substitution request with id ${id} not found`,
      });
    }

    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isRequester = req.requestedBy === user.id;

    if (!isSupervisor && !isRequester) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors or the original requester can cancel this substitution request',
      });
    }

    if (
      req.status === 'REJECTED' ||
      req.status === 'CANCELLED' ||
      req.status === 'COMPLETED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot cancel a request that is already in '${req.status}' state`,
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(substitutionRequests)
        .set({
          status: 'CANCELLED',
          updatedAt: new Date(),
        })
        .where(eq(substitutionRequests.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CANCEL_SUBSTITUTION_REQUEST',
        entityType: 'SUBSTITUTION_REQUEST',
        entityId: id,
        metadata: {
          previousStatus: req.status,
          newStatus: 'CANCELLED',
        },
      });
    });

    return this.findOneDetail(id, user);
  }
}
