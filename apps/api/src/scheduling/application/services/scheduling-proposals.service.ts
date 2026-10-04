import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, sql, inArray, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  classes,
  enrollments,
  schedules,
} from '../../../infrastructure/database/schema/classes.schema';
import { teachers, teacherSkills } from '../../../infrastructure/database/schema/teachers.schema';
import { schedulingProposals } from '../../../infrastructure/database/schema/scheduling.schema';
import {
  SCHEDULING_PROPOSAL_REPOSITORY,
  SCHEDULING_ENGINE,
} from '../../domain/tokens';
import type { ISchedulingProposalRepository } from '../../domain/repositories/scheduling-proposal.repository.interface';
import { SchedulingEngine } from '../../domain/engine/scheduling.engine';
import { SchedulingProposal } from '../../domain/entities/scheduling-proposal.entity';
import { TimeSlot } from '../../domain/value-objects/time-slot.vo';
import { FridayUnavailableConstraint } from '../../domain/constraints/friday-unavailable.constraint';
import { TimeValidityConstraint } from '../../domain/constraints/time-validity.constraint';
import { TeacherOverlapConstraint } from '../../domain/constraints/teacher-overlap.constraint';
import { ClassOverlapConstraint } from '../../domain/constraints/class-overlap.constraint';
import { TeacherSkillConstraint } from '../../domain/constraints/teacher-skill.constraint';
import { ClassCapacityConstraint } from '../../domain/constraints/class-capacity.constraint';
import { StudentConflictConstraint } from '../../domain/constraints/student-conflict.constraint';
import { SchedulingDayPolicy } from '../../domain/policies/scheduling-day.policy';
import {
  GenerateSchedulingProposalSchema,
  ModifySchedulingProposalSchema,
  type GenerateSchedulingProposalDto,
  type ModifySchedulingProposalDto,
  type SchedulingProposalDto,
  type FindSchedulingProposalsFilter,
  type AcceptProposalResponseDto,
  type ValidateProposalResponseDto,
  type ProposedClassScheduleDto,
  type SchedulingProposalDataDto,
  type PaginatedResult,
  type AuthUser,
  type SchedulingConflictDto,
  type PreferenceEvaluationReport,
} from '@edutech/shared';
import type {
  SchedulingGlobalContext,
  SchedulingClassInfo,
  ExistingClassSchedule,
  TeacherSkillInfo,
} from '../../domain/engine/scheduling-context.interface';

@Injectable()
export class SchedulingProposalsService {
  constructor(
    @Inject(SCHEDULING_PROPOSAL_REPOSITORY)
    private readonly proposalRepo: ISchedulingProposalRepository,
    @Inject(SCHEDULING_ENGINE)
    private readonly engine: SchedulingEngine,
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapToDto(proposal: SchedulingProposal): SchedulingProposalDto {
    return proposal.toDto();
  }

  private async loadGlobalSchedulingContext(
    academicTermId?: string,
    classIds?: string[],
  ): Promise<SchedulingGlobalContext> {
    const conditions: SQL[] = [];
    if (academicTermId) {
      conditions.push(eq(classes.academicTermId, academicTermId));
    }
    if (classIds && classIds.length > 0) {
      conditions.push(inArray(classes.id, classIds));
    }

    const classRecords = await this.db
      .select()
      .from(classes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (classRecords.length === 0) {
      return {
        classes: [],
        allExistingSchedules: [],
        teacherSkills: [],
      };
    }

    const selectedClassIds = classRecords.map((c: any) => c.id);

    // Load active enrollments for these classes
    const enrollmentRecords = await this.db
      .select({
        classId: enrollments.classId,
        studentId: enrollments.studentId,
      })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.classId, selectedClassIds),
          eq(enrollments.status, 'ACTIVE'),
        ),
      );

    const classEnrollmentsMap = new Map<string, string[]>();
    for (const enr of enrollmentRecords) {
      const list = classEnrollmentsMap.get(enr.classId) || [];
      list.push(enr.studentId);
      classEnrollmentsMap.set(enr.classId, list);
    }

    // Load all existing schedules in the database (to check overlaps)
    const scheduleRecords = await this.db
      .select({
        id: schedules.id,
        classId: schedules.classId,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        teacherId: classes.teacherId,
      })
      .from(schedules)
      .innerJoin(classes, eq(schedules.classId, classes.id));

    // For each schedule, find which students are enrolled in that class
    const allScheduleClassIds: string[] = Array.from(
      new Set(scheduleRecords.map((s: any) => s.classId as string)),
    );
    const allEnrollmentRecords = allScheduleClassIds.length > 0
      ? await this.db
          .select({
            classId: enrollments.classId,
            studentId: enrollments.studentId,
          })
          .from(enrollments)
          .where(
            and(
              inArray(enrollments.classId, allScheduleClassIds),
              eq(enrollments.status, 'ACTIVE'),
            ),
          )
      : [];

    const allClassStudentsMap = new Map<string, string[]>();
    for (const e of allEnrollmentRecords) {
      const list = allClassStudentsMap.get(e.classId) || [];
      list.push(e.studentId);
      allClassStudentsMap.set(e.classId, list);
    }

    const allExistingSchedules: ExistingClassSchedule[] = scheduleRecords.map((s: any) => ({
      id: s.id,
      classId: s.classId,
      teacherId: s.teacherId,
      slot: new TimeSlot(s.dayOfWeek, s.startTime, s.endTime),
      enrolledStudentIds: allClassStudentsMap.get(s.classId) || [],
    }));

    // Load teacher skills
    const teacherIds: string[] = Array.from(
      new Set(classRecords.map((c: any) => c.teacherId as string).filter(Boolean)),
    );

    const skillRecords = teacherIds.length > 0
      ? await this.db
          .select({
            teacherId: teacherSkills.teacherId,
            bookId: teacherSkills.bookId,
          })
          .from(teacherSkills)
          .where(inArray(teacherSkills.teacherId, teacherIds))
      : [];

    const schedulingClasses: SchedulingClassInfo[] = classRecords.map((c: any) => ({
      id: c.id,
      academicTermId: c.academicTermId,
      bookId: c.bookId,
      bookSegmentId: c.bookSegmentId,
      teacherId: c.teacherId,
      capacity: c.capacity,
      classType: c.classType,
      status: c.status,
      enrolledStudentIds: classEnrollmentsMap.get(c.id) || [],
    }));

    return {
      classes: schedulingClasses,
      allExistingSchedules,
      teacherSkills: skillRecords,
    };
  }

  async generate(
    input: GenerateSchedulingProposalDto,
    user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    const parseResult = GenerateSchedulingProposalSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const globalContext = await this.loadGlobalSchedulingContext(
      data.academicTermId,
      data.classIds,
    );

    if (globalContext.classes.length === 0) {
      throw new BadRequestException({
        code: 'NO_CLASSES_FOUND',
        message: 'No eligible classes found matching the specified parameters.',
      });
    }

    // Run pure scheduling engine, respecting allowFriday parameter
    const engineToUse = data.allowFriday
      ? new SchedulingEngine({
          hardConstraints: [
            new FridayUnavailableConstraint(new SchedulingDayPolicy({ allowFriday: true })),
            new TimeValidityConstraint(),
            new TeacherOverlapConstraint(),
            new ClassOverlapConstraint(),
            new TeacherSkillConstraint(),
            new ClassCapacityConstraint(),
            new StudentConflictConstraint(),
          ],
        })
      : this.engine;

    const engineResultsMap = engineToUse.evaluateMultipleClasses(globalContext);

    const proposedClasses: ProposedClassScheduleDto[] = [];
    const allConflicts: SchedulingConflictDto[] = [];
    const allPreferences: PreferenceEvaluationReport[] = [];
    const explanations: string[] = [];

    let validCount = 0;

    for (const cls of globalContext.classes) {
      const result = engineResultsMap.get(cls.id);
      if (!result) continue;

      if (result.recommendedSlot) {
        validCount++;
        proposedClasses.push({
          classId: cls.id,
          teacherId: cls.teacherId,
          dayOfWeek: result.recommendedSlot.dayOfWeek,
          startTime: result.recommendedSlot.startTime,
          endTime: result.recommendedSlot.endTime,
          score: result.recommendedSlot.score,
          isValid: true,
          hardConstraintReports: result.recommendedSlot.hardConstraintReports,
          preferenceReports: result.recommendedSlot.preferenceReports,
          conflicts: result.recommendedSlot.conflicts,
        });
        allPreferences.push(...result.recommendedSlot.preferenceReports.filter((p) => p.applied));
      } else {
        // Collect top candidate with conflicts
        const topCandidate = result.candidateSlots[0];
        proposedClasses.push({
          classId: cls.id,
          teacherId: cls.teacherId,
          dayOfWeek: topCandidate?.dayOfWeek ?? 0,
          startTime: topCandidate?.startTime ?? '08:00',
          endTime: topCandidate?.endTime ?? '09:30',
          score: topCandidate?.score ?? 0,
          isValid: false,
          hardConstraintReports: topCandidate?.hardConstraintReports ?? [],
          preferenceReports: topCandidate?.preferenceReports ?? [],
          conflicts: result.conflicts,
        });
      }

      allConflicts.push(...result.conflicts);
      explanations.push(result.explanation.summary);
    }

    const proposalData: SchedulingProposalDataDto = {
      classes: proposedClasses,
      conflicts: allConflicts,
      preferences: allPreferences,
      explanations,
      evaluatedClassCount: globalContext.classes.length,
      validClassCount: validCount,
    };

    const createdProposal = await this.proposalRepo.create({
      academicTermId: data.academicTermId ?? null,
      createdBy: user.id ?? null,
      status: 'PENDING_REVIEW',
      data: proposalData,
    });

    return this.mapToDto(createdProposal);
  }

  async findAll(
    filter?: FindSchedulingProposalsFilter,
  ): Promise<PaginatedResult<SchedulingProposalDto>> {
    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 20));

    const result = await this.proposalRepo.findAll({
      academicTermId: filter?.academicTermId,
      status: filter?.status,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((p) => this.mapToDto(p)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string): Promise<SchedulingProposalDto> {
    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Scheduling proposal with id ${id} not found`,
      });
    }

    return this.mapToDto(proposal);
  }

  async validate(id: string): Promise<ValidateProposalResponseDto> {
    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Scheduling proposal with id ${id} not found`,
      });
    }

    // Re-evaluate proposal against current DB state
    const classIds = proposal.data.classes.map((c) => c.classId);
    const globalContext = await this.loadGlobalSchedulingContext(
      proposal.academicTermId ?? undefined,
      classIds,
    );

    // Filter out schedules belonging to classes being rescheduled in this proposal
    const externalSchedules = globalContext.allExistingSchedules.filter(
      (s) => !classIds.includes(s.classId),
    );
    const accumulatedSchedules: ExistingClassSchedule[] = [...externalSchedules];

    const revalidatedClasses: ProposedClassScheduleDto[] = [];
    const newConflicts: SchedulingConflictDto[] = [];
    let isStillValid = true;

    for (const proposed of proposal.data.classes) {
      if (!proposed.isValid) {
        revalidatedClasses.push(proposed);
        newConflicts.push(...proposed.conflicts);
        continue;
      }

      const clsInfo = globalContext.classes.find((c) => c.id === proposed.classId);
      if (!clsInfo) {
        isStillValid = false;
        newConflicts.push({
          code: 'CLASS_INACTIVE' as any,
          severity: 'HARD_CONSTRAINT' as any,
          classId: proposed.classId,
          message: `Class ${proposed.classId} no longer exists or was removed.`,
        });
        continue;
      }

      const slot = new TimeSlot(proposed.dayOfWeek, proposed.startTime, proposed.endTime);

      // Build single-class context from accumulated state
      const existingTeacherSchedules = clsInfo.teacherId
        ? accumulatedSchedules.filter(
            (s) => s.teacherId === clsInfo.teacherId && s.classId !== clsInfo.id,
          )
        : [];

      const existingClassSchedules = accumulatedSchedules.filter(
        (s) => s.classId === clsInfo.id,
      );

      const existingStudentSchedules = new Map();
      for (const studentId of clsInfo.enrolledStudentIds) {
        const studentSchedules = accumulatedSchedules.filter(
          (s) => s.classId !== clsInfo.id && s.enrolledStudentIds?.includes(studentId),
        );
        existingStudentSchedules.set(studentId, studentSchedules);
      }

      const teacherSkills = globalContext.teacherSkills.filter(
        (ts) => ts.teacherId === clsInfo.teacherId,
      );

      const evalResult = this.engine.evaluateSlot(slot, {
        classInfo: clsInfo,
        existingClassSchedules,
        existingTeacherSchedules,
        existingStudentSchedules,
        teacherSkills,
      });

      if (!evalResult.isValid) {
        isStillValid = false;
        newConflicts.push(...evalResult.conflicts);
      } else {
        accumulatedSchedules.push({
          id: `proposed-${clsInfo.id}-${slot.dayOfWeek}`,
          classId: clsInfo.id,
          teacherId: clsInfo.teacherId,
          slot,
          enrolledStudentIds: clsInfo.enrolledStudentIds,
        });
      }

      revalidatedClasses.push({
        ...proposed,
        isValid: evalResult.isValid,
        hardConstraintReports: evalResult.hardConstraintReports,
        preferenceReports: evalResult.preferenceReports,
        conflicts: evalResult.conflicts,
      });
    }

    const updatedData: SchedulingProposalDataDto = {
      ...proposal.data,
      classes: revalidatedClasses,
      conflicts: newConflicts,
    };

    return {
      proposalId: proposal.id,
      status: proposal.status,
      isStillValid,
      conflicts: newConflicts,
      data: updatedData,
    };
  }

  async accept(id: string, _user: AuthUser): Promise<AcceptProposalResponseDto> {
    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Scheduling proposal with id ${id} not found`,
      });
    }

    if (proposal.isTerminal()) {
      throw new BadRequestException({
        code: 'PROPOSAL_ALREADY_COMMITTED',
        message: `Proposal is in terminal status ${proposal.status} and cannot be accepted.`,
      });
    }

    // Validate current authoritative state
    const validation = await this.validate(id);
    if (!validation.isStillValid) {
      throw new BadRequestException({
        code: 'PROPOSAL_STALE_OR_INVALID',
        message: 'Proposal is no longer valid against current database state. Please regenerate or modify.',
        details: { conflicts: validation.conflicts },
      });
    }

    // Execute atomic, transactional commit of all proposed schedules
    return await this.db.transaction(async (tx: any) => {
      // Concurrency lock: update status under condition
      const [lockedProposal] = await tx
        .update(schedulingProposals)
        .set({
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schedulingProposals.id, id),
            inArray(schedulingProposals.status, ['PENDING_REVIEW', 'MODIFIED']),
          ),
        )
        .returning();

      if (!lockedProposal) {
        throw new BadRequestException({
          code: 'CONCURRENT_ACCEPTANCE_CONFLICT',
          message: 'Proposal was already accepted or is in an incompatible status.',
        });
      }

      const createdScheduleIds: string[] = [];

      for (const proposed of proposal.data.classes) {
        if (!proposed.isValid) continue;

        // Clean any old schedule for this class in tx
        await tx.delete(schedules).where(eq(schedules.classId, proposed.classId));

        // Insert new approved schedule in tx
        const [created] = await tx
          .insert(schedules)
          .values({
            classId: proposed.classId,
            dayOfWeek: proposed.dayOfWeek,
            startTime: proposed.startTime,
            endTime: proposed.endTime,
          })
          .returning();

        createdScheduleIds.push(created.id);
      }

      return {
        proposalId: id,
        status: 'ACCEPTED',
        committedSchedulesCount: createdScheduleIds.length,
        scheduleIds: createdScheduleIds,
        acceptedAt: lockedProposal.acceptedAt,
      };
    });
  }

  async reject(id: string, _user: AuthUser): Promise<SchedulingProposalDto> {
    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Scheduling proposal with id ${id} not found`,
      });
    }

    if (proposal.isTerminal()) {
      throw new BadRequestException({
        code: 'PROPOSAL_ALREADY_COMMITTED',
        message: `Proposal is in terminal status ${proposal.status} and cannot be rejected.`,
      });
    }

    const updated = await this.proposalRepo.update(id, {
      status: 'REJECTED',
      rejectedAt: new Date(),
    });

    return this.mapToDto(updated);
  }

  async modify(
    id: string,
    input: ModifySchedulingProposalDto,
    _user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    const parseResult = ModifySchedulingProposalSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Scheduling proposal with id ${id} not found`,
      });
    }

    if (!proposal.canBeModified()) {
      throw new BadRequestException({
        code: 'PROPOSAL_CANNOT_BE_MODIFIED',
        message: `Proposal in status ${proposal.status} cannot be modified.`,
      });
    }

    const data = parseResult.data;
    const updatedClasses = [...proposal.data.classes];

    if (data.classes && data.classes.length > 0) {
      for (const updated of data.classes) {
        const idx = updatedClasses.findIndex((c) => c.classId === updated.classId);
        if (idx >= 0) {
          updatedClasses[idx] = {
            ...updatedClasses[idx],
            ...updated,
          };
        } else {
          updatedClasses.push(updated);
        }
      }
    } else if (data.classId) {
      const idx = updatedClasses.findIndex((c) => c.classId === data.classId);
      if (idx >= 0) {
        updatedClasses[idx] = {
          ...updatedClasses[idx],
          dayOfWeek: data.dayOfWeek !== undefined ? data.dayOfWeek : updatedClasses[idx].dayOfWeek,
          startTime: data.startTime !== undefined ? data.startTime : updatedClasses[idx].startTime,
          endTime: data.endTime !== undefined ? data.endTime : updatedClasses[idx].endTime,
        };
      }
    }

    const newData: SchedulingProposalDataDto = {
      ...proposal.data,
      classes: updatedClasses,
    };

    proposal.modify(newData);

    const saved = await this.proposalRepo.update(id, {
      status: proposal.status,
      data: proposal.data,
      updatedAt: proposal.updatedAt,
    });

    return this.mapToDto(saved);
  }
}
