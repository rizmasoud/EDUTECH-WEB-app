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
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, schedules, classSessions } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { substitutionRequests } from '../../apps/api/src/infrastructure/database/schema/substitutions.schema';
import { teacherAttendanceRecords } from '../../apps/api/src/infrastructure/database/schema/attendance.schema';
import { payrolls } from '../../apps/api/src/infrastructure/database/schema/payroll.schema';
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
import { AttendanceService } from '../../apps/api/src/sessions/application/services/attendance.service';
import { SessionGenerationService } from '../../apps/api/src/sessions/application/services/session-generation.service';
import { SessionLifecycleService } from '../../apps/api/src/sessions/application/services/session-lifecycle.service';
import { SessionsController } from '../../apps/api/src/sessions/presentation/sessions.controller';
import { PayrollService } from '../../apps/api/src/payroll/application/services/payroll.service';
import { PayrollPolicy } from '../../apps/api/src/payroll/domain/policies/payroll.policy';
import { PayrollController } from '../../apps/api/src/payroll/presentation/payroll.controller';
import { NotificationService } from '../../apps/api/src/notifications/application/services/notification.service';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [SubstitutionController, SessionsController, PayrollController],
  providers: [
    SubstitutionService,
    SessionGenerationService,
    AttendanceService,
    SessionLifecycleService,
    PayrollService,
    PayrollPolicy,
    NotificationService,
    AuthService,
    AuthGuard,
    RolesGuard,
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKEN_SERVICE, useClass: CryptoSessionTokenService },
    { provide: LOGIN_RATE_LIMITER, useClass: MemoryLoginRateLimiter },
    { provide: SECURITY_AUDIT_SERVICE, useClass: DrizzleSecurityAuditService },
    { provide: DRIZZLE_DB, useFactory: () => sharedDb },
  ],
})
class TestSubstituteLifecycleModule {}

/**
 * Normal workflow with the real services (no direct inserts of substitution rows):
 * create request -> broadcast -> respond -> approve -> complete session ->
 * record substitute teacher attendance -> calculate payroll.
 */
describe('Substitute lifecycle: attendance and payroll after session completion', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  const subs: Record<string, { id: string; token: string }> = {};

  let teacherAId: string;
  let outsiderId: string;
  let termId: string;
  let classId: string;
  let scheduleId: string;
  let ownSessionId: string;
  const sessionIds: Record<string, string> = {};
  const requestIds: Record<string, string> = {};

  const SCENARIOS = ['PRESENT', 'ABSENT', 'MISSING', 'LATE'] as const;
  const DATES: Record<string, string> = {
    PRESENT: '2026-10-11',
    ABSENT: '2026-10-18',
    MISSING: '2026-10-25',
    LATE: '2026-11-01',
  };

  const api = (token: string, method: string, url: string, body?: unknown) =>
    fetch(`${baseUrl}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function seedTeacher(
    hasher: ScryptPasswordHasher,
    code: string,
    first: string,
    rate: string,
    bookId: string,
  ) {
    const [t] = await db
      .insert(teachers)
      .values({ firstName: first, lastName: 'Test', baseRate: rate, isActive: true })
      .returning();
    const [acc] = await db
      .insert(accounts)
      .values({ personnelCode: code, passwordHash: await hasher.hash('Passw0rd!123'), isActive: true })
      .returning();
    await db.update(teachers).set({ accountId: acc.id }).where(eq(teachers.id, t.id));
    const [role] = await db.select().from(roles).where(eq(roles.name, 'TEACHER'));
    await db.insert(accountRoles).values({ accountId: acc.id, roleId: role.id });
    await db.insert(teacherSkills).values({ teacherId: t.id, bookId });
    return t.id as string;
  }

  async function runWorkflowUntilCompleted(scenario: string) {
    const sub = subs[scenario];
    const sessionId = sessionIds[scenario];

    const created = await api(teacherAToken, 'POST', '/substitution-requests', { classSessionId: sessionId });
    assert.strictEqual(created.status, 201);
    const reqId = (await created.json()).id as string;
    requestIds[scenario] = reqId;

    assert.strictEqual((await api(supervisorToken, 'POST', `/substitution-requests/${reqId}/broadcast`)).status, 200);
    assert.strictEqual(
      (await api(sub.token, 'POST', `/substitution-requests/${reqId}/respond`, { response: 'ACCEPT' })).status,
      200,
    );
    const approved = await api(supervisorToken, 'POST', `/substitution-requests/${reqId}/approve`, {
      teacherId: sub.id,
    });
    assert.strictEqual(approved.status, 200);
    assert.strictEqual((await approved.json()).status, 'APPROVED');

    const completed = await api(supervisorToken, 'POST', `/sessions/${sessionId}/complete`);
    assert.strictEqual(completed.status, 200);
    assert.strictEqual((await completed.json()).status, 'COMPLETED');

    const [req] = await db.select().from(substitutionRequests).where(eq(substitutionRequests.id, reqId));
    assert.strictEqual(req.status, 'COMPLETED');
  }

  async function calculatePayroll(teacherId: string) {
    const created = await api(supervisorToken, 'POST', '/payrolls', { teacherId, academicTermId: termId });
    assert.strictEqual(created.status, 201);
    const { id } = await created.json();
    const calc = await api(supervisorToken, 'POST', `/payrolls/${id}/calculate`);
    assert.strictEqual(calc.status, 200);
    return calc.json();
  }

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);
    db = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const authService = new AuthService(
      db,
      hasher,
      new CryptoSessionTokenService(),
      new MemoryLoginRateLimiter({ maxAttempts: 50, windowMs: 900000 }),
      new DrizzleSecurityAuditService(db),
    );

    await db.insert(roles).values({ name: 'SUPERVISOR' });
    await db.insert(roles).values({ name: 'TEACHER' });

    const [supAcc] = await db
      .insert(accounts)
      .values({ personnelCode: 'SUP-01', passwordHash: await hasher.hash('Passw0rd!123'), isActive: true })
      .returning();
    const [supRole] = await db.select().from(roles).where(eq(roles.name, 'SUPERVISOR'));
    await db.insert(accountRoles).values({ accountId: supAcc.id, roleId: supRole.id });

    const [book] = await db
      .insert(books)
      .values({ name: 'Book 1', level: 'Beginner', sequenceOrder: 1, sessionCount: 20, isTerminal: false })
      .returning();

    teacherAId = await seedTeacher(hasher, 'TCH-A', 'Regular', '100.00', book.id);
    outsiderId = await seedTeacher(hasher, 'TCH-X', 'Outsider', '90.00', book.id);
    const subCodes: Record<string, [string, string]> = {
      PRESENT: ['TCH-S1', '120.00'],
      ABSENT: ['TCH-S2', '130.00'],
      MISSING: ['TCH-S3', '140.00'],
      LATE: ['TCH-S4', '150.00'],
    };
    for (const sc of SCENARIOS) {
      const [code, rate] = subCodes[sc];
      subs[sc] = { id: await seedTeacher(hasher, code, `Sub${sc}`, rate, book.id), token: '' };
    }

    const [term] = await db
      .insert(academicTerms)
      .values({ name: 'Fall 2026', startDate: '2026-10-01', endDate: '2026-12-31', status: 'ACTIVE' })
      .returning();
    termId = term.id;

    const [cls] = await db
      .insert(classes)
      .values({
        academicTermId: termId,
        bookId: book.id,
        teacherId: teacherAId,
        classType: 'REGULAR',
        capacity: 12,
        status: 'ACTIVE',
      })
      .returning();
    classId = cls.id;

    const [sch] = await db
      .insert(schedules)
      .values({ classId, dayOfWeek: 0, startTime: '10:00', endTime: '12:00' })
      .returning();
    scheduleId = sch.id;

    for (const sc of SCENARIOS) {
      const [s] = await db
        .insert(classSessions)
        .values({
          classId,
          scheduleId,
          sessionDate: DATES[sc],
          startTime: '10:00',
          endTime: '12:00',
          status: 'SCHEDULED',
        })
        .returning();
      sessionIds[sc] = s.id;
    }
    const [own] = await db
      .insert(classSessions)
      .values({
        classId,
        scheduleId,
        sessionDate: '2026-11-08',
        startTime: '10:00',
        endTime: '12:00',
        status: 'SCHEDULED',
      })
      .returning();
    ownSessionId = own.id;

    const ctx = { userAgent: 'test', ipAddress: '127.0.0.1' };
    supervisorToken = (await authService.login({ personnelCode: 'SUP-01', password: 'Passw0rd!123' }, ctx)).rawToken;
    teacherAToken = (await authService.login({ personnelCode: 'TCH-A', password: 'Passw0rd!123' }, ctx)).rawToken;
    const subCodeList = ['TCH-S1', 'TCH-S2', 'TCH-S3', 'TCH-S4'];
    for (let i = 0; i < SCENARIOS.length; i++) {
      subs[SCENARIOS[i]].token = (
        await authService.login({ personnelCode: subCodeList[i], password: 'Passw0rd!123' }, ctx)
      ).rawToken;
    }

    app = await NestFactory.create(TestSubstituteLifecycleModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  describe('1. Workflow reaches COMPLETED through the real services', () => {
    for (const sc of SCENARIOS) {
      it(`${sc}: create -> broadcast -> respond -> approve -> complete session`, async () => {
        await runWorkflowUntilCompleted(sc);
      });
    }
  });

  describe('2. Teacher attendance after session completion', () => {
    it('PRESENT: supervisor can record the substitute as PRESENT after completion', async () => {
      const res = await api(supervisorToken, 'POST', `/sessions/${sessionIds.PRESENT}/teacher-attendance`, {
        teacherId: subs.PRESENT.id,
        status: 'PRESENT',
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual((await res.json()).status, 'PRESENT');
    });

    it('ABSENT: supervisor can record the substitute as ABSENT after completion', async () => {
      const res = await api(supervisorToken, 'POST', `/sessions/${sessionIds.ABSENT}/teacher-attendance`, {
        teacherId: subs.ABSENT.id,
        status: 'ABSENT',
      });
      assert.strictEqual(res.status, 201);
    });

    it('LATE is not a valid teacher attendance status (schema enum has PRESENT/ABSENT/EXCUSED only)', async () => {
      const res = await api(supervisorToken, 'POST', `/sessions/${sessionIds.LATE}/teacher-attendance`, {
        teacherId: subs.LATE.id,
        status: 'LATE',
      });
      assert.strictEqual(res.status, 400);
      const rows = await db
        .select()
        .from(teacherAttendanceRecords)
        .where(eq(teacherAttendanceRecords.classSessionId, sessionIds.LATE));
      assert.strictEqual(rows.length, 0);
    });

    it('MISSING: no attendance is recorded for this substitute', async () => {
      const rows = await db
        .select()
        .from(teacherAttendanceRecords)
        .where(eq(teacherAttendanceRecords.classSessionId, sessionIds.MISSING));
      assert.strictEqual(rows.length, 0);
    });

    it('the regular teacher also has PRESENT attendance on every substituted session', async () => {
      for (const sc of SCENARIOS) {
        const res = await api(supervisorToken, 'POST', `/sessions/${sessionIds[sc]}/teacher-attendance`, {
          teacherId: teacherAId,
          status: 'PRESENT',
        });
        assert.strictEqual(res.status, 201);
      }
    });

    it('a teacher who is neither assigned nor the approved substitute is still rejected after completion', async () => {
      const res = await api(supervisorToken, 'POST', `/sessions/${sessionIds.PRESENT}/teacher-attendance`, {
        teacherId: outsiderId,
        status: 'PRESENT',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual((await res.json()).error.code, 'INVALID_TEACHER_ASSIGNMENT');
    });

    it('the regular teacher is recorded PRESENT on a normal (unsubstituted) completed session', async () => {
      assert.strictEqual((await api(supervisorToken, 'POST', `/sessions/${ownSessionId}/complete`)).status, 200);
      const res = await api(supervisorToken, 'POST', `/sessions/${ownSessionId}/teacher-attendance`, {
        teacherId: teacherAId,
        status: 'PRESENT',
      });
      assert.strictEqual(res.status, 201);
    });
  });

  describe('3. Payroll attribution for substitutes', () => {
    it('PRESENT: substitute is paid one SUBSTITUTION item at their own rate', async () => {
      const p = await calculatePayroll(subs.PRESENT.id);
      assert.strictEqual(p.items.length, 1);
      assert.strictEqual(p.items[0].type, 'SUBSTITUTION');
      assert.strictEqual(p.items[0].referenceId, sessionIds.PRESENT);
      assert.strictEqual(p.items[0].rate, '120.00');
      assert.strictEqual(p.totalAmount, '120.00');
    });

    it('ABSENT: substitute is not paid', async () => {
      const p = await calculatePayroll(subs.ABSENT.id);
      assert.strictEqual(p.items.length, 0);
      assert.strictEqual(p.totalAmount, '0.00');
    });

    it('missing attendance: substitute is not paid', async () => {
      const p = await calculatePayroll(subs.MISSING.id);
      assert.strictEqual(p.items.length, 0);
      assert.strictEqual(p.totalAmount, '0.00');
    });

    it('LATE (cannot be recorded): substitute is not paid', async () => {
      const p = await calculatePayroll(subs.LATE.id);
      assert.strictEqual(p.items.length, 0);
    });
  });

  describe('4. Regular teacher payroll and class ownership', () => {
    it('regular teacher is paid only for the unsubstituted session, not for substituted ones', async () => {
      const p = await calculatePayroll(teacherAId);
      assert.strictEqual(p.items.length, 1);
      assert.strictEqual(p.items[0].type, 'SESSION');
      assert.strictEqual(p.items[0].referenceId, ownSessionId);
      assert.strictEqual(p.totalAmount, '100.00');
      for (const sc of SCENARIOS) {
        assert.ok(!p.items.some((i: any) => i.referenceId === sessionIds[sc]));
      }
    });

    it("the class's regular teacher assignment is unchanged", async () => {
      const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
      assert.strictEqual(cls.teacherId, teacherAId);
    });

    it('recalculating payroll is idempotent for substitutes', async () => {
      const [pr] = await db
        .select()
        .from(payrolls)
        .where(eq(payrolls.teacherId, subs.PRESENT.id));
      const again = await api(supervisorToken, 'POST', `/payrolls/${pr.id}/calculate`);
      assert.strictEqual(again.status, 200);
      const json = await again.json();
      assert.strictEqual(json.items.length, 1);
      assert.strictEqual(json.totalAmount, '120.00');
    });
  });
});
