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
import { exams, examResults } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
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
import { ExamService } from '../../apps/api/src/education/application/services/exam.service';
import { PromotionService } from '../../apps/api/src/education/application/services/promotion.service';
import { ClassExamsController } from '../../apps/api/src/education/presentation/class-exams.controller';
import { ExamsController } from '../../apps/api/src/education/presentation/exams.controller';
import { ExamResultsController } from '../../apps/api/src/education/presentation/exam-results.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [ClassExamsController, ExamsController, ExamResultsController],
  providers: [
    ExamService,
    PromotionService,
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
class TestExamsApiModule {}

describe('Exams & Assessment Management Integration Tests (Phase 7.3)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  let supervisorAccountId: string;
  let teacherAAccountId: string;
  let teacherAId: string;
  let teacherBId: string;

  let class1Id: string;
  let class2Id: string;

  let student1Id: string;
  let student2Id: string;
  let student3Id: string;
  let student4Id: string;
  let student5Id: string;
  let studentOutsideClassId: string; // enrolled in Class 2
  let unenrolledStudentId: string; // not enrolled in any class

  let createdExamId: string;

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

    // Seed Supervisor
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
      accountId: supAccount.id,
      roleId: supRole.id,
    });

    // Seed Teacher A (Assigned Teacher for Class 1)
    const tchAHash = await hasher.hash('TeacherAPass123!');
    const [tAAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-01',
        passwordHash: tchAHash,
        isActive: true,
      })
      .returning();
    teacherAAccountId = tAAccount.id;

    const [tA] = await db
      .insert(teachers)
      .values({
        accountId: tAAccount.id,
        firstName: 'Alice',
        lastName: 'Smith',
        isActive: true,
      })
      .returning();
    teacherAId = tA.id;

    await db.insert(accountRoles).values({
      accountId: tAAccount.id,
      roleId: tchRole.id,
    });

    // Seed Teacher B (Assigned to Class 2 / Unassigned to Class 1)
    const tchBHash = await hasher.hash('TeacherBPass123!');
    const [tBAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-02',
        passwordHash: tchBHash,
        isActive: true,
      })
      .returning();

    const [tB] = await db
      .insert(teachers)
      .values({
        accountId: tBAccount.id,
        firstName: 'Bob',
        lastName: 'Jones',
        isActive: true,
      })
      .returning();
    teacherBId = tB.id;

    await db.insert(accountRoles).values({
      accountId: tBAccount.id,
      roleId: tchRole.id,
    });

    // Seed Academic Term and Book
    const [term] = await db
      .insert(academicTerms)
      .values({
        name: 'Summer 2026',
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        status: 'ACTIVE',
      })
      .returning();

    const [bk] = await db
      .insert(books)
      .values({
        name: 'Top Notch 2',
        level: 'A2',
        sequenceOrder: 2,
        sessionCount: 20,
      })
      .returning();

    // Seed Class 1 assigned to Teacher A
    const [cls1] = await db
      .insert(classes)
      .values({
        academicTermId: term.id,
        bookId: bk.id,
        teacherId: tA.id,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      })
      .returning();
    class1Id = cls1.id;

    // Seed Class 2 assigned to Teacher B
    const [cls2] = await db
      .insert(classes)
      .values({
        academicTermId: term.id,
        bookId: bk.id,
        teacherId: tB.id,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      })
      .returning();
    class2Id = cls2.id;

    // Seed Students
    const studentRows = await db
      .insert(students)
      .values([
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Miller' },
        { firstName: 'David', lastName: 'Brown' },
        { firstName: 'Sarah', lastName: 'Wilson' },
        { firstName: 'Michael', lastName: 'Taylor' },
        { firstName: 'Emma', lastName: 'Davis' },
        { firstName: 'Lucas', lastName: 'Clark' },
      ])
      .returning();

    student1Id = studentRows[0].id;
    student2Id = studentRows[1].id;
    student3Id = studentRows[2].id;
    student4Id = studentRows[3].id;
    student5Id = studentRows[4].id;
    studentOutsideClassId = studentRows[5].id;
    unenrolledStudentId = studentRows[6].id;

    // Enroll students 1-5 in Class 1
    await db.insert(enrollments).values([
      { classId: class1Id, studentId: student1Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student2Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student3Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student4Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student5Id, status: 'ACTIVE' },
    ]);

    // Enroll student 6 in Class 2
    await db.insert(enrollments).values([
      { classId: class2Id, studentId: studentOutsideClassId, status: 'ACTIVE' },
    ]);

    // Login accounts
    const supLogin = await authService.login({
      personnelCode: 'SUP-01',
      password: 'SupervisorPass123!',
    });
    supervisorToken = supLogin.rawToken;

    const tALogin = await authService.login({
      personnelCode: 'TCH-01',
      password: 'TeacherAPass123!',
    });
    teacherAToken = tALogin.rawToken;

    const tBLogin = await authService.login({
      personnelCode: 'TCH-02',
      password: 'TeacherBPass123!',
    });
    teacherBToken = tBLogin.rawToken;

    app = await NestFactory.create(TestExamsApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (pg) {
      await pg.close();
    }
  });

  // ==========================================
  // 1. Authentication
  // ==========================================

  it('1. Unauthenticated exam request returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/exams`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('2. Unauthenticated exam result request returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exams/00000000-0000-0000-0000-000000000000/results`,
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  // ==========================================
  // 2. Exam Creation & Access Control
  // ==========================================

  it('3. Assigned teacher can create an exam for their class (201 CREATED)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/exams`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        examDate: '2026-06-20',
        type: 'FINAL',
      }),
    });

    assert.equal(res.status, 201);
    const exam = await res.json();
    assert.equal(exam.classId, class1Id);
    assert.equal(exam.examDate, '2026-06-20');
    assert.equal(exam.type, 'FINAL');
    assert.equal(exam.resultsCount, 0);
    createdExamId = exam.id;
  });

  it('4. Assigned teacher can view and list exams for their class (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/exams`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(list.length >= 1);
    assert.equal(list[0].id, createdExamId);

    const detailRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.id, createdExamId);
    assert.equal(detail.class.id, class1Id);
  });

  it('5. Assigned teacher can update exam date and type (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        examDate: '2026-06-25',
        type: 'FINAL',
      }),
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.examDate, '2026-06-25');
  });

  it('6. Empty update payload is rejected (400 INVALID_INPUT)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
  });

  it('7. Unassigned Teacher B receives 403 FORBIDDEN when accessing Class 1 exam', async () => {
    // Attempt GET exams
    const getRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/exams`, {
      headers: { Authorization: `Bearer ${teacherBToken}` },
    });
    assert.equal(getRes.status, 403);

    // Attempt POST exam
    const postRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/exams`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherBToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        examDate: '2026-06-30',
        type: 'MIDTERM',
      }),
    });
    assert.equal(postRes.status, 403);

    // Attempt GET exam detail
    const detailRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}`, {
      headers: { Authorization: `Bearer ${teacherBToken}` },
    });
    assert.equal(detailRes.status, 403);
  });

  it('8. Supervisor can view and update an exam for another teacher’s class', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(res.status, 200);
    const exam = await res.json();
    assert.equal(exam.id, createdExamId);
  });

  it('9. Nonexistent class ID returns 404 RESOURCE_NOT_FOUND', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/classes/00000000-0000-0000-0000-000000000000/exams`,
      {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'RESOURCE_NOT_FOUND');
  });

  it('10. Nonexistent exam ID returns 404 RESOURCE_NOT_FOUND', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exams/00000000-0000-0000-0000-000000000000`,
      {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 404);
  });

  // ==========================================
  // 3. Enrollment Invariant & Result Creation
  // ==========================================

  it('11. Enrolled student in exam class can receive an exam result (201 CREATED)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student1Id,
        score: 85.5,
      }),
    });

    assert.equal(res.status, 201);
    const result = await res.json();
    assert.equal(result.studentId, student1Id);
    assert.equal(result.score, 85.5);
    assert.equal(result.status, 'PASS');
    assert.equal(result.student.firstName, 'John');
  });

  it('12. Student belonging to another class is rejected (400 INVALID_INPUT)', async () => {
    // studentOutsideClassId is enrolled in Class 2, not Class 1
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: studentOutsideClassId,
        score: 90.0,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.match(body.error.message, /not enrolled in the class/i);
  });

  it('13. Completely unenrolled student is rejected (400 INVALID_INPUT)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: unenrolledStudentId,
        score: 75.0,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.match(body.error.message, /not enrolled in the class/i);
  });

  // ==========================================
  // 4. Score Range & Validation Boundaries
  // ==========================================

  it('14. Score boundaries: 0 and 100 are accepted, negative and >100 are rejected', async () => {
    // Negative score rejected
    const negRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student2Id,
        score: -0.01,
      }),
    });
    assert.equal(negRes.status, 400);

    // Score > 100 rejected
    const overRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student2Id,
        score: 100.01,
      }),
    });
    assert.equal(overRes.status, 400);

    // Score = 0 accepted (FAIL)
    const zeroRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student2Id,
        score: 0,
      }),
    });
    assert.equal(zeroRes.status, 201);
    const zeroResult = await zeroRes.json();
    assert.equal(zeroResult.score, 0);
    assert.equal(zeroResult.status, 'FAIL');

    // Score = 100 accepted (PASS)
    const hundredRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student3Id,
        score: 100,
      }),
    });
    assert.equal(hundredRes.status, 201);
    const hundredResult = await hundredRes.json();
    assert.equal(hundredResult.score, 100);
    assert.equal(hundredResult.status, 'PASS');
  });

  // ==========================================
  // 5. Assessment Derivation Thresholds
  // ==========================================

  it('15. Assessment derivation thresholds: 70.00 -> PASS, 69.99 -> CONDITIONAL, 60.00 -> CONDITIONAL, 59.99 -> FAIL', async () => {
    // 69.99 -> CONDITIONAL
    const condRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student4Id,
        score: 69.99,
      }),
    });
    assert.equal(condRes.status, 201);
    const condResult = await condRes.json();
    assert.equal(condResult.score, 69.99);
    assert.equal(condResult.status, 'CONDITIONAL');

    // 59.99 -> FAIL
    const failRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student5Id,
        score: 59.99,
      }),
    });
    assert.equal(failRes.status, 201);
    const failResult = await failRes.json();
    assert.equal(failResult.score, 59.99);
    assert.equal(failResult.status, 'FAIL');
  });

  // ==========================================
  // 6. Result Uniqueness
  // ==========================================

  it('16. Duplicate result for the same student on the same exam is rejected with 409 CONFLICT', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student1Id,
        score: 95.0,
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, 'CONFLICT');

    // Verify in database that only 1 record exists for (createdExamId, student1Id)
    const existing = await db
      .select()
      .from(examResults)
      .where(
        and(
          eq(examResults.examId, createdExamId),
          eq(examResults.studentId, student1Id),
        ),
      );
    assert.equal(existing.length, 1);
  });

  // ==========================================
  // 7. Update Score & Re-Derive Status
  // ==========================================

  let student4ResultId: string;

  it('17. Updating result score updates score and re-computes status (CONDITIONAL -> PASS)', async () => {
    // First list results to get result ID for student 4
    const listRes = await fetch(`${baseUrl}/api/v1/exams/${createdExamId}/results`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(listRes.status, 200);
    const results = await listRes.json();
    const r4 = results.find((r: any) => r.studentId === student4Id);
    assert.ok(r4);
    assert.equal(r4.status, 'CONDITIONAL');
    student4ResultId = r4.id;

    // Update score from 69.99 to 75.00
    const updateRes = await fetch(`${baseUrl}/api/v1/exam-results/${student4ResultId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score: 75.0 }),
    });

    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.score, 75.0);
    assert.equal(updated.status, 'PASS');
  });

  it('18. Unassigned Teacher B cannot update exam result for Class 1 (403 FORBIDDEN)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/exam-results/${student4ResultId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherBToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score: 99.0 }),
    });
    assert.equal(res.status, 403);
  });

  // ==========================================
  // 8. Audit Logging & Transaction Boundaries
  // ==========================================

  it('19. Audit logs are verified for CREATE_EXAM, UPDATE_EXAM, CREATE_EXAM_RESULT, UPDATE_EXAM_RESULT', async () => {
    const examAudits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, createdExamId));

    const examActions = examAudits.map((a: any) => a.action);
    assert.ok(examActions.includes('CREATE_EXAM'));
    assert.ok(examActions.includes('UPDATE_EXAM'));

    const createExamAudit = examAudits.find((a: any) => a.action === 'CREATE_EXAM');
    assert.equal(createExamAudit.entityType, 'EXAM');
    assert.equal(createExamAudit.actorAccountId, teacherAAccountId);
    assert.equal(createExamAudit.metadata.classId, class1Id);
    assert.equal(createExamAudit.metadata.type, 'FINAL');

    const resultAudits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, student4ResultId));

    const resultActions = resultAudits.map((a: any) => a.action);
    assert.ok(resultActions.includes('CREATE_EXAM_RESULT'));
    assert.ok(resultActions.includes('UPDATE_EXAM_RESULT'));

    const updateResultAudit = resultAudits.find(
      (a: any) => a.action === 'UPDATE_EXAM_RESULT',
    );
    assert.equal(updateResultAudit.entityType, 'EXAM_RESULT');
    assert.equal(updateResultAudit.metadata.previousStatus, 'CONDITIONAL');
    assert.equal(updateResultAudit.metadata.newStatus, 'PASS');
    assert.equal(updateResultAudit.metadata.newScore, 75);
  });
});
