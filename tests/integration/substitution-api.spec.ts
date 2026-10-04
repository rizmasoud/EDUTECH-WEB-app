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
import { classes, schedules, classSessions, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { substitutionRequests, substitutionResponses } from '../../apps/api/src/infrastructure/database/schema/substitutions.schema';
import { attendanceRecords, teacherAttendanceRecords } from '../../apps/api/src/infrastructure/database/schema/attendance.schema';
import { lessonPlans, lessonPlanItems } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { applyMigrations } from '../helpers/migration-helper';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { SubstitutionService } from '../../apps/api/src/substitution/application/services/substitution.service';
import { SubstitutionController } from '../../apps/api/src/substitution/presentation/substitution.controller';
import { SessionGenerationService } from '../../apps/api/src/sessions/application/services/session-generation.service';
import { AttendanceService } from '../../apps/api/src/sessions/application/services/attendance.service';
import { SessionLifecycleService } from '../../apps/api/src/sessions/application/services/session-lifecycle.service';
import { SessionsController } from '../../apps/api/src/sessions/presentation/sessions.controller';
import { LessonPlanService } from '../../apps/api/src/education/application/services/lesson-plan.service';
import { LessonPlansController } from '../../apps/api/src/education/presentation/lesson-plans.controller';
import { ClassLessonPlansController } from '../../apps/api/src/education/presentation/class-lesson-plans.controller';
import { LessonPlanItemsController } from '../../apps/api/src/education/presentation/lesson-plan-items.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [
    SubstitutionController,
    SessionsController,
    LessonPlansController,
    ClassLessonPlansController,
    LessonPlanItemsController,
  ],
  providers: [
    SubstitutionService,
    SessionGenerationService,
    AttendanceService,
    SessionLifecycleService,
    LessonPlanService,
    AuthService,
    AuthGuard,
    RolesGuard,
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
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
  ],
})
class TestSubstitutionApiModule {}

describe('Substitution Management Integration Tests (Phase 9)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string; // assigned teacher of Class 1
  let teacherBToken: string; // substitute candidate (has skill)
  let teacherCToken: string; // substitute candidate (lacks skill)
  let teacherDToken: string; // substitute candidate (conflicted schedule)

  let supervisorAccountId: string;
  let teacherAAccountId: string;
  let teacherBAccountId: string;
  let teacherCAccountId: string;
  let teacherDAccountId: string;

  let teacherAId: string;
  let teacherBId: string;
  let teacherCId: string;
  let teacherDId: string;

  let book1Id: string;
  let book2Id: string;

  let term1Id: string;
  let class1Id: string;
  let classConflictId: string;

  let session1Id: string; // Target session on 2026-10-11 (Sunday), 10:00-12:00
  let session2Id: string;
  let lessonPlan1Id: string;
  let lessonPlan1ItemId: string;

  let student1Id: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const tokenService = new CryptoSessionTokenService();
    const rateLimiter = new MemoryLoginRateLimiter({ maxAttempts: 5, windowMs: 900000 });
    const auditService = new DrizzleSecurityAuditService(db);

    const authService = new AuthService(
      db,
      hasher,
      tokenService,
      rateLimiter,
      auditService,
    );

    // Seed roles
    await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // 1. Supervisor
    const supHash = await hasher.hash('SupervisorPass123!');
    const [supAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-01',
        passwordHash: supHash,
        isActive: true,
      })
      .returning();
    supervisorAccountId = supAccount.id;
    await db.insert(accountRoles).values({
      accountId: supervisorAccountId,
      roleId: (await db.select().from(roles).where(eq(roles.name, 'SUPERVISOR')))[0].id,
    });

    // 2. Teacher A (Assigned Teacher for Class 1)
    const [tA] = await db
      .insert(teachers)
      .values({
        firstName: 'Ali',
        lastName: 'Rezaei',
        baseRate: '100.00',
        isActive: true,
      })
      .returning();
    teacherAId = tA.id;
    const tchAHash = await hasher.hash('TeacherAPass123!');
    const [tchAAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-A',
        passwordHash: tchAHash,
        isActive: true,
      })
      .returning();
    teacherAAccountId = tchAAccount.id;
    await db.update(teachers).set({ accountId: teacherAAccountId }).where(eq(teachers.id, teacherAId));
    await db.insert(accountRoles).values({
      accountId: teacherAAccountId,
      roleId: (await db.select().from(roles).where(eq(roles.name, 'TEACHER')))[0].id,
    });

    // 3. Teacher B (Eligible Substitute with TeacherSkill for Book 1)
    const [tB] = await db
      .insert(teachers)
      .values({
        firstName: 'Sara',
        lastName: 'Ahmadi',
        baseRate: '120.00',
        isActive: true,
      })
      .returning();
    teacherBId = tB.id;
    const tchBHash = await hasher.hash('TeacherBPass123!');
    const [tchBAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-B',
        passwordHash: tchBHash,
        isActive: true,
      })
      .returning();
    teacherBAccountId = tchBAccount.id;
    await db.update(teachers).set({ accountId: teacherBAccountId }).where(eq(teachers.id, teacherBId));
    await db.insert(accountRoles).values({
      accountId: teacherBAccountId,
      roleId: (await db.select().from(roles).where(eq(roles.name, 'TEACHER')))[0].id,
    });

    // 4. Teacher C (Substitute candidate WITHOUT TeacherSkill for Book 1)
    const [tC] = await db
      .insert(teachers)
      .values({
        firstName: 'Hassan',
        lastName: 'Moradi',
        baseRate: '90.00',
        isActive: true,
      })
      .returning();
    teacherCId = tC.id;
    const tchCHash = await hasher.hash('TeacherCPass123!');
    const [tchCAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-C',
        passwordHash: tchCHash,
        isActive: true,
      })
      .returning();
    teacherCAccountId = tchCAccount.id;
    await db.update(teachers).set({ accountId: teacherCAccountId }).where(eq(teachers.id, teacherCId));
    await db.insert(accountRoles).values({
      accountId: teacherCAccountId,
      roleId: (await db.select().from(roles).where(eq(roles.name, 'TEACHER')))[0].id,
    });

    // 5. Teacher D (Substitute candidate WITH skill, but has conflicting session on 2026-10-11 at 10:00-12:00)
    const [tD] = await db
      .insert(teachers)
      .values({
        firstName: 'Zahra',
        lastName: 'Karimi',
        baseRate: '110.00',
        isActive: true,
      })
      .returning();
    teacherDId = tD.id;
    const tchDHash = await hasher.hash('TeacherDPass123!');
    const [tchDAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-D',
        passwordHash: tchDHash,
        isActive: true,
      })
      .returning();
    teacherDAccountId = tchDAccount.id;
    await db.update(teachers).set({ accountId: teacherDAccountId }).where(eq(teachers.id, teacherDId));
    await db.insert(accountRoles).values({
      accountId: teacherDAccountId,
      roleId: (await db.select().from(roles).where(eq(roles.name, 'TEACHER')))[0].id,
    });

    // Seed Books
    const [b1] = await db
      .insert(books)
      .values({
        name: 'Family and Friends 1',
        level: 'Beginner',
        sequenceOrder: 1,
        sessionCount: 20,
        isTerminal: false,
      })
      .returning();
    book1Id = b1.id;

    const [b2] = await db
      .insert(books)
      .values({
        name: 'Family and Friends 2',
        level: 'Elementary',
        sequenceOrder: 2,
        sessionCount: 20,
        isTerminal: false,
      })
      .returning();
    book2Id = b2.id;

    // TeacherSkills
    await db.insert(teacherSkills).values({ teacherId: teacherAId, bookId: book1Id });
    await db.insert(teacherSkills).values({ teacherId: teacherBId, bookId: book1Id });
    await db.insert(teacherSkills).values({ teacherId: teacherDId, bookId: book1Id });
    // Teacher C only has skill for Book 2
    await db.insert(teacherSkills).values({ teacherId: teacherCId, bookId: book2Id });

    // Seed Academic Term
    const [term1] = await db
      .insert(academicTerms)
      .values({
        name: 'Fall 2026',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        status: 'ACTIVE',
      })
      .returning();
    term1Id = term1.id;

    // Seed Class 1 (Taught by Teacher A, Book 1)
    const [cls1] = await db
      .insert(classes)
      .values({
        academicTermId: term1Id,
        bookId: book1Id,
        teacherId: teacherAId,
        classType: 'REGULAR',
        capacity: 12,
        status: 'ACTIVE',
      })
      .returning();
    class1Id = cls1.id;

    // Seed Schedule for Class 1 (Sunday = 0, 10:00 - 12:00)
    const [sch1] = await db
      .insert(schedules)
      .values({
        classId: class1Id,
        dayOfWeek: 0,
        startTime: '10:00',
        endTime: '12:00',
      })
      .returning();

    // Target Class Session on 2026-10-11 (Sunday)
    const [sess1] = await db
      .insert(classSessions)
      .values({
        classId: class1Id,
        scheduleId: sch1.id,
        sessionDate: '2026-10-11',
        startTime: '10:00',
        endTime: '12:00',
        status: 'SCHEDULED',
      })
      .returning();
    session1Id = sess1.id;

    // Another Session on 2026-10-18
    const [sess2] = await db
      .insert(classSessions)
      .values({
        classId: class1Id,
        scheduleId: sch1.id,
        sessionDate: '2026-10-18',
        startTime: '10:00',
        endTime: '12:00',
        status: 'SCHEDULED',
      })
      .returning();
    session2Id = sess2.id;

    // Class for Teacher D with conflict on 2026-10-11 at 10:30-11:30
    const [clsConf] = await db
      .insert(classes)
      .values({
        academicTermId: term1Id,
        bookId: book1Id,
        teacherId: teacherDId,
        classType: 'REGULAR',
        capacity: 10,
        status: 'ACTIVE',
      })
      .returning();
    classConflictId = clsConf.id;

    await db.insert(classSessions).values({
      classId: classConflictId,
      sessionDate: '2026-10-11',
      startTime: '10:30',
      endTime: '11:30',
      status: 'SCHEDULED',
    });

    // Seed Student & Enrollment in Class 1
    const [st1] = await db
      .insert(students)
      .values({
        firstName: 'Arman',
        lastName: 'Nouri',
        isActive: true,
      })
      .returning();
    student1Id = st1.id;

    await db.insert(enrollments).values({
      classId: class1Id,
      studentId: student1Id,
      status: 'ACTIVE',
    });

    // Seed Lesson Plan for Class 1 (APPROVED)
    const [lp1] = await db
      .insert(lessonPlans)
      .values({
        classId: class1Id,
        teacherId: teacherAId,
        status: 'APPROVED',
        approvedAt: new Date(),
      })
      .returning();
    lessonPlan1Id = lp1.id;

    const [lpi1] = await db
      .insert(lessonPlanItems)
      .values({
        lessonPlanId: lessonPlan1Id,
        title: 'Unit 1: Introductions',
        description: 'Practice greeting dialogs',
        completed: false,
      })
      .returning();
    lessonPlan1ItemId = lpi1.id;

    // Log in all accounts to generate tokens
    const supLogin = await authService.login({ personnelCode: 'SUP-01', password: 'SupervisorPass123!' }, { userAgent: 'test', ipAddress: '127.0.0.1' });
    supervisorToken = supLogin.rawToken;

    const tchALogin = await authService.login({ personnelCode: 'TCH-A', password: 'TeacherAPass123!' }, { userAgent: 'test', ipAddress: '127.0.0.1' });
    teacherAToken = tchALogin.rawToken;

    const tchBLogin = await authService.login({ personnelCode: 'TCH-B', password: 'TeacherBPass123!' }, { userAgent: 'test', ipAddress: '127.0.0.1' });
    teacherBToken = tchBLogin.rawToken;

    const tchCLogin = await authService.login({ personnelCode: 'TCH-C', password: 'TeacherCPass123!' }, { userAgent: 'test', ipAddress: '127.0.0.1' });
    teacherCToken = tchCLogin.rawToken;

    const tchDLogin = await authService.login({ personnelCode: 'TCH-D', password: 'TeacherDPass123!' }, { userAgent: 'test', ipAddress: '127.0.0.1' });
    teacherDToken = tchDLogin.rawToken;

    app = await NestFactory.create(TestSubstitutionApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  let createdRequestId: string;

  describe('1. Substitution Request Creation', () => {
    it('should reject unauthenticated request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSessionId: session1Id }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('should reject unauthorized teacher (Teacher B trying to request for Class 1 session)', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({ classSessionId: session1Id }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('should allow assigned Teacher A to create substitution request for session 1', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ classSessionId: session1Id }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.classSessionId, session1Id);
      assert.strictEqual(data.status, 'REQUESTED');
      assert.strictEqual(data.approvedTeacherId, null);
      assert.strictEqual(data.classSession.id, session1Id);
      assert.strictEqual(data.classSession.class.teacherId, teacherAId);
      createdRequestId = data.id;

      // Verify audit log
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, createdRequestId),
            eq(auditLogs.action, 'CREATE_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
    });

    it('should reject duplicate active substitution request for the same session', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ classSessionId: session1Id }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'DUPLICATE_REQUEST');
    });
  });

  describe('2. Teacher Discovery & Eligibility Rules', () => {
    it('Teacher A (assigned teacher) is ineligible (cannot substitute own class)', async () => {
      const subService = new SubstitutionService(db);
      const { isEligible, ineligibilityReason } = await subService.evaluateTeacherEligibility(
        teacherAId,
        session1Id,
      );
      assert.strictEqual(isEligible, false);
      assert.ok(ineligibilityReason?.includes('assigned teacher'));
    });

    it('Teacher B is eligible (active, qualified with TeacherSkill, no conflict)', async () => {
      const subService = new SubstitutionService(db);
      const { isEligible } = await subService.evaluateTeacherEligibility(
        teacherBId,
        session1Id,
      );
      assert.strictEqual(isEligible, true);
    });

    it('Teacher C is ineligible (lacks TeacherSkill for Book 1)', async () => {
      const subService = new SubstitutionService(db);
      const { isEligible, ineligibilityReason } = await subService.evaluateTeacherEligibility(
        teacherCId,
        session1Id,
      );
      assert.strictEqual(isEligible, false);
      assert.ok(ineligibilityReason?.includes('lacks the required qualification') || ineligibilityReason?.includes('Teacher lacks required'));
    });

    it('Teacher D is ineligible (has overlapping session conflict on 2026-10-11)', async () => {
      const subService = new SubstitutionService(db);
      const { isEligible, ineligibilityReason } = await subService.evaluateTeacherEligibility(
        teacherDId,
        session1Id,
      );
      assert.strictEqual(isEligible, false);
      assert.ok(ineligibilityReason?.includes('overlapping'));
    });
  });

  describe('3. Broadcast Substitution Request', () => {
    it('should forbid non-supervisor (Teacher A) from broadcasting', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(res.status, 403);
    });

    it('should allow Supervisor to broadcast substitution request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, createdRequestId);
      assert.strictEqual(data.status, 'BROADCASTED');

      // Verify audit record
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, createdRequestId),
            eq(auditLogs.action, 'BROADCAST_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
    });

    it('should reject repeated broadcast once already BROADCASTED', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_STATE');
    });
  });

  describe('4. Teacher Response (ACCEPT / DECLINE)', () => {
    it('should forbid ineligible Teacher C (missing skill) from responding', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherCToken}`,
        },
        body: JSON.stringify({ response: 'ACCEPT' }),
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INELIGIBLE_TEACHER');
    });

    it('should forbid ineligible Teacher D (scheduling conflict) from responding', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherDToken}`,
        },
        body: JSON.stringify({ response: 'ACCEPT' }),
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INELIGIBLE_TEACHER');
    });

    it('should allow eligible Teacher B to submit ACCEPT response and transition status to RESPONDED', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({ response: 'ACCEPT' }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'RESPONDED');
      assert.strictEqual(data.responses.length, 1);
      assert.strictEqual(data.responses[0].teacherId, teacherBId);
      assert.strictEqual(data.responses[0].response, 'ACCEPT');

      // Verify audit record
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, createdRequestId),
            eq(auditLogs.action, 'RESPOND_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
    });

    it('should prevent duplicate response from the same teacher', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({ response: 'DECLINE' }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'DUPLICATE_RESPONSE');
    });
  });

  describe('5. Read / List Endpoints & Authorization Boundaries', () => {
    it('Supervisor should see all requests', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.some((r) => r.id === createdRequestId));
    });

    it('Teacher A (requester) should see their request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.some((r) => r.id === createdRequestId));
    });

    it('Teacher B (responder) should see the request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.some((r) => r.id === createdRequestId));
    });

    it('Unrelated ineligible Teacher C should be forbidden from getting request by ID', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}`, {
        headers: { Authorization: `Bearer ${teacherCToken}` },
      });
      assert.strictEqual(res.status, 403);
    });
  });

  describe('6. Supervisor Selection & Approval with Real-time Eligibility Re-check', () => {
    it('should forbid non-supervisor from approving substitution request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({ teacherId: teacherBId }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('should reject approval if selected teacher is ineligible (e.g. Teacher C)', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ teacherId: teacherCId }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INELIGIBLE_TEACHER');
    });

    it('should successfully approve Teacher B as substitute for session 1', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ teacherId: teacherBId }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'APPROVED');
      assert.strictEqual(data.approvedTeacherId, teacherBId);
      assert.strictEqual(data.approvedTeacher.firstName, 'Sara');

      // Verify audit record
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, createdRequestId),
            eq(auditLogs.action, 'APPROVE_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
      assert.strictEqual(log.metadata.approvedTeacherId, teacherBId);
    });

    it('should reject repeated approval on already APPROVED request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${createdRequestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({ teacherId: teacherBId }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_STATE');
    });
  });

  describe('7. Session-Level Substitute Responsibility & Class Ownership Invariance', () => {
    it('Permanent class teacher MUST remain unchanged (Ali Rezaei / Teacher A)', async () => {
      const [cls] = await db.select().from(classes).where(eq(classes.id, class1Id));
      assert.strictEqual(cls.teacherId, teacherAId);
    });

    it('Permanent schedule MUST remain unchanged', async () => {
      const [sch] = await db.select().from(schedules).where(eq(schedules.classId, class1Id));
      assert.strictEqual(sch.dayOfWeek, 0);
    });
  });

  describe('8. Attendance Responsibility Integration', () => {
    it('Substitute Teacher B can view student attendance for substituted Session 1', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session1Id}/attendance`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
    });

    it('Substitute Teacher B CAN record student attendance for substituted Session 1', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session1Id}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({
          items: [{ studentId: student1Id, status: 'PRESENT' }],
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.recordedCount, 1);
    });

    it('Substitute Teacher B CANNOT record student attendance for non-substituted Session 2', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session2Id}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
        body: JSON.stringify({
          items: [{ studentId: student1Id, status: 'PRESENT' }],
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    it('Supervisor can record teacher attendance specifying the approved substitute Teacher B for Session 1', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session1Id}/teacher-attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          teacherId: teacherBId,
          status: 'PRESENT',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.teacherId, teacherBId);
      assert.strictEqual(data.status, 'PRESENT');
    });

    it('Supervisor CANNOT record teacher attendance for an unapproved teacher (Teacher C) on Session 1', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session1Id}/teacher-attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          teacherId: teacherCId,
          status: 'PRESENT',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_TEACHER_ASSIGNMENT');
    });
  });

  describe('9. Lesson Plan Visibility for Approved Substitute', () => {
    it('Substitute Teacher B receives READ-ONLY visibility into Lesson Plan of Class 1', async () => {
      const res = await fetch(`${baseUrl}/lesson-plans/${lessonPlan1Id}`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, lessonPlan1Id);
      assert.strictEqual(data.classId, class1Id);
      assert.strictEqual(data.teacherId, teacherAId); // Ownership remains with Teacher A
      assert.strictEqual(data.items.length, 1);
    });

    it('Substitute Teacher B CANNOT modify lesson plan items (cannot update, submit, or complete items)', async () => {
      // Trying to complete an item
      const res = await fetch(`${baseUrl}/lesson-plan-items/${lessonPlan1ItemId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
      });

      assert.strictEqual(res.status, 403);
    });

    it('Assigned Teacher A still maintains their permissions to complete lesson plan items', async () => {
      const res = await fetch(`${baseUrl}/lesson-plan-items/${lessonPlan1ItemId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.completed, true);
    });
  });

  describe('10. Session Completion & Substitution Lifecycle Transition to COMPLETED', () => {
    it('Substitute Teacher B can complete the substituted Session 1', async () => {
      const res = await fetch(`${baseUrl}/sessions/${session1Id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherBToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'COMPLETED');

      // SubstitutionRequest status transitions to COMPLETED
      const [req] = await db
        .select()
        .from(substitutionRequests)
        .where(eq(substitutionRequests.id, createdRequestId));
      assert.strictEqual(req.status, 'COMPLETED');
    });
  });

  describe('11. Rejection & Cancellation Workflows', () => {
    let reqToRejectId: string;
    let reqToCancelId: string;

    before(async () => {
      // Create request for Session 2
      const [r1] = await db
        .insert(substitutionRequests)
        .values({
          classSessionId: session2Id,
          requestedBy: teacherAAccountId,
          status: 'REQUESTED',
        })
        .returning();
      reqToRejectId = r1.id;

      // Create another session on 2026-10-25 and request for it
      const [sess3] = await db
        .insert(classSessions)
        .values({
          classId: class1Id,
          sessionDate: '2026-10-25',
          startTime: '10:00',
          endTime: '12:00',
          status: 'SCHEDULED',
        })
        .returning();

      const [r2] = await db
        .insert(substitutionRequests)
        .values({
          classSessionId: sess3.id,
          requestedBy: teacherAAccountId,
          status: 'REQUESTED',
        })
        .returning();
      reqToCancelId = r2.id;
    });

    it('Supervisor can reject a substitution request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${reqToRejectId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'REJECTED');

      // Verify audit record
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, reqToRejectId),
            eq(auditLogs.action, 'REJECT_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
    });

    it('Requester (Teacher A) can cancel their substitution request', async () => {
      const res = await fetch(`${baseUrl}/substitution-requests/${reqToCancelId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'CANCELLED');

      // Verify audit record
      const [log] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, 'SUBSTITUTION_REQUEST'),
            eq(auditLogs.entityId, reqToCancelId),
            eq(auditLogs.action, 'CANCEL_SUBSTITUTION_REQUEST'),
          ),
        );
      assert.ok(log);
    });
  });
});
