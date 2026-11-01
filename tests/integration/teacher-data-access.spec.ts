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
import { payrolls, payrollItems } from '../../apps/api/src/infrastructure/database/schema/payroll.schema';
import { lessonPlans } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { classSessions } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { substitutionRequests } from '../../apps/api/src/infrastructure/database/schema/substitutions.schema';
import { attendanceRecords, teacherAttendanceRecords } from '../../apps/api/src/infrastructure/database/schema/attendance.schema';
import { LessonPlansController } from '../../apps/api/src/education/presentation/lesson-plans.controller';
import { ClassLessonPlansController } from '../../apps/api/src/education/presentation/class-lesson-plans.controller';
import { LessonPlanService } from '../../apps/api/src/education/application/services/lesson-plan.service';
import { TeacherAttendanceSummaryController } from '../../apps/api/src/sessions/presentation/teacher-attendance-summary.controller';
import { AttendanceService } from '../../apps/api/src/sessions/application/services/attendance.service';
import { exams, examResults, promotions } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { eq } from 'drizzle-orm';
import { notifications } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { NotificationsController } from '../../apps/api/src/notifications/presentation/notifications.controller';
import { PromotionsController } from '../../apps/api/src/education/presentation/promotions.controller';
import { PromotionService } from '../../apps/api/src/education/application/services/promotion.service';
import { StudentPromotionsController } from '../../apps/api/src/education/presentation/student-promotions.controller';
import { ExamsController } from '../../apps/api/src/education/presentation/exams.controller';
import { ExamService } from '../../apps/api/src/education/application/services/exam.service';
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
import { EnrollmentsController } from '../../apps/api/src/classes/presentation/enrollments.controller';
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
  controllers: [ClassesController, EnrollmentsController, StudentsController, TeachersController, PayrollController, TeacherPayrollController, PromotionsController, StudentPromotionsController, ExamsController, LessonPlansController, ClassLessonPlansController, TeacherAttendanceSummaryController, NotificationsController],
  providers: [
    ClassesService,
    EnrollmentsService,
    StudentsService,
    TeachersService,
    PayrollService,
    PromotionService,
    ExamService,
    LessonPlanService,
    AttendanceService,
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
  let termId: string;
  let bookId: string;

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

    termId = term.id;
    bookId = book.id;
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

    it('a supervisor still sees the pay rate on a payroll', async () => {
      const res = await json(`/payrolls/${payrollB}`, supervisor);
      assert.equal(res.status, 200);
      assert.equal(res.body.teacher.baseRate, '250.00');
    });

    it('a teacher gets no payroll data at all: own or others, by id, list, items or teacher id', async () => {
      for (const token of [teacherA, teacherB]) {
        for (const p of [payrollA, payrollB]) {
          assert.equal((await json(`/payrolls/${p}`, token)).status, 403);
          assert.equal((await json(`/payrolls/${p}/items`, token)).status, 403);
        }
        assert.equal((await json('/payrolls', token)).status, 403);
        for (const t of [teacherAId, teacherBId]) {
          assert.equal((await json(`/teachers/${t}/payrolls`, token)).status, 403);
        }
      }
      assert.equal((await json('/payrolls', orphanTeacher)).status, 403);
    });

    it('a supervisor keeps full payroll access', async () => {
      assert.deepEqual(ids((await json('/payrolls', supervisor)).body), [payrollA, payrollB].sort());
      assert.equal((await json(`/teachers/${teacherAId}/payrolls`, supervisor)).status, 200);
      assert.equal((await json(`/payrolls/${payrollA}/items`, supervisor)).status, 200);
    });
  });

  describe('current-term visibility, financial items, exam and promotion ownership', () => {
    const db = () => sharedDb;
    const mkStudent = async (firstName: string) =>
      (await db().insert(students).values({ firstName, lastName: 'Cur', isActive: true }).returning())[0].id as string;
    const mkClass = async (teacherId: string, status: string, academicTermId: string = termId) =>
      (
        await db()
          .insert(classes)
          .values({ academicTermId, bookId, teacherId, classType: 'REGULAR', status, capacity: 12, name: `C-${status}` })
          .returning()
      )[0].id as string;
    const enrollIn = (classId: string, studentId: string, status = 'ACTIVE') =>
      db().insert(enrollments).values({ classId, studentId, status });
    const visibleTo = async (token: string, studentId: string) => {
      const list = await json('/students?pageSize=100', token);
      const detail = await json(`/students/${studentId}`, token);
      const enr = await json(`/students/${studentId}/enrollments`, token);
      return { inList: list.body.items.some((s: any) => s.id === studentId), detail: detail.status, enr: enr.status };
    };

    it('students whose only class with the teacher is not ACTIVE-in-the-ACTIVE-term are not visible', async () => {
      const closedTerm = (await db().insert(academicTerms).values({ name: 'Old', startDate: '2025-01-01', endDate: '2025-06-01', status: 'CLOSED' }).returning())[0].id;
      const plannedTerm = (await db().insert(academicTerms).values({ name: 'Next', startDate: '2027-06-01', endDate: '2027-09-01', status: 'PLANNED' }).returning())[0].id;
      const cases: Array<[string, string, string]> = [
        ['completedClass', 'COMPLETED', termId],
        ['cancelledClass', 'CANCELLED', termId],
        ['draftClass', 'DRAFT', termId],
        ['closedTermClass', 'ACTIVE', closedTerm],
        ['plannedTermClass', 'ACTIVE', plannedTerm],
      ];
      for (const [label, status, term] of cases) {
        const sid = await mkStudent(label);
        await enrollIn(await mkClass(teacherAId, status, term), sid);
        assert.deepEqual(await visibleTo(teacherA, sid), { inList: false, detail: 403, enr: 403 }, label);
        assert.equal((await json(`/students/${sid}`, supervisor)).status, 200, `${label} supervisor`);
      }
    });

    it('a student who changes class stops being visible to the old teacher and becomes visible to the new one', async () => {
      const sid = await mkStudent('Mover');
      await enrollIn(classA1, sid);
      assert.deepEqual(await visibleTo(teacherA, sid), { inList: true, detail: 200, enr: 200 });
      assert.equal((await visibleTo(teacherB, sid)).detail, 403);

      await db().update(enrollments).set({ status: 'WITHDRAWN' }).where(eq(enrollments.studentId, sid));
      await enrollIn(classB1, sid);

      assert.deepEqual(await visibleTo(teacherA, sid), { inList: false, detail: 403, enr: 403 });
      assert.deepEqual(await visibleTo(teacherB, sid), { inList: true, detail: 200, enr: 200 });
      // history is kept for the supervisor
      const sup = await json(`/students/${sid}/enrollments`, supervisor);
      assert.equal(sup.body.length, 2);
    });

    it('visibility ends when the class is completed or the term is closed', async () => {
      const t = (await db().insert(academicTerms).values({ name: 'Spring', startDate: '2026-03-01', endDate: '2026-06-01', status: 'ACTIVE' }).returning())[0].id;
      const c = await mkClass(teacherAId, 'ACTIVE', t);
      const sid = await mkStudent('TermEnds');
      await enrollIn(c, sid);
      assert.equal((await visibleTo(teacherA, sid)).detail, 200);
      assert.equal((await json(`/classes/${c}/enrollments`, teacherA)).body.items.length, 1);

      await db().update(academicTerms).set({ status: 'CLOSED' }).where(eq(academicTerms.id, t));
      assert.deepEqual(await visibleTo(teacherA, sid), { inList: false, detail: 403, enr: 403 });
      assert.equal((await json(`/classes/${c}/enrollments`, teacherA)).status, 403);
      assert.equal((await json(`/classes/${c}/enrollments`, supervisor)).body.items.length, 1);

      const c2 = await mkClass(teacherAId, 'ACTIVE');
      const sid2 = await mkStudent('ClassEnds');
      await enrollIn(c2, sid2);
      assert.equal((await visibleTo(teacherA, sid2)).detail, 200);
      await db().update(classes).set({ status: 'COMPLETED' }).where(eq(classes.id, c2));
      assert.equal((await visibleTo(teacherA, sid2)).detail, 403);
    });

    it('a teacher roster lists only ACTIVE enrollments of a current class; a supervisor sees all', async () => {
      const a = await json(`/classes/${classA1}/enrollments?pageSize=100`, teacherA);
      assert.ok(a.body.items.every((e: any) => e.status === 'ACTIVE'));
      assert.ok(!a.body.items.some((e: any) => e.studentId === studentWithdrawnFromA));
      const sup = await json(`/classes/${classA1}/enrollments?pageSize=100`, supervisor);
      assert.ok(sup.body.items.some((e: any) => e.studentId === studentWithdrawnFromA));
    });

    it('payroll items and their rates are visible to a supervisor only', async () => {
      await db().insert(payrollItems).values({ payrollId: payrollA, type: 'SESSION', quantity: '2.00', rate: '200.00', amount: '400.00' });
      for (const path of [`/payrolls/${payrollA}/items`, `/payrolls/${payrollA}`]) {
        assert.equal((await json(path, teacherA)).status, 403, path);
        const s = await json(path, supervisor);
        assert.ok(s.text.includes('"rate":"200.00"'), `${path} supervisor must see the rate`);
      }
    });

    it('payroll notifications carry no amount, and old ones are redacted for teachers', async () => {
      const [accA] = await db().select().from(accounts).where(eq(accounts.personnelCode, 'TCH-DA-A'));
      await db().insert(notifications).values({
        recipientAccountId: accA.id,
        type: 'PAYROLL_FINALIZED',
        title: 'Payroll Finalized',
        message: 'Your payroll of 12345.67 has been finalized.',
        referenceEntityType: 'PAYROLL',
        referenceEntityId: payrollA,
      });
      const [accSup] = await db().select().from(accounts).where(eq(accounts.personnelCode, 'SUP-DA'));
      await db().insert(notifications).values({
        recipientAccountId: accSup.id,
        type: 'PAYROLL_FINALIZED',
        title: 'Payroll Finalized',
        message: 'Payroll of 12345.67 has been finalized.',
        referenceEntityType: 'PAYROLL',
        referenceEntityId: payrollA,
      });
      const res = await json('/notifications', teacherA);
      assert.equal(res.status, 200);
      assert.ok(!res.text.includes('12345.67'), 'an amount reached the teacher');
      const n = res.body.data.find((x: any) => x.type === 'PAYROLL_FINALIZED');
      assert.ok(n);
      assert.equal(n.referenceEntityType, null, 'no payroll link for a teacher');
      assert.equal(n.referenceEntityId, null);
      assert.ok(!res.text.includes(payrollA), 'the payroll id reached the teacher');
      // marking it read returns the same safe presentation
      const read = await fetch(`${baseUrl}/api/v1/notifications/${n.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${teacherA}` } });
      const readText = await read.text();
      assert.ok(!readText.includes('12345.67') && !readText.includes(payrollA));
      // the supervisor keeps their own notification untouched
      const sup = await json('/notifications', supervisor);
      const sn = sup.body.data.find((x: any) => x.type === 'PAYROLL_FINALIZED');
      assert.equal(sn.referenceEntityId, payrollA);
      assert.ok(sn.message.includes('12345.67'));
    });

    it('only current ACTIVE classes of the ACTIVE term appear to a teacher; excluded ones are denied directly', async () => {
      const closed = (await db().insert(academicTerms).values({ name: 'Prev', startDate: '2025-01-01', endDate: '2025-05-01', status: 'CLOSED' }).returning())[0].id;
      const planned = (await db().insert(academicTerms).values({ name: 'Future', startDate: '2028-01-01', endDate: '2028-05-01', status: 'PLANNED' }).returning())[0].id;
      const excluded = [
        await mkClass(teacherBId, 'DRAFT'),
        await mkClass(teacherBId, 'COMPLETED'),
        await mkClass(teacherBId, 'CANCELLED'),
        await mkClass(teacherBId, 'ACTIVE', closed),
        await mkClass(teacherBId, 'ACTIVE', planned),
        await mkClass(teacherBId, 'DRAFT', planned),
      ];
      const list = await json('/classes?pageSize=100', teacherB);
      assert.deepEqual(ids(list.body.items), [classB1, classB2].sort());
      assert.equal(list.body.total, 2);
      // query parameters cannot bring them back
      for (const q of ['status=DRAFT', 'status=COMPLETED', `academicTermId=${closed}`, `academicTermId=${planned}`, `teacherId=${teacherAId}`]) {
        const r = await json(`/classes?${q}`, teacherB);
        assert.equal(r.status, 200, q);
        assert.ok(!r.body.items.some((c: any) => excluded.includes(c.id)), q);
      }
      for (const id of excluded) {
        assert.equal((await json(`/classes/${id}`, teacherB)).status, 403, id);
        assert.equal((await json(`/classes/${id}/enrollments`, teacherB)).status, 403, id);
        assert.equal((await json(`/classes/${id}`, supervisor)).status, 200, `supervisor ${id}`);
      }
      assert.equal((await json(`/teachers/${teacherBId}/classes`, teacherB)).body.items.some((c: any) => excluded.includes(c.id)), false);
      assert.equal((await json(`/teachers/${teacherBId}/classes`, supervisor)).body.items.some((c: any) => excluded.includes(c.id)), true);
      const all = await json('/classes?pageSize=100', supervisor);
      for (const id of excluded) assert.ok(all.body.items.some((c: any) => c.id === id));
    });

    it("a teacher's attendance counts are visible to that teacher and the supervisor only, and only count teacher attendance", async () => {
      const [sup] = await db().select().from(accounts).where(eq(accounts.personnelCode, 'SUP-DA'));
      const session = async (classId: string, day: number) =>
        (await db().insert(classSessions).values({ classId, sessionDate: `2026-10-${String(day).padStart(2, '0')}`, startTime: '10:00', endTime: '11:00', status: 'COMPLETED' }).returning())[0].id as string;
      const rec = async (sessionId: string, teacherId: string, status: string) =>
        db().insert(teacherAttendanceRecords).values({ classSessionId: sessionId, teacherId, status, recordedBy: sup.id });
      const a1 = await session(classA1, 1);
      const a2 = await session(classA1, 2);
      const a3 = await session(classA1, 3);
      await rec(a1, teacherAId, 'PRESENT');
      await rec(a2, teacherAId, 'PRESENT');
      await rec(a3, teacherAId, 'ABSENT');
      const b1 = await session(classB1, 1);
      await rec(b1, teacherBId, 'EXCUSED');
      // student attendance in the same sessions must not be counted
      await db().insert(attendanceRecords).values({ classSessionId: a1, studentId: studentOnlyA, status: 'ABSENT', recordedBy: sup.id });

      const own = await json(`/teachers/${teacherAId}/attendance-summary`, teacherA);
      assert.equal(own.status, 200);
      assert.deepEqual(own.body, { teacherId: teacherAId, scope: 'ALL', academicTermId: null, sessionsAttended: 2, sessionsAbsent: 1, sessionsExcused: 0, sessionsRecorded: 3 });
      assert.ok(!/rate|amount|total|pay/i.test(Object.keys(own.body).join(',')), 'no financial key');

      const ownB = await json(`/teachers/${teacherBId}/attendance-summary`, teacherB);
      assert.deepEqual(ownB.body, { teacherId: teacherBId, scope: 'ALL', academicTermId: null, sessionsAttended: 0, sessionsAbsent: 0, sessionsExcused: 1, sessionsRecorded: 1 });

      assert.equal((await json(`/teachers/${teacherBId}/attendance-summary`, teacherA)).status, 403);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary`, teacherB)).status, 403);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary`, orphanTeacher)).status, 403);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary`)).status, 401);

      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary`, supervisor)).body.sessionsAbsent, 1);
      assert.equal((await json(`/teachers/${teacherBId}/attendance-summary`, supervisor)).body.sessionsExcused, 1);
      assert.equal((await json('/teachers/00000000-0000-4000-8000-000000000000/attendance-summary', supervisor)).status, 404);
    });

    it('the attendance summary can be limited to the current term or to a specified term', async () => {
      const [sup] = await db().select().from(accounts).where(eq(accounts.personnelCode, 'SUP-DA'));
      const oldTerm = (await db().insert(academicTerms).values({ name: 'Summary Old', startDate: '2024-01-01', endDate: '2024-05-01', status: 'CLOSED' }).returning())[0].id as string;
      const oldClass = await mkClass(teacherAId, 'COMPLETED', oldTerm);
      const mk = async (day: number, status: string) => {
        const sid = (await db().insert(classSessions).values({ classId: oldClass, sessionDate: `2024-02-${String(day).padStart(2, '0')}`, startTime: '10:00', endTime: '11:00', status: 'COMPLETED' }).returning())[0].id;
        await db().insert(teacherAttendanceRecords).values({ classSessionId: sid, teacherId: teacherAId, status, recordedBy: sup.id });
      };
      await mk(1, 'PRESENT');
      await mk(2, 'ABSENT');
      await mk(3, 'ABSENT');

      const counts = (b: any) => [b.sessionsAttended, b.sessionsAbsent, b.sessionsExcused, b.sessionsRecorded];
      const all = await json(`/teachers/${teacherAId}/attendance-summary`, teacherA);
      assert.deepEqual(counts(all.body), [3, 3, 0, 6]);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary?term=all`, teacherA)).body.sessionsRecorded, 6);

      const current = await json(`/teachers/${teacherAId}/attendance-summary?term=current`, teacherA);
      assert.equal(current.status, 200);
      assert.equal(current.body.scope, 'CURRENT');
      assert.deepEqual(counts(current.body), [2, 1, 0, 3]); // only the sessions of the ACTIVE-term classes

      const old = await json(`/teachers/${teacherAId}/attendance-summary?term=${oldTerm}`, teacherA);
      assert.equal(old.body.scope, 'TERM');
      assert.equal(old.body.academicTermId, oldTerm);
      assert.deepEqual(counts(old.body), [1, 2, 0, 3]);

      const empty = (await db().insert(academicTerms).values({ name: 'Summary Empty', startDate: '2030-01-01', endDate: '2030-05-01', status: 'PLANNED' }).returning())[0].id;
      assert.deepEqual(counts((await json(`/teachers/${teacherAId}/attendance-summary?term=${empty}`, teacherA)).body), [0, 0, 0, 0]);

      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary?term=nope`, teacherA)).status, 400);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary?term=00000000-0000-4000-8000-000000000000`, teacherA)).status, 404);
      // still own-only, whatever the term
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary?term=${oldTerm}`, teacherB)).status, 403);
      assert.equal((await json(`/teachers/${teacherAId}/attendance-summary?term=current`, teacherB)).status, 403);
      assert.deepEqual(counts((await json(`/teachers/${teacherAId}/attendance-summary?term=${oldTerm}`, supervisor)).body), [1, 2, 0, 3]);
    });

    it('an approved substitute reads the lesson plans of that class only; an unapproved one cannot', async () => {
      const [sup] = await db().select().from(accounts).where(eq(accounts.personnelCode, 'SUP-DA'));
      const classA2 = await mkClass(teacherAId, 'ACTIVE');
      const plan = async (classId: string) =>
        (await db().insert(lessonPlans).values({ classId, teacherId: teacherAId, status: 'APPROVED' }).returning())[0].id as string;
      const planA1 = await plan(classA1);
      const planA2 = await plan(classA2);
      const sess = async (classId: string, day: number) =>
        (await db().insert(classSessions).values({ classId, sessionDate: `2026-11-${String(day).padStart(2, '0')}`, startTime: '10:00', endTime: '11:00' }).returning())[0].id as string;
      const sA1 = await sess(classA1, 10);
      const sA2 = await sess(classA2, 10);

      const reads = async (token: string) => ({
        a1Plan: (await json(`/lesson-plans/${planA1}`, token)).status,
        a1List: (await json(`/classes/${classA1}/lesson-plans`, token)).status,
        a2Plan: (await json(`/lesson-plans/${planA2}`, token)).status,
        a2List: (await json(`/classes/${classA2}/lesson-plans`, token)).status,
      });
      const denied = { a1Plan: 403, a1List: 403, a2Plan: 403, a2List: 403 };

      // regular class teacher keeps access
      assert.deepEqual(await reads(teacherA), { a1Plan: 200, a1List: 200, a2Plan: 200, a2List: 200 });
      // Teacher B has no relation to Teacher A's classes
      assert.deepEqual(await reads(teacherB), denied);

      // a request that is not approved gives no access
      const [req] = await db().insert(substitutionRequests).values({ classSessionId: sA1, requestedBy: sup.id, status: 'RESPONDED', approvedTeacherId: teacherBId }).returning();
      assert.deepEqual(await reads(teacherB), denied);
      for (const status of ['REJECTED', 'CANCELLED']) {
        await db().update(substitutionRequests).set({ status }).where(eq(substitutionRequests.id, req.id));
        assert.deepEqual(await reads(teacherB), denied, status);
      }

      // approved for a session of class A1 -> A1's plans only, never A2's
      await db().update(substitutionRequests).set({ status: 'APPROVED' }).where(eq(substitutionRequests.id, req.id));
      assert.deepEqual(await reads(teacherB), { a1Plan: 200, a1List: 200, a2Plan: 403, a2List: 403 });
      // after the session reaches COMPLETED (its APPROVED request becomes COMPLETED) the access is kept, for that class only
      await db().update(classSessions).set({ status: 'COMPLETED' }).where(eq(classSessions.id, sA1));
      await db().update(substitutionRequests).set({ status: 'COMPLETED' }).where(eq(substitutionRequests.id, req.id));
      assert.deepEqual(await reads(teacherB), { a1Plan: 200, a1List: 200, a2Plan: 403, a2List: 403 });
      // a COMPLETED request approved for another teacher still grants nothing
      await db().update(substitutionRequests).set({ approvedTeacherId: teacherAId }).where(eq(substitutionRequests.id, req.id));
      assert.deepEqual(await reads(teacherB), denied);
      await db().update(substitutionRequests).set({ approvedTeacherId: teacherBId, status: 'APPROVED' }).where(eq(substitutionRequests.id, req.id));

      // approval of someone else does not help
      await db().update(substitutionRequests).set({ approvedTeacherId: teacherAId }).where(eq(substitutionRequests.id, req.id));
      assert.deepEqual(await reads(teacherB), denied);

      // supervisor unrestricted
      assert.deepEqual(await reads(supervisor), { a1Plan: 200, a1List: 200, a2Plan: 200, a2List: 200 });
      void sA2;
    });

    it('promotions and exams are limited to the teacher\'s own classes', async () => {
      const mk = async (classId: string, studentId: string) => {
        const [ex] = await db().insert(exams).values({ classId, examDate: '2026-11-01', type: 'FINAL' }).returning();
        const [er] = await db().insert(examResults).values({ examId: ex.id, studentId, score: '90.00' }).returning();
        const [pr] = await db()
          .insert(promotions)
          .values({ studentId, fromBookId: bookId, examResultId: er.id, status: 'PENDING_DECISION' })
          .returning();
        return { exam: ex.id as string, promotion: pr.id as string };
      };
      const a = await mk(classA1, studentOnlyA);
      const b = await mk(classB1, studentOnlyB);

      const list = await json('/promotions', teacherA);
      assert.equal(list.status, 200);
      assert.deepEqual(ids(list.body), [a.promotion]);
      assert.equal((await json(`/promotions/${a.promotion}`, teacherA)).status, 200);
      assert.equal((await json(`/promotions/${b.promotion}`, teacherA)).status, 403);
      assert.equal((await json(`/promotions?studentId=${studentOnlyB}`, teacherA)).body.length, 0);
      assert.equal((await json(`/students/${studentOnlyB}/promotions`, teacherA)).body.length, 0);
      assert.equal((await json('/promotions', supervisor)).body.length >= 2, true);
      assert.equal((await json(`/promotions/${b.promotion}`, supervisor)).status, 200);

      assert.equal((await json(`/exams/${a.exam}`, teacherA)).status, 200);
      assert.equal((await json(`/exams/${b.exam}`, teacherA)).status, 403);
      assert.equal((await json(`/exams/${b.exam}/results`, teacherA)).status, 403);
      assert.equal((await json(`/exams/${b.exam}`, supervisor)).status, 200);
    });
  });

  describe('GET /enrollments/:id (object-level authorization)', () => {
    const db = () => sharedDb;
    const MISSING_ID = '00000000-0000-4000-8000-000000000000';
    const mkStudent = async (firstName: string) =>
      (await db().insert(students).values({ firstName, lastName: 'Enr', isActive: true }).returning())[0].id as string;
    const mkClass = async (teacherId: string, status: string, academicTermId: string = termId) =>
      (
        await db()
          .insert(classes)
          .values({ academicTermId, bookId, teacherId, classType: 'REGULAR', status, capacity: 12, name: `E-${status}` })
          .returning()
      )[0].id as string;
    const mkEnrollment = async (classId: string, status = 'ACTIVE') =>
      (await db().insert(enrollments).values({ classId, studentId: await mkStudent(`E-${status}`), status }).returning())[0] as {
        id: string;
        classId: string;
        studentId: string;
      };
    const assertForbidden = (res: { status: number; body: any }, label: string) => {
      assert.equal(res.status, 403, label);
      assert.equal(res.body.error.code, 'FORBIDDEN_RESOURCE', label);
    };

    it('a teacher reads their own ACTIVE enrollment in an ACTIVE class of the ACTIVE term', async () => {
      const enr = await mkEnrollment(classA1);
      const res = await json(`/enrollments/${enr.id}`, teacherA);
      assert.equal(res.status, 200);
      assert.equal(res.body.id, enr.id);
      assert.equal(res.body.classId, classA1);
      assert.equal(res.body.studentId, enr.studentId);
      assert.equal(res.body.status, 'ACTIVE');
    });

    it("a teacher cannot read another teacher's enrollment by changing the id", async () => {
      const enr = await mkEnrollment(classB1);
      assertForbidden(await json(`/enrollments/${enr.id}`, teacherA), 'teacher A -> teacher B enrollment');
      assert.equal((await json(`/enrollments/${enr.id}`, teacherB)).status, 200, 'its own teacher still can');
    });

    it('a teacher cannot read an enrollment in their own COMPLETED class', async () => {
      const enr = await mkEnrollment(await mkClass(teacherAId, 'COMPLETED'));
      assertForbidden(await json(`/enrollments/${enr.id}`, teacherA), 'completed class');
    });

    it('a teacher cannot read an enrollment in a class of a CLOSED academic term', async () => {
      const closedTerm = (
        await db()
          .insert(academicTerms)
          .values({ name: 'Closed (enrollment by id)', startDate: '2025-01-01', endDate: '2025-06-01', status: 'CLOSED' })
          .returning()
      )[0].id as string;
      const enr = await mkEnrollment(await mkClass(teacherAId, 'ACTIVE', closedTerm));
      assertForbidden(await json(`/enrollments/${enr.id}`, teacherA), 'closed term');
    });

    it('a teacher cannot read a WITHDRAWN enrollment, even in their own current class', async () => {
      const enr = await mkEnrollment(classA1, 'WITHDRAWN');
      assertForbidden(await json(`/enrollments/${enr.id}`, teacherA), 'withdrawn enrollment');
    });

    it('a nonexistent enrollment id gives a teacher the same 403 as a forbidden one', async () => {
      const forbidden = await json(`/enrollments/${(await mkEnrollment(classB1)).id}`, teacherA);
      const missing = await json(`/enrollments/${MISSING_ID}`, teacherA);
      assertForbidden(missing, 'nonexistent id');
      assert.deepEqual(missing.body.error, forbidden.body.error, 'indistinguishable from a forbidden id');
    });

    it('a teacher account with no linked teacher record gets 403 for existing and nonexistent ids', async () => {
      const enr = await mkEnrollment(classA1);
      assertForbidden(await json(`/enrollments/${enr.id}`, orphanTeacher), 'orphan, existing');
      assertForbidden(await json(`/enrollments/${MISSING_ID}`, orphanTeacher), 'orphan, nonexistent');
    });

    it('a supervisor reads any existing enrollment, whatever its class, term or status', async () => {
      const own = await mkEnrollment(classA1);
      const other = await mkEnrollment(classB1);
      const withdrawn = await mkEnrollment(classA1, 'WITHDRAWN');
      for (const e of [own, other, withdrawn]) {
        const res = await json(`/enrollments/${e.id}`, supervisor);
        assert.equal(res.status, 200);
        assert.equal(res.body.id, e.id);
      }
    });

    it('a supervisor still gets 404 for a nonexistent enrollment', async () => {
      const res = await json(`/enrollments/${MISSING_ID}`, supervisor);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'RESOURCE_NOT_FOUND');
    });
  });
});
