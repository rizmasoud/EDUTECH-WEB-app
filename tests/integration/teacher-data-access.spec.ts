/**
 * Teacher data-access policy, enforced by the backend (MVP scope decision D2):
 *
 *  - a teacher reads only their own classes (and those classes' rosters);
 *  - a teacher reads only students with an ACTIVE enrollment in one of their own classes, and sees only the
 *    enrollments of such a student that belong to the teacher's own classes;
 *  - a teacher never receives a pay rate (`baseRate`), neither another teacher's nor the pay-rate fields nested in
 *    their own payroll response;
 *  - a supervisor keeps unrestricted access;
 *  - every request goes straight to the HTTP API with a real session, so none of this depends on the web UI.
 *
 * Uses the real controllers, services, guards and repositories on an in-memory PostgreSQL (PGlite).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { payrolls } from '../../apps/api/src/infrastructure/database/schema/payroll.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { TeacherOwnershipPolicy } from '../../apps/api/src/auth/presentation/policies/teacher-ownership.policy';
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
import { StudentsController } from '../../apps/api/src/students/presentation/students.controller';
import { StudentsService } from '../../apps/api/src/students/application/services/students.service';
import { DrizzleStudentRepository } from '../../apps/api/src/students/infrastructure/drizzle-student.repository';
import { STUDENT_REPOSITORY } from '../../apps/api/src/students/domain/tokens';
import { TeachersController } from '../../apps/api/src/teachers/presentation/teachers.controller';
import { TeachersService } from '../../apps/api/src/teachers/application/services/teachers.service';
import { DrizzleTeacherRepository } from '../../apps/api/src/teachers/infrastructure/drizzle-teacher.repository';
import { TEACHER_REPOSITORY } from '../../apps/api/src/teachers/domain/tokens';
import { ClassesController } from '../../apps/api/src/classes/presentation/classes.controller';
import { ClassesService } from '../../apps/api/src/classes/application/services/classes.service';
import { EnrollmentsService } from '../../apps/api/src/classes/application/services/enrollments.service';
import { DrizzleClassRepository } from '../../apps/api/src/classes/infrastructure/drizzle-class.repository';
import { DrizzleEnrollmentRepository } from '../../apps/api/src/classes/infrastructure/drizzle-enrollment.repository';
import { CLASS_REPOSITORY, ENROLLMENT_REPOSITORY } from '../../apps/api/src/classes/domain/tokens';
import { PayrollController, TeacherPayrollController } from '../../apps/api/src/payroll/presentation/payroll.controller';
import { PayrollService } from '../../apps/api/src/payroll/application/services/payroll.service';
import { PayrollPolicy } from '../../apps/api/src/payroll/domain/policies/payroll.policy';
import { NotificationService } from '../../apps/api/src/notifications/application/services/notification.service';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [ClassesController, StudentsController, TeachersController, PayrollController, TeacherPayrollController],
  providers: [
    ClassesService,
    EnrollmentsService,
    StudentsService,
    TeachersService,
    PayrollService,
    PayrollPolicy,
    NotificationService,
    TeacherOwnershipPolicy,
    AuthService,
    AuthGuard,
    RolesGuard,
    { provide: CLASS_REPOSITORY, useClass: DrizzleClassRepository },
    { provide: ENROLLMENT_REPOSITORY, useClass: DrizzleEnrollmentRepository },
    { provide: STUDENT_REPOSITORY, useClass: DrizzleStudentRepository },
    { provide: TEACHER_REPOSITORY, useClass: DrizzleTeacherRepository },
    { provide: DRIZZLE_DB, useFactory: () => sharedDb },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKEN_SERVICE, useClass: CryptoSessionTokenService },
    { provide: LOGIN_RATE_LIMITER, useClass: MemoryLoginRateLimiter },
    { provide: SECURITY_AUDIT_SERVICE, useClass: DrizzleSecurityAuditService },
  ],
})
class TeacherDataAccessModule {}

describe('Teacher data access is enforced by the backend', () => {
  let pg: PGlite;
  let app: INestApplication;
  let baseUrl: string;

  let supervisor: string; // bearer tokens
  let teacherA: string;
  let teacherB: string;
  let orphanTeacher: string; // TEACHER role but no linked teacher record

  let teacherAId: string;
  let teacherBId: string;
  let classA1: string; // teacher A
  let classB1: string; // teacher B
  let classB2: string; // teacher B
  let studentOnlyA: string;
  let studentOnlyB: string;
  let studentShared: string; // ACTIVE in A1 and in B1
  let studentWithdrawnFromA: string; // WITHDRAWN from A1 only
  let studentUnenrolled: string;
  let payrollA: string;
  let payrollB: string;

  const api = (path: string, token?: string) =>
    fetch(`${baseUrl}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = async (path: string, token?: string) => {
    const res = await api(path, token);
    const text = await res.text();
    return { status: res.status, text, body: text ? JSON.parse(text) : null };
  };
  const ids = (items: Array<{ id: string }>) => items.map((i) => i.id).sort();

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);
    const db: any = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const authService = new AuthService(
      db,
      hasher,
      new CryptoSessionTokenService(),
      new MemoryLoginRateLimiter({ maxAttempts: 50, windowMs: 900000 }),
      new DrizzleSecurityAuditService(db),
    );

    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();
    const password = 'Password123!';
    const hash = await hasher.hash(password);

    const account = async (code: string, roleId: string) => {
      const [a] = await db.insert(accounts).values({ personnelCode: code, passwordHash: hash, isActive: true }).returning();
      await db.insert(accountRoles).values({ accountId: a.id, roleId });
      return a.id as string;
    };
    const login = async (code: string) => (await authService.login({ personnelCode: code, password })).rawToken as string;

    await account('SUP-DA', supRole.id);
    const accA = await account('TCH-DA-A', tchRole.id);
    const accB = await account('TCH-DA-B', tchRole.id);
    await account('TCH-DA-ORPHAN', tchRole.id);

    const [tA] = await db
      .insert(teachers)
      .values({ accountId: accA, firstName: 'Alice', lastName: 'Alpha', baseRate: '200.00', isActive: true })
      .returning();
    const [tB] = await db
      .insert(teachers)
      .values({ accountId: accB, firstName: 'Bob', lastName: 'Bravo', baseRate: '250.00', isActive: true })
      .returning();
    teacherAId = tA.id;
    teacherBId = tB.id;

    supervisor = await login('SUP-DA');
    teacherA = await login('TCH-DA-A');
    teacherB = await login('TCH-DA-B');
    orphanTeacher = await login('TCH-DA-ORPHAN');

    const [term] = await db
      .insert(academicTerms)
      .values({ name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-31', status: 'ACTIVE' })
      .returning();
    const [book] = await db
      .insert(books)
      .values({ name: 'English 1', level: 'A1', sequenceOrder: 1, sessionCount: 20, isTerminal: false, isActive: true })
      .returning();

    const mkClass = async (teacherId: string, name: string) => {
      const [c] = await db
        .insert(classes)
        .values({ academicTermId: term.id, bookId: book.id, teacherId, classType: 'REGULAR', status: 'ACTIVE', capacity: 12, name })
        .returning();
      return c.id as string;
    };
    classA1 = await mkClass(teacherAId, 'Alpha One');
    classB1 = await mkClass(teacherBId, 'Bravo One');
    classB2 = await mkClass(teacherBId, 'Bravo Two');

    const mkStudent = async (firstName: string) => {
      const [s] = await db.insert(students).values({ firstName, lastName: 'Student', isActive: true }).returning();
      return s.id as string;
    };
    studentOnlyA = await mkStudent('OnlyA');
    studentOnlyB = await mkStudent('OnlyB');
    studentShared = await mkStudent('Shared');
    studentWithdrawnFromA = await mkStudent('Withdrawn');
    studentUnenrolled = await mkStudent('Unenrolled');

    const enroll = (classId: string, studentId: string, status: 'ACTIVE' | 'WITHDRAWN' = 'ACTIVE') =>
      db.insert(enrollments).values({ classId, studentId, status });
    await enroll(classA1, studentOnlyA);
    await enroll(classB1, studentOnlyB);
    await enroll(classA1, studentShared);
    await enroll(classB1, studentShared);
    await enroll(classA1, studentWithdrawnFromA, 'WITHDRAWN');

    const now = new Date();
    const [pA] = await db
      .insert(payrolls)
      .values({ teacherId: teacherAId, academicTermId: term.id, status: 'DRAFT', totalAmount: '0.00', createdAt: now, updatedAt: now })
      .returning();
    // A second term would be needed for a second payroll of the same teacher; one per teacher is enough here.
    const [term2] = await db
      .insert(academicTerms)
      .values({ name: 'Winter 2027', startDate: '2027-01-01', endDate: '2027-03-31', status: 'PLANNED' })
      .returning();
    const [pB] = await db
      .insert(payrolls)
      .values({ teacherId: teacherBId, academicTermId: term2.id, status: 'DRAFT', totalAmount: '0.00', createdAt: now, updatedAt: now })
      .returning();
    payrollA = pA.id;
    payrollB = pB.id;

    app = await NestFactory.create(TeacherDataAccessModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  describe('unauthenticated requests stay rejected', () => {
    for (const path of ['/classes', '/classes/x', '/classes/x/enrollments', '/students', '/students/x', '/students/x/enrollments', '/teachers', '/teachers/x', '/payrolls', '/payrolls/x']) {
      it(`GET ${path} -> 401`, async () => {
        assert.equal((await api(path)).status, 401);
      });
    }
  });

  describe('classes', () => {
    it('a teacher lists only their own classes', async () => {
      const a = await json('/classes', teacherA);
      assert.equal(a.status, 200);
      assert.deepEqual(ids(a.body.items), [classA1]);
      const b = await json('/classes', teacherB);
      assert.deepEqual(ids(b.body.items), [classB1, classB2].sort());
    });

    it("a teacher cannot widen the list with another teacher's id in the query string", async () => {
      const res = await json(`/classes?teacherId=${teacherBId}`, teacherA);
      assert.equal(res.status, 200);
      assert.deepEqual(ids(res.body.items), [classA1]);
    });

    it("Teacher A cannot read Teacher B's class (403), but can read their own", async () => {
      const denied = await json(`/classes/${classB1}`, teacherA);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, 'FORBIDDEN_RESOURCE');
      assert.equal((await json(`/classes/${classA1}`, teacherA)).status, 200);
    });

    it('a class that does not exist is indistinguishable from one that belongs to someone else', async () => {
      const missing = await json('/classes/00000000-0000-4000-8000-000000000000', teacherA);
      assert.equal(missing.status, 403);
      assert.equal(missing.body.error.code, 'FORBIDDEN_RESOURCE');
    });

    it("Teacher A cannot read Teacher B's class roster, but can read their own", async () => {
      assert.equal((await json(`/classes/${classB1}/enrollments`, teacherA)).status, 403);
      const own = await json(`/classes/${classA1}/enrollments`, teacherA);
      assert.equal(own.status, 200);
      assert.ok(own.body.items.length >= 1);
    });

    it('a supervisor keeps unrestricted access', async () => {
      const list = await json('/classes', supervisor);
      assert.deepEqual(ids(list.body.items), [classA1, classB1, classB2].sort());
      assert.equal((await json(`/classes/${classB1}`, supervisor)).status, 200);
      assert.equal((await json(`/classes/${classB1}/enrollments`, supervisor)).status, 200);
      const filtered = await json(`/classes?teacherId=${teacherBId}`, supervisor);
      assert.deepEqual(ids(filtered.body.items), [classB1, classB2].sort());
    });

    it('an unknown id is still a 404 for a supervisor', async () => {
      assert.equal((await json('/classes/00000000-0000-4000-8000-000000000000', supervisor)).status, 404);
    });

    it('a teacher account with no linked teacher record gets nothing', async () => {
      assert.deepEqual((await json('/classes', orphanTeacher)).body.items, []);
      assert.equal((await json(`/classes/${classA1}`, orphanTeacher)).status, 403);
      assert.equal((await json(`/classes/${classA1}/enrollments`, orphanTeacher)).status, 403);
    });
  });

  describe('students', () => {
    it('a teacher lists only students actively enrolled in their own classes (mixed enrollment included)', async () => {
      const a = await json('/students', teacherA);
      assert.equal(a.status, 200);
      assert.deepEqual(ids(a.body.items), [studentOnlyA, studentShared].sort());
      const b = await json('/students', teacherB);
      assert.deepEqual(ids(b.body.items), [studentOnlyB, studentShared].sort());
    });

    it('a student with two teachers is not duplicated in the list', async () => {
      const a = await json('/students', teacherA);
      assert.equal(a.body.items.filter((s: any) => s.id === studentShared).length, 1);
      assert.equal(a.body.total, 2);
    });

    it("a search cannot reach another teacher's students", async () => {
      const res = await json('/students?search=OnlyB', teacherA);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.total, 0);
    });

    it("Teacher A cannot read a student who is only in Teacher B's classes, but can read their own and shared ones", async () => {
      const denied = await json(`/students/${studentOnlyB}`, teacherA);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, 'FORBIDDEN_RESOURCE');
      assert.equal((await json(`/students/${studentOnlyA}`, teacherA)).status, 200);
      assert.equal((await json(`/students/${studentShared}`, teacherA)).status, 200);
      assert.equal((await json(`/students/${studentShared}`, teacherB)).status, 200);
    });

    it('a student with no active enrollment with the teacher is not readable (withdrawn, unenrolled, missing)', async () => {
      assert.equal((await json(`/students/${studentWithdrawnFromA}`, teacherA)).status, 403);
      assert.equal((await json(`/students/${studentUnenrolled}`, teacherA)).status, 403);
      assert.equal((await json('/students/00000000-0000-4000-8000-000000000000', teacherA)).status, 403);
    });

    it("a teacher sees only the enrollments in their own classes for a student who also studies with another teacher", async () => {
      const a = await json(`/students/${studentShared}/enrollments`, teacherA);
      assert.equal(a.status, 200);
      assert.deepEqual(a.body.map((e: any) => e.classId), [classA1]);
      const b = await json(`/students/${studentShared}/enrollments`, teacherB);
      assert.deepEqual(b.body.map((e: any) => e.classId), [classB1]);
      const sup = await json(`/students/${studentShared}/enrollments`, supervisor);
      assert.deepEqual(sup.body.map((e: any) => e.classId).sort(), [classA1, classB1].sort());
    });

    it("a teacher cannot read the enrollments of another teacher's student", async () => {
      assert.equal((await json(`/students/${studentOnlyB}/enrollments`, teacherA)).status, 403);
    });

    it('a supervisor keeps unrestricted access', async () => {
      const list = await json('/students', supervisor);
      assert.equal(list.body.total, 5);
      for (const id of [studentOnlyA, studentOnlyB, studentWithdrawnFromA, studentUnenrolled]) {
        assert.equal((await json(`/students/${id}`, supervisor)).status, 200);
      }
      assert.equal((await json('/students/00000000-0000-4000-8000-000000000000', supervisor)).status, 404);
    });

    it('a teacher account with no linked teacher record gets nothing', async () => {
      assert.deepEqual((await json('/students', orphanTeacher)).body.items, []);
      assert.equal((await json(`/students/${studentOnlyA}`, orphanTeacher)).status, 403);
    });
  });

  describe('pay rates (baseRate)', () => {
    it("no teacher response sent to a teacher contains a pay rate, theirs or another teacher's", async () => {
      const list = await json('/teachers', teacherA);
      assert.equal(list.status, 200);
      assert.equal(list.body.items.length, 2);
      for (const t of list.body.items) assert.equal('baseRate' in t, false, `baseRate leaked for ${t.firstName}`);
      assert.ok(!list.text.includes('250.00') && !list.text.includes('200.00'), 'a rate value appears in the raw body');

      for (const id of [teacherAId, teacherBId]) {
        const one = await json(`/teachers/${id}`, teacherA);
        assert.equal(one.status, 200);
        assert.equal('baseRate' in one.body, false);
        assert.ok(!one.text.includes('250.00') && !one.text.includes('200.00'));
      }
    });

    it('a supervisor still sees every pay rate', async () => {
      const list = await json('/teachers', supervisor);
      const byName = Object.fromEntries(list.body.items.map((t: any) => [t.firstName, t.baseRate]));
      assert.equal(byName.Alice, '200.00');
      assert.equal(byName.Bob, '250.00');
      assert.equal((await json(`/teachers/${teacherBId}`, supervisor)).body.baseRate, '250.00');
    });

    it("a teacher's own payroll does not carry the pay rate", async () => {
      const res = await json(`/payrolls/${payrollA}`, teacherA);
      assert.equal(res.status, 200);
      assert.equal(res.body.teacher.baseRate ?? null, null);
      assert.ok(!res.text.includes('200.00'), 'the pay rate appears in the raw payroll body');
    });

    it('a supervisor still sees the pay rate on a payroll', async () => {
      const res = await json(`/payrolls/${payrollB}`, supervisor);
      assert.equal(res.status, 200);
      assert.equal(res.body.teacher.baseRate, '250.00');
    });

    it("a teacher cannot read another teacher's payroll, by id, by list or by teacher id", async () => {
      assert.equal((await json(`/payrolls/${payrollB}`, teacherA)).status, 403);
      assert.deepEqual(ids((await json('/payrolls', teacherA)).body), [payrollA]);
      assert.equal((await json(`/teachers/${teacherBId}/payrolls`, teacherA)).status, 403);
      assert.equal((await json(`/teachers/${teacherAId}/payrolls`, teacherA)).status, 200);
    });
  });
});
