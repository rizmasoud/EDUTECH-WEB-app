import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers, teacherSkills } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, enrollments, schedules } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { schedulingProposals } from '../../apps/api/src/infrastructure/database/schema/scheduling.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import { applyMigrations } from '../helpers/migration-helper';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { SchedulesController } from '../../apps/api/src/scheduling/presentation/schedules.controller';
import { SchedulingProposalsController } from '../../apps/api/src/scheduling/presentation/scheduling-proposals.controller';
import { SchedulesService } from '../../apps/api/src/scheduling/application/services/schedules.service';
import { SchedulingProposalsService } from '../../apps/api/src/scheduling/application/services/scheduling-proposals.service';
import { DrizzleScheduleRepository } from '../../apps/api/src/scheduling/infrastructure/drizzle-schedule.repository';
import { DrizzleSchedulingProposalRepository } from '../../apps/api/src/scheduling/infrastructure/drizzle-scheduling-proposal.repository';
import { SchedulingEngine } from '../../apps/api/src/scheduling/domain/engine/scheduling.engine';
import { SchedulingDayPolicy } from '../../apps/api/src/scheduling/domain/policies/scheduling-day.policy';
import { SchedulingCapacityPolicy } from '../../apps/api/src/scheduling/domain/policies/scheduling-capacity.policy';
import { DefaultCandidateGenerator } from '../../apps/api/src/scheduling/domain/engine/default-candidate-generator';
import {
  SCHEDULING_ENGINE,
  SCHEDULING_DAY_POLICY,
  SCHEDULING_CAPACITY_POLICY,
  CANDIDATE_GENERATOR,
  SCHEDULE_REPOSITORY,
  SCHEDULING_PROPOSAL_REPOSITORY,
} from '../../apps/api/src/scheduling/domain/tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { count, eq } from 'drizzle-orm';
import { DayOfWeek } from '@edutech/shared';

let sharedDb: any;

@Module({
  controllers: [SchedulesController, SchedulingProposalsController],
  providers: [
    SchedulesService,
    SchedulingProposalsService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: DrizzleScheduleRepository,
    },
    {
      provide: SCHEDULING_PROPOSAL_REPOSITORY,
      useClass: DrizzleSchedulingProposalRepository,
    },
    {
      provide: SCHEDULING_DAY_POLICY,
      useClass: SchedulingDayPolicy,
    },
    {
      provide: SCHEDULING_CAPACITY_POLICY,
      useClass: SchedulingCapacityPolicy,
    },
    {
      provide: CANDIDATE_GENERATOR,
      useClass: DefaultCandidateGenerator,
    },
    {
      provide: SCHEDULING_ENGINE,
      useFactory: () => new SchedulingEngine(),
    },
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: ScryptPasswordHasher,
    },
    {
      provide: SESSION_TOKEN_SERVICE,
      useClass: CryptoSessionTokenService,
    },
    {
      provide: LOGIN_RATE_LIMITER,
      useClass: MemoryLoginRateLimiter,
    },
    {
      provide: SECURITY_AUDIT_SERVICE,
      useClass: DrizzleSecurityAuditService,
    },
  ],
})
class TestSchedulingModule {}

describe('Scheduling Proposals & Schedules API Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacherToken: string;

  let termId: string;
  let qualifiedBookId: string;
  let unqualifiedBookId: string;
  let teacher1Id: string;
  let student1Id: string;
  let student2Id: string;
  let class1Id: string;
  let class2Id: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const tokenService = new CryptoSessionTokenService();
    const rateLimiter = new MemoryLoginRateLimiter({ maxAttempts: 5, windowMs: 900000 });
    const auditService = new DrizzleSecurityAuditService(db);

    authService = new AuthService(
      db,
      hasher,
      tokenService,
      rateLimiter,
      auditService,
    );

    // Roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // Accounts
    const supHash = await hasher.hash('SupervisorPass123!');
    const [supAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-01',
        passwordHash: supHash,
        isActive: true,
      })
      .returning();
    await db.insert(accountRoles).values({
      accountId: supAccount.id,
      roleId: supRole.id,
    });

    const tchHash = await hasher.hash('TeacherPass123!');
    const [tchAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-01',
        passwordHash: tchHash,
        isActive: true,
      })
      .returning();
    await db.insert(accountRoles).values({
      accountId: tchAccount.id,
      roleId: tchRole.id,
    });

    const [t1] = await db.insert(teachers).values({
      accountId: tchAccount.id,
      firstName: 'Hamid',
      lastName: 'Souriyan',
      baseRate: '150.00',
      isActive: true,
    }).returning();
    teacher1Id = t1.id;

    const supLogin = await authService.login({
      personnelCode: 'SUP-01',
      password: 'SupervisorPass123!',
    });
    supervisorToken = supLogin.rawToken;

    const tchLogin = await authService.login({
      personnelCode: 'TCH-01',
      password: 'TeacherPass123!',
    });
    teacherToken = tchLogin.rawToken;

    // Academic reference data
    const [term] = await db.insert(academicTerms).values({
      name: 'Spring 2026',
      startDate: '2026-04-15',
      endDate: '2026-07-15',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [bQualified] = await db.insert(books).values({
      name: 'English Level 1',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    qualifiedBookId = bQualified.id;

    const [bUnqualified] = await db.insert(books).values({
      name: 'Advanced Business English',
      level: 'C1',
      sequenceOrder: 6,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    unqualifiedBookId = bUnqualified.id;

    // Teacher skill: Teacher 1 qualified only for English Level 1
    await db.insert(teacherSkills).values({
      teacherId: teacher1Id,
      bookId: qualifiedBookId,
    });

    // Students
    const [s1] = await db.insert(students).values({
      firstName: 'Ali',
      lastName: 'Daei',
      isActive: true,
    }).returning();
    student1Id = s1.id;

    const [s2] = await db.insert(students).values({
      firstName: 'Karim',
      lastName: 'Bagheri',
      isActive: true,
    }).returning();
    student2Id = s2.id;

    // Class 1 (Teacher 1 assigned, qualified)
    const [c1] = await db.insert(classes).values({
      academicTermId: termId,
      bookId: qualifiedBookId,
      teacherId: teacher1Id,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 12,
    }).returning();
    class1Id = c1.id;

    // Class 2 (Another class with student 1 enrolled)
    const [c2] = await db.insert(classes).values({
      academicTermId: termId,
      bookId: qualifiedBookId,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 12,
    }).returning();
    class2Id = c2.id;

    // Enroll students in Class 1
    await db.insert(enrollments).values([
      { classId: class1Id, studentId: student1Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student2Id, status: 'ACTIVE' },
      { classId: class2Id, studentId: student1Id, status: 'ACTIVE' }, // student 1 also in class 2
    ]);

    app = await NestFactory.create(TestSchedulingModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  describe('1. Manual Schedule CRUD & Hard Constraints', () => {
    let createdScheduleId: string;

    it('rejects schedule on Friday by default (FRIDAY_UNAVAILABLE)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.FRIDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'FRIDAY_UNAVAILABLE');
    });

    it('rejects schedule with invalid time range start >= end (INVALID_TIME_RANGE)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '10:00',
          endTime: '09:30',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_TIME_RANGE');
    });

    it('successfully creates valid schedule for Class 1', async () => {
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.classId, class1Id);
      assert.equal(body.dayOfWeek, DayOfWeek.SUNDAY);
      assert.equal(body.startTime, '08:00');
      assert.equal(body.endTime, '09:30');
      createdScheduleId = body.id;
    });

    it('rejects contradictory overlapping schedule for the same class (CLASS_OVERLAP)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '08:30',
          endTime: '10:00',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'CLASS_OVERLAP');
    });

    it('rejects schedule for another class with same teacher at overlapping time (TEACHER_OVERLAP)', async () => {
      // Create Class 3 assigned to Teacher 1
      const [c3] = await db.insert(classes).values({
        academicTermId: termId,
        bookId: qualifiedBookId,
        teacherId: teacher1Id,
        classType: 'REGULAR',
        status: 'DRAFT',
        capacity: 12,
      }).returning();

      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: c3.id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'TEACHER_OVERLAP');
    });

    it('rejects schedule causing student conflict (STUDENT_CONFLICT)', async () => {
      // Class 2 has Student 1 enrolled. Class 1 has Student 1 and schedule Sunday 08:00-09:30.
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class2Id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '09:00',
          endTime: '10:30', // overlaps 08:00-09:30
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'STUDENT_CONFLICT');
    });

    it('rejects teacher assignment without required TeacherSkill (UNQUALIFIED_TEACHER)', async () => {
      // Class with unqualified book for Teacher 1
      const [cUnqualified] = await db.insert(classes).values({
        academicTermId: termId,
        bookId: unqualifiedBookId,
        teacherId: teacher1Id,
        classType: 'REGULAR',
        status: 'DRAFT',
        capacity: 12,
      }).returning();

      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: cUnqualified.id,
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: '14:00',
          endTime: '15:30',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'UNQUALIFIED_TEACHER');
    });

    it('updates schedule and allows revalidation without self-conflict', async () => {
      // Create dedicated schedule for update test
      const createRes = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });
      const created = await createRes.json();

      const res = await fetch(`${baseUrl}/api/v1/schedules/${created.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '11:30',
          endTime: '13:00',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.dayOfWeek, DayOfWeek.MONDAY);
      assert.equal(body.startTime, '11:30');
      assert.equal(body.endTime, '13:00');
    });

    it('deletes schedule successfully', async () => {
      // Create dedicated schedule for delete test
      const createRes = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.WEDNESDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });
      const created = await createRes.json();

      const res = await fetch(`${baseUrl}/api/v1/schedules/${created.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 200);

      // Verify deletion in database
      const [deleted] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.id, created.id));
      assert.equal(deleted, undefined);
    });

    it('forbids teacher from mutating schedules', async () => {
      const res = await fetch(`${baseUrl}/api/v1/schedules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '08:00',
          endTime: '09:30',
        }),
      });

      assert.equal(res.status, 403);
    });
  });

  describe('2. Scheduling Proposals Lifecycle & Transactional Acceptance', () => {
    let proposalId: string;

    it('generates proposal using pure domain engine and persists it as PENDING_REVIEW', async () => {
      const res = await fetch(`${baseUrl}/api/v1/scheduling/proposals`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          academicTermId: termId,
        }),
      });

      assert.equal(res.status, 201);
      const proposal = await res.json();
      assert.ok(proposal.id);
      assert.equal(proposal.status, 'PENDING_REVIEW');
      assert.ok(proposal.data.classes.length > 0);
      assert.ok(proposal.data.evaluatedClassCount > 0);
      proposalId = proposal.id;
    });

    it('retrieves proposal by ID', async () => {
      const res = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${proposalId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 200);
      const proposal = await res.json();
      assert.equal(proposal.id, proposalId);
      assert.equal(proposal.status, 'PENDING_REVIEW');
    });

    it('validates proposal on-demand against current DB state', async () => {
      const res = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${proposalId}/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 200);
      const validation = await res.json();
      assert.equal(validation.proposalId, proposalId);
      assert.equal(typeof validation.isStillValid, 'boolean');
    });

    it('transactionally accepts proposal: commits schedules and marks proposal ACCEPTED', async () => {
      const [initSchedulesCount] = await db.select({ val: count() }).from(schedules);

      const res = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${proposalId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 200);
      const commitResult = await res.json();
      assert.equal(commitResult.proposalId, proposalId);
      assert.equal(commitResult.status, 'ACCEPTED');
      assert.ok(commitResult.committedSchedulesCount > 0);
      assert.ok(commitResult.scheduleIds.length > 0);

      // Verify schedules created in DB
      const [afterSchedulesCount] = await db.select({ val: count() }).from(schedules);
      assert.ok(afterSchedulesCount.val > initSchedulesCount.val);

      // Verify proposal status in DB
      const [savedProposal] = await db
        .select()
        .from(schedulingProposals)
        .where(eq(schedulingProposals.id, proposalId));
      assert.equal(savedProposal.status, 'ACCEPTED');
      assert.ok(savedProposal.acceptedAt);
    });

    it('idempotency: prevents double-acceptance of an already committed proposal', async () => {
      const res = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${proposalId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'PROPOSAL_ALREADY_COMMITTED');
    });

    it('rejects proposal and protects terminal states', async () => {
      // 1. Generate new proposal
      const createRes = await fetch(`${baseUrl}/api/v1/scheduling/proposals`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          academicTermId: termId,
        }),
      });
      const newProp = await createRes.json();

      // 2. Reject proposal
      const rejectRes = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${newProp.id}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.equal(rejectRes.status, 200);
      const rejectedProp = await rejectRes.json();
      assert.equal(rejectedProp.status, 'REJECTED');

      // 3. Trying to accept rejected proposal throws 400
      const acceptRes = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${newProp.id}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.equal(acceptRes.status, 400);
      const body = await acceptRes.json();
      assert.equal(body.error.code, 'PROPOSAL_ALREADY_COMMITTED');
    });

    it('modifies proposal and transitions status to MODIFIED', async () => {
      // 1. Generate new proposal
      const createRes = await fetch(`${baseUrl}/api/v1/scheduling/proposals`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          academicTermId: termId,
        }),
      });
      const prop = await createRes.json();
      assert.equal(prop.status, 'PENDING_REVIEW');

      // 2. Modify proposal
      const modRes = await fetch(`${baseUrl}/api/v1/scheduling/proposals/${prop.id}/modify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: class1Id,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: '10:00',
          endTime: '11:30',
        }),
      });
      assert.equal(modRes.status, 200);
      const modProp = await modRes.json();
      assert.equal(modProp.status, 'MODIFIED');
      const modClass = modProp.data.classes.find((c: any) => c.classId === class1Id);
      assert.equal(modClass.dayOfWeek, DayOfWeek.MONDAY);
      assert.equal(modClass.startTime, '10:00');
      assert.equal(modClass.endTime, '11:30');
    });
  });
});
