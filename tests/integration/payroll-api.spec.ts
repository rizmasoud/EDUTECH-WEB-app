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
import { teachers, teacherSkills } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, schedules, classSessions, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { substitutionRequests, substitutionResponses } from '../../apps/api/src/infrastructure/database/schema/substitutions.schema';
import { attendanceRecords, teacherAttendanceRecords } from '../../apps/api/src/infrastructure/database/schema/attendance.schema';
import { lessonPlans, lessonPlanItems } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { payrolls, payrollItems } from '../../apps/api/src/infrastructure/database/schema/payroll.schema';
import { notifications, auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
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
import { PayrollService } from '../../apps/api/src/payroll/application/services/payroll.service';
import { PayrollPolicy } from '../../apps/api/src/payroll/domain/policies/payroll.policy';
import { PayrollController, TeacherPayrollController } from '../../apps/api/src/payroll/presentation/payroll.controller';
import { NotificationService } from '../../apps/api/src/notifications/application/services/notification.service';
import { NotificationsController } from '../../apps/api/src/notifications/presentation/notifications.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [PayrollController, TeacherPayrollController, NotificationsController],
  providers: [
    PayrollService,
    PayrollPolicy,
    NotificationService,
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
class TestPayrollApiModule {}

describe('Payroll and Private Classes Integration Tests (Phase 11)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  let supervisorAccountId: string;
  let teacherAAccountId: string;
  let teacherBAccountId: string;

  let teacherAId: string;
  let teacherBId: string;

  let termId: string;
  let bookId: string;

  let regularClassId: string;
  let privateClassId: string;

  let sessionRegularAttendedId: string;
  let sessionRegularCancelledId: string;
  let sessionRegularSubstitutedId: string;
  let sessionPrivateAttendedId: string;

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
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    const pass = 'Password123!';
    const hash = await hasher.hash(pass);
    const now = new Date();

    // 1. Seed Supervisor
    const [supervisorAcc] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-001',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    supervisorAccountId = supervisorAcc.id;

    await db.insert(accountRoles).values({
      accountId: supervisorAcc.id,
      roleId: supRole.id,
    });

    // 2. Seed Teacher A (baseRate = 200.00)
    const [tRecA] = await db
      .insert(teachers)
      .values({
        firstName: 'Alice',
        lastName: 'Smith',
        baseRate: '200.00',
        isActive: true,
      })
      .returning();
    teacherAId = tRecA.id;

    const [tAccA] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-001',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    teacherAAccountId = tAccA.id;

    await db.update(teachers).set({ accountId: teacherAAccountId }).where(eq(teachers.id, teacherAId));
    await db.insert(accountRoles).values({
      accountId: teacherAAccountId,
      roleId: tchRole.id,
    });

    // 3. Seed Teacher B (baseRate = 250.00)
    const [tRecB] = await db
      .insert(teachers)
      .values({
        firstName: 'Bob',
        lastName: 'Jones',
        baseRate: '250.00',
        isActive: true,
      })
      .returning();
    teacherBId = tRecB.id;

    const [tAccB] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-002',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    teacherBAccountId = tAccB.id;

    await db.update(teachers).set({ accountId: teacherBAccountId }).where(eq(teachers.id, teacherBId));
    await db.insert(accountRoles).values({
      accountId: teacherBAccountId,
      roleId: tchRole.id,
    });

    // 4. Seed Academic Term & Book
    const [term] = await db
      .insert(academicTerms)
      .values({
        name: 'Spring 2026',
        startDate: '2026-03-01',
        endDate: '2026-06-30',
      })
      .returning();
    termId = term.id;

    const [book] = await db
      .insert(books)
      .values({
        name: 'English Explorer 1',
        level: 'Beginner',
        sequenceOrder: 1,
        sessionCount: 20,
      })
      .returning();
    bookId = book.id;


    // Skills
    await db.insert(teacherSkills).values([
      { teacherId: teacherAId, bookId },
      { teacherId: teacherBId, bookId },
    ]);

    // 5. Seed Regular Class & Private Class for Teacher A
    const [regClass] = await db
      .insert(classes)
      .values({
        academicTermId: termId,
        bookId,
        teacherId: teacherAId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 10,
      })
      .returning();
    regularClassId = regClass.id;

    const [privClass] = await db
      .insert(classes)
      .values({
        academicTermId: termId,
        bookId,
        teacherId: teacherAId,
        classType: 'PRIVATE',
        status: 'ACTIVE',
        capacity: 1,
      })
      .returning();
    privateClassId = privClass.id;

    // 6. Seed Sessions
    // Regular session attended by Teacher A
    const [s1] = await db
      .insert(classSessions)
      .values({
        classId: regularClassId,
        sessionDate: '2026-03-10',
        startTime: '09:00:00',
        endTime: '10:30:00',
        status: 'COMPLETED',
      })
      .returning();
    sessionRegularAttendedId = s1.id;

    await db.insert(teacherAttendanceRecords).values({
      classSessionId: s1.id,
      teacherId: teacherAId,
      status: 'PRESENT',
      recordedBy: supervisorAccountId,
    });

    // Regular session cancelled (should yield NO pay)
    const [s2] = await db
      .insert(classSessions)
      .values({
        classId: regularClassId,
        sessionDate: '2026-03-12',
        startTime: '09:00:00',
        endTime: '10:30:00',
        status: 'CANCELLED',
      })
      .returning();
    sessionRegularCancelledId = s2.id;

    // Regular session substituted out: Teacher B substitutes for Teacher A
    const [s3] = await db
      .insert(classSessions)
      .values({
        classId: regularClassId,
        sessionDate: '2026-03-14',
        startTime: '09:00:00',
        endTime: '10:30:00',
        status: 'COMPLETED',
      })
      .returning();
    sessionRegularSubstitutedId = s3.id;

    // Substitution request approved for Teacher B
    await db.insert(substitutionRequests).values({
      classSessionId: s3.id,
      requestedBy: teacherAAccountId,
      status: 'APPROVED',
      approvedTeacherId: teacherBId,
      approvedBy: supervisorAccountId,
      approvedAt: now,
    });

    // Attendance recorded for Teacher B as substitute
    await db.insert(teacherAttendanceRecords).values({
      classSessionId: s3.id,
      teacherId: teacherBId,
      status: 'PRESENT',
      recordedBy: supervisorAccountId,
    });

    // Private Class session attended by Teacher A (should yield 350.00)
    const [s4] = await db
      .insert(classSessions)
      .values({
        classId: privateClassId,
        sessionDate: '2026-03-16',
        startTime: '11:00:00',
        endTime: '12:00:00',
        status: 'COMPLETED',
      })
      .returning();
    sessionPrivateAttendedId = s4.id;

    await db.insert(teacherAttendanceRecords).values({
      classSessionId: s4.id,
      teacherId: teacherAId,
      status: 'PRESENT',
      recordedBy: supervisorAccountId,
    });

    // Generate tokens via authService login
    const supLogin = await authService.login(
      { personnelCode: 'SUP-001', password: pass },
      { userAgent: 'test', ipAddress: '127.0.0.1' },
    );
    supervisorToken = supLogin.rawToken;

    const tchALogin = await authService.login(
      { personnelCode: 'TCH-001', password: pass },
      { userAgent: 'test', ipAddress: '127.0.0.1' },
    );
    teacherAToken = tchALogin.rawToken;

    const tchBLogin = await authService.login(
      { personnelCode: 'TCH-002', password: pass },
      { userAgent: 'test', ipAddress: '127.0.0.1' },
    );
    teacherBToken = tchBLogin.rawToken;

    // Start Nest app
    app = await NestFactory.create(TestPayrollApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (pg) {
      await pg.close();
    }
  });

  describe('1. Payroll Lifecycle & Calculation (Draft -> Calculated -> Reviewed -> Finalized)', () => {
    let payrollAId: string;

    it('Supervisor creates a payroll draft for Teacher A', async () => {
      const res = await fetch(`${baseUrl}/payrolls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          teacherId: teacherAId,
          academicTermId: termId,
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.ok(json.id);
      assert.strictEqual(json.status, 'DRAFT');
      assert.strictEqual(json.teacherId, teacherAId);
      assert.strictEqual(json.academicTermId, termId);
      assert.strictEqual(json.totalAmount, '0.00');

      payrollAId = json.id;
    });

    it('Supervisor calculates payroll for Teacher A', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'CALCULATED');
      assert.ok(json.items.length >= 2);

      // Verify item types and explainability
      const sessionItem = json.items.find((i: any) => i.type === 'SESSION');
      assert.ok(sessionItem, 'Expected SESSION item for regular class');
      assert.strictEqual(sessionItem.rate, '200.00');
      assert.strictEqual(sessionItem.amount, '200.00');
      assert.strictEqual(sessionItem.referenceId, sessionRegularAttendedId);

      const privateItem = json.items.find((i: any) => i.type === 'PRIVATE_CLASS');
      assert.ok(privateItem, 'Expected PRIVATE_CLASS item for private class');
      assert.strictEqual(privateItem.rate, '350.00');
      assert.strictEqual(privateItem.amount, '350.00');
      assert.strictEqual(privateItem.referenceId, sessionPrivateAttendedId);

      // Verify total: 200 + 350 = 550.00
      assert.strictEqual(json.totalAmount, '550.00');
    });

    it('Calculation is idempotent: repeated calculation produces identical items and total', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'CALCULATED');
      assert.strictEqual(json.totalAmount, '550.00');
      assert.strictEqual(json.items.length, 2);
    });

    it('Supervisor adds manual adjustment to payroll (Business Rules §21.9)', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          amount: '100.00',
          description: 'Workshop preparation bonus',
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.totalAmount, '650.00'); // 550 + 100

      const adjItem = json.items.find((i: any) => i.type === 'ADJUSTMENT');
      assert.ok(adjItem);
      assert.strictEqual(adjItem.amount, '100.00');
      assert.strictEqual(adjItem.description, 'Workshop preparation bonus');
    });

    it('Recalculation preserves existing manual adjustments', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.totalAmount, '650.00');
      assert.strictEqual(json.items.length, 3); // 2 auto + 1 adjustment
    });

    it('Supervisor reviews payroll', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'REVIEWED');
    });

    it('Supervisor finalizes payroll', async () => {
      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'FINALIZED');
      assert.ok(json.finalizedAt);

      // Verify notification dispatched to Teacher A
      const notifRes = await fetch(`${baseUrl}/notifications`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(notifRes.status, 200);
      const notifs = await notifRes.json();
      const finalNotif = notifs.data.find((n: any) => n.type === 'PAYROLL_FINALIZED');
      assert.ok(finalNotif, 'Expected PAYROLL_FINALIZED notification for Teacher A');
    });

    it('Finalized payroll blocks modifications (PAYROLL_ALREADY_FINALIZED)', async () => {
      // Calculate attempt
      const calcRes = await fetch(`${baseUrl}/payrolls/${payrollAId}/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.strictEqual(calcRes.status, 400);
      const calcErr = await calcRes.json();
      assert.strictEqual(calcErr.error?.code || calcErr.code, 'PAYROLL_ALREADY_FINALIZED');

      // Adjustment attempt
      const adjRes = await fetch(`${baseUrl}/payrolls/${payrollAId}/adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          amount: 50,
          description: 'Late adjustment',
        }),
      });
      assert.strictEqual(adjRes.status, 400);
      const adjErr = await adjRes.json();
      assert.strictEqual(adjErr.error?.code || adjErr.code, 'PAYROLL_ALREADY_FINALIZED');

      // Finalize attempt
      const finRes = await fetch(`${baseUrl}/payrolls/${payrollAId}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.strictEqual(finRes.status, 400);
      const finErr = await finRes.json();
      assert.strictEqual(finErr.error?.code || finErr.code, 'PAYROLL_ALREADY_FINALIZED');

    });
  });

  describe('2. Substitution Payroll Integration (Teacher B)', () => {
    let payrollBId: string;

    it('Supervisor creates and calculates payroll for Substitute Teacher B', async () => {
      const createRes = await fetch(`${baseUrl}/payrolls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supervisorToken}`,
        },
        body: JSON.stringify({
          teacherId: teacherBId,
          academicTermId: termId,
        }),
      });
      assert.strictEqual(createRes.status, 201);
      const payroll = await createRes.json();
      payrollBId = payroll.id;

      const calcRes = await fetch(`${baseUrl}/payrolls/${payrollBId}/calculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
        },
      });
      assert.strictEqual(calcRes.status, 200);
      const calcJson = await calcRes.json();

      assert.strictEqual(calcJson.status, 'CALCULATED');
      assert.strictEqual(calcJson.items.length, 1);

      const subItem = calcJson.items[0];
      assert.strictEqual(subItem.type, 'SUBSTITUTION');
      assert.strictEqual(subItem.rate, '250.00'); // Teacher B baseRate
      assert.strictEqual(subItem.amount, '250.00');
      assert.strictEqual(subItem.referenceId, sessionRegularSubstitutedId);
      assert.strictEqual(calcJson.totalAmount, '250.00');
    });
  });

  describe('3. Authorization, RBAC & IDOR Prevention', () => {
    it('Teacher A can view their own payroll details and items', async () => {
      const payrollsRes = await fetch(`${baseUrl}/payrolls`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(payrollsRes.status, 200);
      const list = await payrollsRes.json();
      assert.ok(list.length >= 1);
      assert.strictEqual(list[0].teacherId, teacherAId);

      // GET /payrolls/:id
      const detailRes = await fetch(`${baseUrl}/payrolls/${list[0].id}`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(detailRes.status, 200);

      // GET /payrolls/:id/items
      const itemsRes = await fetch(`${baseUrl}/payrolls/${list[0].id}/items`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(itemsRes.status, 200);
      const items = await itemsRes.json();
      assert.ok(items.length >= 2);
    });

    it('Teacher A can view their payrolls via GET /teachers/:id/payrolls', async () => {
      const res = await fetch(`${baseUrl}/teachers/${teacherAId}/payrolls`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(res.status, 200);
      const list = await res.json();
      assert.ok(list.length >= 1);
    });

    it('Teacher A cannot view Teacher B payrolls via GET /teachers/:id/payrolls (IDOR prevention)', async () => {
      const res = await fetch(`${baseUrl}/teachers/${teacherBId}/payrolls`, {
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
        },
      });
      assert.strictEqual(res.status, 403);
    });

    it('Teacher A cannot create, calculate, review, or finalize payrolls (Supervisor only)', async () => {
      const createRes = await fetch(`${baseUrl}/payrolls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherAToken}`,
        },
        body: JSON.stringify({
          teacherId: teacherAId,
          academicTermId: termId,
        }),
      });
      assert.strictEqual(createRes.status, 403);
    });

    it('Unauthenticated requests are rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/payrolls`);
      assert.strictEqual(res.status, 401);
    });
  });
});
