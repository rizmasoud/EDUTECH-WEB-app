import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { applyMigrations } from '../helpers/migration-helper';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, schedules, classSessions, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { attendanceRecords, teacherAttendanceRecords } from '../../apps/api/src/infrastructure/database/schema/attendance.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { SessionsController } from '../../apps/api/src/sessions/presentation/sessions.controller';
import { SessionGenerationService } from '../../apps/api/src/sessions/application/services/session-generation.service';
import { AttendanceService } from '../../apps/api/src/sessions/application/services/attendance.service';
import { SessionLifecycleService } from '../../apps/api/src/sessions/application/services/session-lifecycle.service';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [SessionsController],
  providers: [
    SessionGenerationService,
    AttendanceService,
    SessionLifecycleService,
    AuthService,
    AuthGuard,
    RolesGuard,
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
class TestSessionsModule {}

describe('Sessions Generation & Query API Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacherToken: string;

  let termId: string;
  let bookId: string;
  let classId: string;
  let scheduleId: string;

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

    // Seed Roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // Seed Accounts
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

    const [tchProfile] = await db
      .insert(teachers)
      .values({
        accountId: tchAccount.id,
        firstName: 'Hamid',
        lastName: 'Souriyan',
        baseRate: '150.00',
        isActive: true,
      })
      .returning();

    // Authenticate
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

    // Academic Reference Data
    // Term range: 2026-04-15 to 2026-04-30
    const [term] = await db.insert(academicTerms).values({
      name: 'Spring Short Term 2026',
      startDate: '2026-04-15',
      endDate: '2026-04-30',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [book] = await db.insert(books).values({
      name: 'English Level 1',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    bookId = book.id;

    // Class (ACTIVE status so it is processed)
    const [cls] = await db.insert(classes).values({
      academicTermId: termId,
      bookId,
      teacherId: tchProfile.id,
      classType: 'REGULAR',
      status: 'ACTIVE',
      capacity: 12,
    }).returning();
    classId = cls.id;

    // Schedule: Sunday (0) 08:30-10:00
    const [sched] = await db.insert(schedules).values({
      classId,
      dayOfWeek: 0, // Sunday
      startTime: '08:30',
      endTime: '10:00',
    }).returning();
    scheduleId = sched.id;

    // Boot NestJS Application
    app = await NestFactory.create(TestSessionsModule);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
    await pg.close();
  });

  describe('POST /sessions/generate', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId }),
      });

      assert.equal(res.status, 401);
    });

    it('rejects teacher role requests (Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId }),
      });

      assert.equal(res.status, 403);
    });

    it('successfully generates sessions as Supervisor and persists them correctly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      
      // Sundays in range April 15 - April 30: April 19, April 26 (2 sessions)
      assert.equal(body.generatedCount, 2);
      assert.equal(body.skippedCount, 0);
      assert.equal(body.sessionIds.length, 2);

      // Verify persistence in DB
      const persisted = await db.select().from(classSessions).where(eq(classSessions.classId, classId));
      assert.equal(persisted.length, 2);
      assert.deepEqual(persisted.map((s: any) => s.sessionDate).sort(), ['2026-04-19', '2026-04-26']);
      assert.equal(persisted[0].status, 'SCHEDULED');
      assert.equal(persisted[0].startTime, '08:30:00'); // Postgres/Drizzle time format may append :00
    });

    it('supports idempotency: running generate again skips existing and creates 0 duplicates', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      
      assert.equal(body.generatedCount, 0);
      assert.equal(body.skippedCount, 2);
      assert.equal(body.sessionIds.length, 0);

      // Verify no duplicates in DB
      const persisted = await db.select().from(classSessions).where(eq(classSessions.classId, classId));
      assert.equal(persisted.length, 2);
    });

    it('preserves existing completed sessions on regeneration', async () => {
      // Simulate historical completed session by updating status in database
      const [sessToComplete] = await db.select().from(classSessions).where(eq(classSessions.classId, classId)).limit(1);
      await db.update(classSessions).set({ status: 'COMPLETED' }).where(eq(classSessions.id, sessToComplete.id));

      const res = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId }),
      });

      assert.equal(res.status, 201);
      
      const [checked] = await db.select().from(classSessions).where(eq(classSessions.id, sessToComplete.id));
      assert.equal(checked.status, 'COMPLETED'); // Unaltered
    });

    it('supports multiple schedules on the same day (Fix 1)', async () => {
      // 1. Create a new active class to isolate from previous tests
      const [newCls] = await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      }).returning();

      // 2. Add two schedules on Monday (1)
      const [schedA] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 1, // Monday
        startTime: '08:30:00',
        endTime: '10:00:00',
      }).returning();

      const [schedB] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 1, // Monday
        startTime: '14:00:00',
        endTime: '15:30:00',
      }).returning();

      // 3. Generate sessions for this class
      const generateRes = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId: newCls.id }),
      });

      assert.equal(generateRes.status, 201);
      const genBody = await generateRes.json();

      // Mondays in April 15 - April 30: April 20, April 27 (2 dates, 2 schedules = 4 sessions)
      assert.equal(genBody.generatedCount, 4);

      // Verify sessions exist in database for BOTH schedules
      const persisted = await db.select().from(classSessions).where(eq(classSessions.classId, newCls.id));
      assert.equal(persisted.length, 4);

      // For a specific date (April 20), assert both coexist
      const april20Sessions = persisted.filter((s: any) => s.sessionDate === '2026-04-20');
      assert.equal(april20Sessions.length, 2);

      const sessA = april20Sessions.find((s: any) => s.scheduleId === schedA.id);
      const sessB = april20Sessions.find((s: any) => s.scheduleId === schedB.id);

      assert.ok(sessA);
      assert.ok(sessB);
      assert.equal(sessA.startTime, '08:30:00');
      assert.equal(sessB.startTime, '14:00:00');
    });

    it('guarantees multi-schedule idempotency', async () => {
      // Create a class with two schedules on the same day
      const [newCls] = await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      }).returning();

      const [schedA] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 2, // Tuesday
        startTime: '09:00:00',
        endTime: '10:30:00',
      }).returning();

      const [schedB] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 2, // Tuesday
        startTime: '16:00:00',
        endTime: '17:30:00',
      }).returning();

      // Run generation twice
      await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId: newCls.id }),
      });

      const res2 = await fetch(`${baseUrl}/api/v1/sessions/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId: newCls.id }),
      });

      const body2 = await res2.json();
      assert.equal(body2.generatedCount, 0); // No duplicates generated
      assert.equal(body2.skippedCount, 4); // All 4 skipped (2 dates x 2 schedules)

      const persisted = await db.select().from(classSessions).where(eq(classSessions.classId, newCls.id));
      assert.equal(persisted.length, 4); // Still exactly 4 sessions
    });

    it('database enforces unique constraint on class + schedule + date (Fix 2)', async () => {
      const [newCls] = await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      }).returning();

      const [sched] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 3, // Wednesday
        startTime: '09:00:00',
        endTime: '10:30:00',
      }).returning();

      // First insert
      await db.insert(classSessions).values({
        classId: newCls.id,
        scheduleId: sched.id,
        sessionDate: '2026-04-22',
        startTime: '09:00:00',
        endTime: '10:30:00',
        status: 'SCHEDULED',
      });

      // Second identical insert must fail with unique constraint violation
      await assert.rejects(
        async () => {
          await db.insert(classSessions).values({
            classId: newCls.id,
            scheduleId: sched.id,
            sessionDate: '2026-04-22',
            startTime: '09:00:00',
            endTime: '10:30:00',
            status: 'SCHEDULED',
          });
        }
      );
    });

    it('allows same date with different schedules to coexist', async () => {
      const [newCls] = await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      }).returning();

      const [schedA] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 4, // Thursday
        startTime: '09:00:00',
        endTime: '10:30:00',
      }).returning();

      const [schedB] = await db.insert(schedules).values({
        classId: newCls.id,
        dayOfWeek: 4, // Thursday
        startTime: '11:00:00',
        endTime: '12:30:00',
      }).returning();

      // These should coexist perfectly on the same date
      await db.insert(classSessions).values({
        classId: newCls.id,
        scheduleId: schedA.id,
        sessionDate: '2026-04-23',
        startTime: '09:00:00',
        endTime: '10:30:00',
        status: 'SCHEDULED',
      });

      await db.insert(classSessions).values({
        classId: newCls.id,
        scheduleId: schedB.id,
        sessionDate: '2026-04-23',
        startTime: '11:00:00',
        endTime: '12:30:00',
        status: 'SCHEDULED',
      });

      const persisted = await db.select().from(classSessions).where(eq(classSessions.classId, newCls.id));
      assert.equal(persisted.length, 2); // Both co-exist on same day
    });
  });

  describe('GET /sessions', () => {
    it('allows supervisor to view all sessions', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.length >= 2);
    });
  });

  describe('GET /sessions/:id', () => {
    it('allows supervisor to get any session detail', async () => {
      const [sess] = await db.select().from(classSessions).where(eq(classSessions.classId, classId)).limit(1);
      const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, sess.id);
      assert.ok(body.class);
    });

    it('allows assigned teacher to get session detail', async () => {
      const [sess] = await db.select().from(classSessions).where(eq(classSessions.classId, classId)).limit(1);
      const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      assert.equal(res.status, 200);
    });

    it('rejects unassigned teacher with 403', async () => {
      const [otherCls] = await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      }).returning();
      const [otherSess] = await db.insert(classSessions).values({
        classId: otherCls.id,
        sessionDate: '2026-04-25',
        startTime: '08:00:00',
        endTime: '09:30:00',
        status: 'SCHEDULED',
      }).returning();

      const res = await fetch(`${baseUrl}/api/v1/sessions/${otherSess.id}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      assert.equal(res.status, 403);
    });
  });

  describe('Student Attendance API', () => {
    let student1Id: string;
    let student2Id: string;
    let studentUnenrolledId: string;
    let testSessId: string;
    let cancelledSessId: string;

    before(async () => {
      const [s1] = await db.insert(students).values({ firstName: 'Ali', lastName: 'Rezai', isActive: true }).returning();
      const [s2] = await db.insert(students).values({ firstName: 'Sara', lastName: 'Ahmadi', isActive: true }).returning();
      const [s3] = await db.insert(students).values({ firstName: 'Nader', lastName: 'Karimi', isActive: true }).returning();
      student1Id = s1.id;
      student2Id = s2.id;
      studentUnenrolledId = s3.id;

      await db.insert(enrollments).values({ classId, studentId: student1Id, status: 'ACTIVE' });
      await db.insert(enrollments).values({ classId, studentId: student2Id, status: 'ACTIVE' });

      const [sCreated] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-28',
        startTime: '10:00:00',
        endTime: '11:30:00',
        status: 'SCHEDULED',
      }).returning();
      testSessId = sCreated.id;

      const [sCancelled] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-29',
        startTime: '10:00:00',
        endTime: '11:30:00',
        status: 'CANCELLED',
      }).returning();
      cancelledSessId = sCancelled.id;
    });

    it('submits valid student attendance as teacher and preserves SCHEDULED session status (Test A)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${testSessId}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { studentId: student1Id, status: 'PRESENT' },
            { studentId: student2Id, status: 'ABSENT' },
          ],
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.recordedCount, 2);
      assert.equal(body.sessionStatus, 'SCHEDULED');

      const recs = await db.select().from(attendanceRecords).where(eq(attendanceRecords.classSessionId, testSessId));
      assert.equal(recs.length, 2);

      // Verify ClassSession remains SCHEDULED (does NOT automatically mutate to COMPLETED)
      const [sessCheck] = await db.select().from(classSessions).where(eq(classSessions.id, testSessId));
      assert.equal(sessCheck.status, 'SCHEDULED');
    });

    it('rejects duplicate student IDs in the same payload with 400 INVALID_INPUT and 0 writes (Test B)', async () => {
      const [dupSess] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-30',
        startTime: '12:00:00',
        endTime: '13:30:00',
        status: 'SCHEDULED',
      }).returning();

      const res = await fetch(`${baseUrl}/api/v1/sessions/${dupSess.id}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { studentId: student1Id, status: 'PRESENT' },
            { studentId: student1Id, status: 'ABSENT' },
          ],
        }),
      });

      assert.equal(res.status, 400);

      // Verify zero attendance records written
      const recs = await db.select().from(attendanceRecords).where(eq(attendanceRecords.classSessionId, dupSess.id));
      assert.equal(recs.length, 0);

      // Verify zero audit logs created
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, dupSess.id));
      assert.equal(logs.length, 0);
    });

    it('prevents teacher from rewriting previously recorded attendance', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${testSessId}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { studentId: student1Id, status: 'LATE' },
          ],
        }),
      });

      assert.equal(res.status, 400);
    });

    it('allows supervisor to override existing attendance and writes AuditLog', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${testSessId}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { studentId: student1Id, status: 'EXCUSED' },
            { studentId: student2Id, status: 'PRESENT' },
          ],
        }),
      });

      assert.equal(res.status, 201);

      const [r1] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.classSessionId, testSessId), eq(attendanceRecords.studentId, student1Id)));
      assert.equal(r1.status, 'EXCUSED');

      const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, testSessId), eq(auditLogs.action, 'OVERRIDE_STUDENT_ATTENDANCE')));
      assert.ok(logs.length >= 1);
    });

    it('rejects attendance for non-enrolled student and performs atomic rollback (0 partial writes)', async () => {
      const [freshSess] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-30',
        startTime: '10:00:00',
        endTime: '11:30:00',
        status: 'SCHEDULED',
      }).returning();

      const res = await fetch(`${baseUrl}/api/v1/sessions/${freshSess.id}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { studentId: student1Id, status: 'PRESENT' },
            { studentId: studentUnenrolledId, status: 'PRESENT' },
          ],
        }),
      });

      assert.equal(res.status, 400);

      const recs = await db.select().from(attendanceRecords).where(eq(attendanceRecords.classSessionId, freshSess.id));
      assert.equal(recs.length, 0);
    });

    it('rejects attendance for CANCELLED session', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${cancelledSessId}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ studentId: student1Id, status: 'PRESENT' }],
        }),
      });

      assert.equal(res.status, 400);
    });

    it('retrieves student attendance records for supervisor and assigned teacher', async () => {
      const resSup = await fetch(`${baseUrl}/api/v1/sessions/${testSessId}/attendance`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(resSup.status, 200);
      const body = await resSup.json();
      assert.equal(body.length, 2);
      assert.ok(body[0].student);

      const resTch = await fetch(`${baseUrl}/api/v1/sessions/${testSessId}/attendance`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      assert.equal(resTch.status, 200);
    });
  });

  describe('Teacher Attendance API', () => {
    let tchSessId: string;
    let tchId: string;

    before(async () => {
      const [t] = await db.select().from(teachers).limit(1);
      tchId = t.id;

      const [s] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-28',
        startTime: '14:00:00',
        endTime: '15:30:00',
        status: 'SCHEDULED',
      }).returning();
      tchSessId = s.id;
    });

    it('supervisor can record teacher attendance and writes AuditLog', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${tchSessId}/teacher-attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: tchId,
          status: 'PRESENT',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.status, 'PRESENT');

      const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, tchSessId), eq(auditLogs.action, 'RECORD_TEACHER_ATTENDANCE')));
      assert.ok(logs.length >= 1);
    });

    it('teacher cannot record teacher attendance (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${tchSessId}/teacher-attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: tchId,
          status: 'PRESENT',
        }),
      });

      assert.equal(res.status, 403);
    });

    it('does NOT automatically create teacher attendance when student attendance is submitted', async () => {
      const [freshSess] = await db.insert(classSessions).values({
        classId,
        sessionDate: '2026-04-30',
        startTime: '14:00:00',
        endTime: '15:30:00',
        status: 'SCHEDULED',
      }).returning();

      const [s1] = await db.select().from(students).limit(1);

      await fetch(`${baseUrl}/api/v1/sessions/${freshSess.id}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ studentId: s1.id, status: 'PRESENT' }],
        }),
      });

      const [tchRec] = await db.select().from(teacherAttendanceRecords).where(eq(teacherAttendanceRecords.classSessionId, freshSess.id));
      assert.equal(tchRec, undefined);
    });

    it('enforces database uniqueness constraint on teacher attendance', async () => {
      await assert.rejects(
        async () => {
          await db.insert(teacherAttendanceRecords).values({
            classSessionId: tchSessId,
            teacherId: tchId,
            status: 'PRESENT',
            recordedBy: (await db.select().from(accounts).limit(1))[0].id,
          });
        }
      );
    });

    it('retrieves teacher attendance record for supervisor and assigned teacher', async () => {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${tchSessId}/teacher-attendance`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.teacherId, tchId);
      assert.equal(body.status, 'PRESENT');
    });
  });

  describe('ClassSession Lifecycle APIs (Phase 6.3)', () => {
    let schedSessId: string;
    let otherTeacherToken: string;

    before(async () => {
      // Create another teacher for authorization tests
      const hasher = new ScryptPasswordHasher();
      const otherHash = await hasher.hash('OtherPass123!');
      const [otherAcc] = await db
        .insert(accounts)
        .values({
          personnelCode: 'TCH-99',
          passwordHash: otherHash,
          isActive: true,
        })
        .returning();

      const [tchRole] = await db.select().from(roles).where(eq(roles.name, 'TEACHER')).limit(1);
      await db.insert(accountRoles).values({
        accountId: otherAcc.id,
        roleId: tchRole.id,
      });

      await db.insert(teachers).values({
        accountId: otherAcc.id,
        firstName: 'Unassigned',
        lastName: 'Teacher',
        baseRate: '100.00',
        isActive: true,
      });

      const otherLogin = await authService.login({
        personnelCode: 'TCH-99',
        password: 'OtherPass123!',
      });
      otherTeacherToken = otherLogin.rawToken;
    });

    describe('POST /sessions/:id/complete', () => {
      it('returns 404 for nonexistent session', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sessions/00000000-0000-0000-0000-000000000000/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });
        assert.equal(res.status, 404);
      });

      it('rejects unassigned teacher with 403', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-20',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${otherTeacherToken}` },
        });
        assert.equal(res.status, 403);
      });

      it('allows assigned teacher to complete SCHEDULED session', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-21',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teacherToken}` },
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.id, sess.id);
        assert.equal(body.status, 'COMPLETED');

        const [checked] = await db.select().from(classSessions).where(eq(classSessions.id, sess.id));
        assert.equal(checked.status, 'COMPLETED');

        // Audit Log verification
        const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, sess.id), eq(auditLogs.action, 'COMPLETE_CLASS_SESSION')));
        assert.equal(logs.length, 1);
      });

      it('allows supervisor to complete SCHEDULED session', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-22',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.status, 'COMPLETED');
      });

      it('rejects completing an already COMPLETED session with 400 INVALID_STATE', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-23',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'COMPLETED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });

        assert.equal(res.status, 400);
      });

      it('rejects completing a CANCELLED session with 400 INVALID_STATE', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-24',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'CANCELLED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });

        assert.equal(res.status, 400);
      });
    });

    describe('POST /sessions/:id/cancel', () => {
      it('returns 404 for nonexistent session', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sessions/00000000-0000-0000-0000-000000000000/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });
        assert.equal(res.status, 404);
      });

      it('rejects assigned teacher with 403 FORBIDDEN_RESOURCE (supervisor only)', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-25',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teacherToken}` },
        });

        assert.equal(res.status, 403);
      });

      it('supervisor cancels SCHEDULED session with optional reason and audit log', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-26',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Teacher emergency illness' }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.id, sess.id);
        assert.equal(body.status, 'CANCELLED');

        const [checked] = await db.select().from(classSessions).where(eq(classSessions.id, sess.id));
        assert.equal(checked.status, 'CANCELLED');

        // Audit Log verification
        const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, sess.id), eq(auditLogs.action, 'CANCEL_CLASS_SESSION')));
        assert.ok(log);
        assert.equal((log.metadata as any).reason, 'Teacher emergency illness');
      });

      it('rejects cancelling a COMPLETED session with 400 INVALID_STATE', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-27',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'COMPLETED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });

        assert.equal(res.status, 400);
      });

      it('rejects cancelling an already CANCELLED session with 400 INVALID_STATE', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-28',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'CANCELLED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });

        assert.equal(res.status, 400);
      });
    });

    describe('PATCH /sessions/:id', () => {
      it('returns 404 for nonexistent session', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sessions/00000000-0000-0000-0000-000000000000`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: '09:00:00' }),
        });
        assert.equal(res.status, 404);
      });

      it('rejects teacher with 403 FORBIDDEN_RESOURCE', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-21',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: '09:00:00' }),
        });

        assert.equal(res.status, 403);
      });

      it('rejects empty PATCH payload with 400 INVALID_INPUT', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-22',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        assert.equal(res.status, 400);
      });

      it('rejects invalid time range (startTime >= endTime) with 400 INVALID_INPUT', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-23',
          startTime: '10:00:00',
          endTime: '11:30:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: '12:00:00', endTime: '11:00:00' }),
        });

        assert.equal(res.status, 400);
      });

      it('rejects partial time update that conflicts with persisted counterpart', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-24',
          startTime: '09:00:00',
          endTime: '10:00:00',
          status: 'SCHEDULED',
        }).returning();

        // Updating startTime to 10:30 exceeds persisted endTime 10:00
        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: '10:30:00' }),
        });

        assert.equal(res.status, 400);
      });

      it('rejects unsupported extra fields with 400 INVALID_INPUT', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          sessionDate: '2026-04-25',
          startTime: '09:00:00',
          endTime: '10:00:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED', teacherId: 'fake-id' }),
        });

        assert.equal(res.status, 400);
      });

      it('supervisor updates session date and time, writes audit log, without altering parent schedule', async () => {
        const [sess] = await db.insert(classSessions).values({
          classId,
          scheduleId,
          sessionDate: '2026-05-10',
          startTime: '08:30:00',
          endTime: '10:00:00',
          status: 'SCHEDULED',
        }).returning();

        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionDate: '2026-05-11', startTime: '09:00:00', endTime: '10:30:00' }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.id, sess.id);
        assert.equal(body.sessionDate, '2026-05-11');
        assert.equal(body.startTime, '09:00:00');
        assert.equal(body.endTime, '10:30:00');

        // Audit Log verification
        const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, sess.id), eq(auditLogs.action, 'UPDATE_CLASS_SESSION')));
        assert.ok(log);
        assert.ok((log.metadata as any).sessionDate);

        // Verify parent Schedule was NOT altered
        const [parentSched] = await db.select().from(schedules).where(eq(schedules.id, scheduleId));
        assert.equal(parentSched.startTime, '08:30:00');
      });

      it('handles duplicate session date/schedule collision gracefully', async () => {
        const [sess1] = await db.insert(classSessions).values({
          classId,
          scheduleId,
          sessionDate: '2026-05-12',
          startTime: '08:30:00',
          endTime: '10:00:00',
          status: 'SCHEDULED',
        }).returning();

        const [sess2] = await db.insert(classSessions).values({
          classId,
          scheduleId,
          sessionDate: '2026-05-13',
          startTime: '08:30:00',
          endTime: '10:00:00',
          status: 'SCHEDULED',
        }).returning();

        // Attempting to move sess2 date to 2026-05-12 conflicts with sess1
        const res = await fetch(`${baseUrl}/api/v1/sessions/${sess2.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionDate: '2026-05-12' }),
        });

        assert.equal(res.status, 400);
      });
    });
  });
});
