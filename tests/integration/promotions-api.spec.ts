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
import { exams, examResults, promotions } from '../../apps/api/src/infrastructure/database/schema/education.schema';
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
import { PromotionsController } from '../../apps/api/src/education/presentation/promotions.controller';
import { StudentPromotionsController } from '../../apps/api/src/education/presentation/student-promotions.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [
    ClassExamsController,
    ExamsController,
    ExamResultsController,
    PromotionsController,
    StudentPromotionsController,
  ],
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
class TestPromotionsApiModule {}

describe('Promotion Management Integration Tests (Phase 7.4)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;
  let teacherNoRecordToken: string; // TEACHER role but no linked teacher record

  let supervisorAccountId: string;
  let teacherAAccountId: string;

  let book1Id: string;
  let book2Id: string;
  let bookTerminalId: string;

  let class1Id: string;
  let classTerminalId: string;
  let class2Id: string;

  let exam1Id: string;
  let examTerminalId: string;

  let student1Id: string;
  let student2Id: string;
  let student3Id: string;
  let student4Id: string;
  let student5Id: string;
  let studentTerminalId: string;
  let studentDecisionPromoteId: string;
  let studentDecisionDoNotPromoteId: string;
  let studentDecisionRepeatId: string;
  let studentDecisionRemedialId: string;

  let resultPass85Id: string;
  let resultPass70Id: string;
  let resultCond65Id: string;
  let resultCond69Id: string;
  let resultFail55Id: string;
  let resultTerminalPassId: string;
  let resultDecidePromoteId: string;
  let resultDecideDoNotPromoteId: string;
  let resultDecideRepeatId: string;
  let resultDecideRemedialId: string;

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

    // Seed Teacher A
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

    await db.insert(accountRoles).values({
      accountId: tAAccount.id,
      roleId: tchRole.id,
    });

    // Seed Teacher B
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

    await db.insert(accountRoles).values({
      accountId: tBAccount.id,
      roleId: tchRole.id,
    });

    // Seed a TEACHER-role account that has no linked teacher record
    const tNoRecHash = await hasher.hash('TeacherNoRecPass123!');
    const [tNoRecAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-03',
        passwordHash: tNoRecHash,
        isActive: true,
      })
      .returning();

    await db.insert(accountRoles).values({
      accountId: tNoRecAccount.id,
      roleId: tchRole.id,
    });

    // Seed Academic Term
    const [term] = await db
      .insert(academicTerms)
      .values({
        name: 'Summer 2026',
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        status: 'ACTIVE',
      })
      .returning();

    // Seed Books with sequenceOrder and terminal status
    const [bk1] = await db
      .insert(books)
      .values({
        name: 'Top Notch 1',
        level: 'A1',
        sequenceOrder: 1,
        sessionCount: 20,
        isTerminal: false,
        isActive: true,
      })
      .returning();
    book1Id = bk1.id;

    const [bk2] = await db
      .insert(books)
      .values({
        name: 'Top Notch 2',
        level: 'A2',
        sequenceOrder: 2,
        sessionCount: 20,
        isTerminal: false,
        isActive: true,
      })
      .returning();
    book2Id = bk2.id;

    const [bkTerm] = await db
      .insert(books)
      .values({
        name: 'Summit 2 (Terminal)',
        level: 'C1',
        sequenceOrder: 3,
        sessionCount: 20,
        isTerminal: true,
        isActive: true,
      })
      .returning();
    bookTerminalId = bkTerm.id;

    // Seed Class 1 (Book 1, Teacher A)
    const [cls1] = await db
      .insert(classes)
      .values({
        academicTermId: term.id,
        bookId: book1Id,
        teacherId: tA.id,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      })
      .returning();
    class1Id = cls1.id;

    // Seed Class Terminal (Book Terminal, Teacher A)
    const [clsTerm] = await db
      .insert(classes)
      .values({
        academicTermId: term.id,
        bookId: bookTerminalId,
        teacherId: tA.id,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      })
      .returning();
    classTerminalId = clsTerm.id;

    // Seed Class 2 (Book 1, Teacher B)
    const [cls2] = await db
      .insert(classes)
      .values({
        academicTermId: term.id,
        bookId: book1Id,
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
        { firstName: 'Student', lastName: 'Pass85' },
        { firstName: 'Student', lastName: 'Pass70' },
        { firstName: 'Student', lastName: 'Cond65' },
        { firstName: 'Student', lastName: 'Cond69' },
        { firstName: 'Student', lastName: 'Fail55' },
        { firstName: 'Student', lastName: 'TerminalPass' },
        { firstName: 'Student', lastName: 'DecidePromote' },
        { firstName: 'Student', lastName: 'DecideDoNotPromote' },
        { firstName: 'Student', lastName: 'DecideRepeat' },
        { firstName: 'Student', lastName: 'DecideRemedial' },
      ])
      .returning();

    student1Id = studentRows[0].id;
    student2Id = studentRows[1].id;
    student3Id = studentRows[2].id;
    student4Id = studentRows[3].id;
    student5Id = studentRows[4].id;
    studentTerminalId = studentRows[5].id;
    studentDecisionPromoteId = studentRows[6].id;
    studentDecisionDoNotPromoteId = studentRows[7].id;
    studentDecisionRepeatId = studentRows[8].id;
    studentDecisionRemedialId = studentRows[9].id;

    // Enroll students
    await db.insert(enrollments).values([
      { classId: class1Id, studentId: student1Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student2Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student3Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student4Id, status: 'ACTIVE' },
      { classId: class1Id, studentId: student5Id, status: 'ACTIVE' },
      { classId: classTerminalId, studentId: studentTerminalId, status: 'ACTIVE' },
      { classId: class1Id, studentId: studentDecisionPromoteId, status: 'ACTIVE' },
      { classId: class1Id, studentId: studentDecisionDoNotPromoteId, status: 'ACTIVE' },
      { classId: class1Id, studentId: studentDecisionRepeatId, status: 'ACTIVE' },
      { classId: class1Id, studentId: studentDecisionRemedialId, status: 'ACTIVE' },
    ]);

    // Create Exams
    const [ex1] = await db
      .insert(exams)
      .values({
        classId: class1Id,
        examDate: '2026-06-20',
        type: 'FINAL',
      })
      .returning();
    exam1Id = ex1.id;

    const [exTerm] = await db
      .insert(exams)
      .values({
        classId: classTerminalId,
        examDate: '2026-06-25',
        type: 'FINAL',
      })
      .returning();
    examTerminalId = exTerm.id;

    // Create ExamResults
    const [r1] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: student1Id, score: '85.50' })
      .returning();
    resultPass85Id = r1.id;

    const [r2] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: student2Id, score: '70.00' })
      .returning();
    resultPass70Id = r2.id;

    const [r3] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: student3Id, score: '65.00' })
      .returning();
    resultCond65Id = r3.id;

    const [r4] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: student4Id, score: '69.99' })
      .returning();
    resultCond69Id = r4.id;

    const [r5] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: student5Id, score: '55.00' })
      .returning();
    resultFail55Id = r5.id;

    const [rTerm] = await db
      .insert(examResults)
      .values({ examId: examTerminalId, studentId: studentTerminalId, score: '90.00' })
      .returning();
    resultTerminalPassId = rTerm.id;

    const [rDP] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: studentDecisionPromoteId, score: '62.00' })
      .returning();
    resultDecidePromoteId = rDP.id;

    const [rDNP] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: studentDecisionDoNotPromoteId, score: '63.00' })
      .returning();
    resultDecideDoNotPromoteId = rDNP.id;

    const [rDRep] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: studentDecisionRepeatId, score: '64.00' })
      .returning();
    resultDecideRepeatId = rDRep.id;

    const [rDRem] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: studentDecisionRemedialId, score: '61.00' })
      .returning();
    resultDecideRemedialId = rDRem.id;

    // Login users
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

    const tNoRecLogin = await authService.login({
      personnelCode: 'TCH-03',
      password: 'TeacherNoRecPass123!',
    });
    teacherNoRecordToken = tNoRecLogin.rawToken;

    app = await NestFactory.create(TestPromotionsApiModule, { logger: false });
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

  it('1. Unauthenticated request to /api/v1/promotions returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/promotions`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('2. Unauthenticated request to process promotion returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultPass85Id}/process-promotion`,
      { method: 'POST' },
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('3. Unauthenticated request to /api/v1/promotions/:id/decision returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/00000000-0000-0000-0000-000000000000/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'PROMOTE' }),
      },
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  // ==========================================
  // 2. Authorization
  // ==========================================

  it('4. Teacher B (unassigned) receives 403 FORBIDDEN when processing Class 1 exam result', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultPass85Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherBToken}` },
      },
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN_RESOURCE');
  });

  // ==========================================
  // 3. Automatic Promotion (PASS: Score >= 70)
  // ==========================================

  let promoPass85Id: string;

  it('5. Processing score >= 70 creates AUTOMATIC promotion with correct fromBook and nextBook', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultPass85Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.studentId, student1Id);
    assert.equal(promo.fromBookId, book1Id);
    assert.equal(promo.toBookId, book2Id); // Top Notch 2 (next book)
    assert.equal(promo.status, 'AUTOMATIC');
    assert.equal(promo.decision, null);
    assert.equal(promo.decidedBy, null);
    assert.equal(promo.decidedAt, null);
    assert.equal(promo.fromBook.name, 'Top Notch 1');
    assert.equal(promo.toBook.name, 'Top Notch 2');
    promoPass85Id = promo.id;
  });

  it('6. Processing score exactly 70.00 creates AUTOMATIC promotion', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultPass70Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.studentId, student2Id);
    assert.equal(promo.fromBookId, book1Id);
    assert.equal(promo.toBookId, book2Id);
    assert.equal(promo.status, 'AUTOMATIC');
  });

  // ==========================================
  // 4. Terminal Book Completion
  // ==========================================

  it('7. Processing passing score (>= 70) for a terminal book creates TERMINAL_COMPLETION with toBookId = null', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultTerminalPassId}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.studentId, studentTerminalId);
    assert.equal(promo.fromBookId, bookTerminalId);
    assert.equal(promo.toBookId, null);
    assert.equal(promo.status, 'TERMINAL_COMPLETION');
    assert.equal(promo.decision, null);
  });

  // ==========================================
  // 5. Conditional (60 <= score < 70) & Fail (< 60)
  // ==========================================

  it('8. Processing conditional score (60 <= score < 70) creates PENDING_DECISION with toBookId = null', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultCond65Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.studentId, student3Id);
    assert.equal(promo.fromBookId, book1Id);
    assert.equal(promo.toBookId, null);
    assert.equal(promo.status, 'PENDING_DECISION');
    assert.equal(promo.decision, null);
  });

  it('9. Processing fail score (< 60) creates NOT_PROMOTED with toBookId = null and no pending decision', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultFail55Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.studentId, student5Id);
    assert.equal(promo.fromBookId, book1Id);
    assert.equal(promo.toBookId, null);
    assert.equal(promo.status, 'NOT_PROMOTED');
    assert.equal(promo.decision, null);
    assert.equal(promo.decidedBy, null);
    assert.equal(promo.decidedAt, null);

    // Persisted state: exactly one promotion, and never a PENDING_DECISION one, for this result.
    const rows = await db.select().from(promotions).where(eq(promotions.examResultId, resultFail55Id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'NOT_PROMOTED');
    assert.equal(rows.filter((r: any) => r.status === 'PENDING_DECISION').length, 0);

    // The creation is audited with the NOT_PROMOTED status.
    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'CREATE_PROMOTION'), eq(auditLogs.entityId, promo.id)));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].metadata.status, 'NOT_PROMOTED');
  });

  it('9b. Below-60 boundary: 59.99 and 0.00 are NOT_PROMOTED while 60.00 stays PENDING_DECISION', async () => {
    const created = await db
      .insert(students)
      .values([
        { firstName: 'Student', lastName: 'Boundary5999' },
        { firstName: 'Student', lastName: 'Boundary0' },
        { firstName: 'Student', lastName: 'Boundary60' },
      ])
      .returning();
    const [r5999, r0, r60] = await db
      .insert(examResults)
      .values([
        { examId: exam1Id, studentId: created[0].id, score: '59.99' },
        { examId: exam1Id, studentId: created[1].id, score: '0.00' },
        { examId: exam1Id, studentId: created[2].id, score: '60.00' },
      ])
      .returning();

    const process = async (id: string) => {
      const res = await fetch(`${baseUrl}/api/v1/exam-results/${id}/process-promotion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(res.status, 200);
      return res.json();
    };

    const p5999 = await process(r5999.id);
    const p0 = await process(r0.id);
    const p60 = await process(r60.id);

    assert.equal(p5999.status, 'NOT_PROMOTED');
    assert.equal(p5999.toBookId, null);
    assert.equal(p0.status, 'NOT_PROMOTED');
    assert.equal(p0.toBookId, null);
    assert.equal(p60.status, 'PENDING_DECISION');
    assert.equal(p60.toBookId, null);
  });

  it('9c. A newly processed below-60 promotion has nothing to decide (decision attempt is rejected, status unchanged)', async () => {
    const [promo] = await db.select().from(promotions).where(eq(promotions.examResultId, resultFail55Id));
    assert.equal(promo.status, 'NOT_PROMOTED');

    const res = await fetch(`${baseUrl}/api/v1/promotions/${promo.id}/decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'PROMOTE' }),
    });
    assert.equal(res.status, 400);

    const [after] = await db.select().from(promotions).where(eq(promotions.id, promo.id));
    assert.equal(after.status, 'NOT_PROMOTED');
    assert.equal(after.decision, null);
  });

  // ==========================================
  // 6. Idempotency
  // ==========================================

  it('10. Idempotency: processing the same exam result twice returns the existing promotion and does not create duplicate record', async () => {
    const countBefore = (
      await db.select().from(promotions).where(eq(promotions.examResultId, resultPass85Id))
    ).length;
    assert.equal(countBefore, 1);

    const auditsBefore = (
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, promoPass85Id))
    ).length;

    const res = await fetch(
      `${baseUrl}/api/v1/exam-results/${resultPass85Id}/process-promotion`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();
    assert.equal(promo.id, promoPass85Id);

    const countAfter = (
      await db.select().from(promotions).where(eq(promotions.examResultId, resultPass85Id))
    ).length;
    assert.equal(countAfter, 1);

    const auditsAfter = (
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, promoPass85Id))
    ).length;
    assert.equal(auditsAfter, auditsBefore);
  });

  // ==========================================
  // 7. Supervisor Decisions
  // ==========================================

  let promoPendingForPromoteId: string;
  let promoPendingForDoNotPromoteId: string;
  let promoPendingForRepeatId: string;
  let promoPendingForRemedialId: string;

  it('11. Setup pending promotions for decisions', async () => {
    const p1 = await (
      await fetch(`${baseUrl}/api/v1/exam-results/${resultDecidePromoteId}/process-promotion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      })
    ).json();
    promoPendingForPromoteId = p1.id;

    const p2 = await (
      await fetch(
        `${baseUrl}/api/v1/exam-results/${resultDecideDoNotPromoteId}/process-promotion`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${supervisorToken}` },
        },
      )
    ).json();
    promoPendingForDoNotPromoteId = p2.id;

    const p3 = await (
      await fetch(`${baseUrl}/api/v1/exam-results/${resultDecideRepeatId}/process-promotion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      })
    ).json();
    promoPendingForRepeatId = p3.id;

    const p4 = await (
      await fetch(`${baseUrl}/api/v1/exam-results/${resultDecideRemedialId}/process-promotion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      })
    ).json();
    promoPendingForRemedialId = p4.id;

    assert.ok(promoPendingForPromoteId);
    assert.ok(promoPendingForDoNotPromoteId);
    assert.ok(promoPendingForRepeatId);
    assert.ok(promoPendingForRemedialId);
  });

  it('12. A teacher who does not own the class gets 403 FORBIDDEN_RESOURCE on a pending promotion and it stays pending', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForPromoteId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherBToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'PROMOTE' }),
      },
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN_RESOURCE');
    const [after] = await db.select().from(promotions).where(eq(promotions.id, promoPendingForPromoteId));
    assert.equal(after.status, 'PENDING_DECISION');
    assert.equal(after.decision, null);
  });

  it('13. Supervisor decision PROMOTE: status becomes PROMOTED and resolves toBookId', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForPromoteId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'PROMOTE',
          reason: 'Showed high effort and participation',
        }),
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.status, 'PROMOTED');
    assert.equal(promo.decision, 'PROMOTE');
    assert.equal(promo.toBookId, book2Id);
    assert.equal(promo.decidedBy, supervisorAccountId);
    assert.ok(promo.decidedAt);
  });

  it('14. Supervisor decision DO_NOT_PROMOTE: status becomes NOT_PROMOTED and toBookId is null', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForDoNotPromoteId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'DO_NOT_PROMOTE' }),
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.status, 'NOT_PROMOTED');
    assert.equal(promo.decision, 'DO_NOT_PROMOTE');
    assert.equal(promo.toBookId, null);
    assert.equal(promo.decidedBy, supervisorAccountId);
    assert.ok(promo.decidedAt);
  });

  it('15. Supervisor decision REPEAT: status becomes NOT_PROMOTED and toBookId is null', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForRepeatId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'REPEAT' }),
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.status, 'NOT_PROMOTED');
    assert.equal(promo.decision, 'REPEAT');
    assert.equal(promo.toBookId, null);
    assert.equal(promo.decidedBy, supervisorAccountId);
    assert.ok(promo.decidedAt);
  });

  it('16. Supervisor decision REMEDIAL: status becomes NOT_PROMOTED and toBookId is null', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForRemedialId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'REMEDIAL' }),
      },
    );
    assert.equal(res.status, 200);
    const promo = await res.json();

    assert.equal(promo.status, 'NOT_PROMOTED');
    assert.equal(promo.decision, 'REMEDIAL');
    assert.equal(promo.toBookId, null);
    assert.equal(promo.decidedBy, supervisorAccountId);
    assert.ok(promo.decidedAt);
  });

  // ==========================================
  // 8. Invalid State Transitions
  // ==========================================

  it('17. Deciding an already finalized promotion is rejected with 400 INVALID_INPUT', async () => {
    // promoPendingForPromoteId is already PROMOTED
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForPromoteId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'REPEAT' }),
      },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.match(body.error.message, /already finalized/i);
  });

  it('18. Invalid decision value is rejected with 400 INVALID_INPUT', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPass85Id}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'INVALID_DECISION' }),
      },
    );
    assert.equal(res.status, 400);
  });

  // ==========================================
  // 9. Retrieval Endpoints
  // ==========================================

  it('19. List promotions and get promotion by ID return full details including student and book metadata', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/promotions`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(list.length >= 5);

    const getRes = await fetch(`${baseUrl}/api/v1/promotions/${promoPass85Id}`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(getRes.status, 200);
    const promo = await getRes.json();
    assert.equal(promo.id, promoPass85Id);
    assert.equal(promo.student.id, student1Id);
    assert.equal(promo.fromBook.id, book1Id);
    assert.equal(promo.toBook.id, book2Id);
    assert.equal(promo.examResult.id, resultPass85Id);
  });

  it('20. List promotions for student returns student’s promotions', async () => {
    const res = await fetch(`${baseUrl}/api/v1/students/${student1Id}/promotions`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, promoPass85Id);
  });

  // ==========================================
  // 10. Audit Logging Verification
  // ==========================================

  it('21. Audit logs are verified for CREATE_PROMOTION and UPDATE_PROMOTION with actor and metadata', async () => {
    const createAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'CREATE_PROMOTION'),
          eq(auditLogs.entityId, promoPass85Id),
        ),
      );
    assert.equal(createAudits.length, 1);
    const cAudit = createAudits[0];
    assert.equal(cAudit.entityType, 'PROMOTION');
    assert.equal(cAudit.actorAccountId, teacherAAccountId);
    assert.equal(cAudit.metadata.studentId, student1Id);
    assert.equal(cAudit.metadata.fromBookId, book1Id);
    assert.equal(cAudit.metadata.toBookId, book2Id);
    assert.equal(cAudit.metadata.status, 'AUTOMATIC');

    const updateAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'UPDATE_PROMOTION'),
          eq(auditLogs.entityId, promoPendingForPromoteId),
        ),
      );
    assert.equal(updateAudits.length, 1);
    const uAudit = updateAudits[0];
    assert.equal(uAudit.entityType, 'PROMOTION');
    assert.equal(uAudit.actorAccountId, supervisorAccountId);
    assert.equal(uAudit.metadata.previousStatus, 'PENDING_DECISION');
    assert.equal(uAudit.metadata.newStatus, 'PROMOTED');
    assert.equal(uAudit.metadata.decision, 'PROMOTE');
    assert.equal(uAudit.metadata.toBookId, book2Id);
  });

  // ==========================================
  // 11. Teacher data-access pattern (exam results and student promotions)
  // ==========================================

  const MISSING_ID = '00000000-0000-4000-8000-000000000000';

  const call = async (
    method: string,
    path: string,
    token: string,
  ): Promise<{ status: number; code: string | undefined; message: string | undefined; body: any }> => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, code: json?.error?.code, message: json?.error?.message, body: json };
  };

  // Both promotion-processing routes must behave identically.
  const processRoutes = (resultId: string) => [
    `/exam-results/${resultId}/process-promotion`,
    `/promotions/process/${resultId}`,
  ];

  const mkStudent = async (firstName: string, classIds: string[] = []): Promise<string> => {
    const [st] = await db.insert(students).values({ firstName, lastName: 'AuthTest' }).returning();
    for (const classId of classIds) {
      await db.insert(enrollments).values({ classId, studentId: st.id, status: 'ACTIVE' });
    }
    return st.id as string;
  };

  it('22. Teacher gets the same 403 FORBIDDEN_RESOURCE for a missing and another teacher\'s exam result on both processing routes', async () => {
    // A foreign result that has no promotion yet
    const freshStudentId = await mkStudent('FreshForeign', [class1Id]);
    const [fresh] = await db
      .insert(examResults)
      .values({ examId: exam1Id, studentId: freshStudentId, score: '85.00' })
      .returning();

    const foreignRoutes = processRoutes(fresh.id);
    const missingRoutes = processRoutes(MISSING_ID);

    for (let i = 0; i < foreignRoutes.length; i++) {
      const foreign = await call('POST', foreignRoutes[i], teacherBToken);
      const missing = await call('POST', missingRoutes[i], teacherBToken);

      assert.equal(foreign.status, 403, foreignRoutes[i]);
      assert.equal(foreign.code, 'FORBIDDEN_RESOURCE', foreignRoutes[i]);
      assert.equal(missing.status, 403, missingRoutes[i]);
      assert.equal(missing.code, 'FORBIDDEN_RESOURCE', missingRoutes[i]);
      assert.equal(missing.message, foreign.message);
      assert.ok(!String(missing.message).includes(MISSING_ID));
    }

    // Nothing was created by the rejected requests
    const rows = await db.select().from(promotions).where(eq(promotions.examResultId, fresh.id));
    assert.equal(rows.length, 0);
  });

  it('23. Authorization runs before an existing promotion can be returned (idempotency stays safe)', async () => {
    const before = await db.select().from(promotions).where(eq(promotions.examResultId, resultPass85Id));
    assert.equal(before.length, 1);
    const auditsBefore = (
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, promoPass85Id))
    ).length;

    // Another teacher cannot read the existing promotion through either processing route
    for (const route of processRoutes(resultPass85Id)) {
      const r = await call('POST', route, teacherBToken);
      assert.equal(r.status, 403, route);
      assert.equal(r.code, 'FORBIDDEN_RESOURCE', route);
      assert.equal(r.body.id, undefined, `${route}: no promotion data in the response`);
      assert.ok(!JSON.stringify(r.body).includes(promoPass85Id), `${route}: promotion id not exposed`);
    }

    // The authorized owner teacher and a supervisor still get the existing promotion (idempotent, no duplicate)
    for (const route of processRoutes(resultPass85Id)) {
      for (const token of [teacherAToken, supervisorToken]) {
        const r = await call('POST', route, token);
        assert.equal(r.status, 200, route);
        assert.equal(r.body.id, promoPass85Id, route);
      }
    }

    const after = await db.select().from(promotions).where(eq(promotions.examResultId, resultPass85Id));
    assert.equal(after.length, 1);
    const auditsAfter = (
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, promoPass85Id))
    ).length;
    assert.equal(auditsAfter, auditsBefore);
  });

  it('24. Supervisor keeps unrestricted processing access and gets 404 for a missing exam result on both routes', async () => {
    for (const route of processRoutes(MISSING_ID)) {
      const r = await call('POST', route, supervisorToken);
      assert.equal(r.status, 404, route);
      assert.equal(r.code, 'RESOURCE_NOT_FOUND', route);
    }
  });

  it('25. A teacher account without a linked teacher record gets 403 FORBIDDEN_RESOURCE on every exam and promotion path', async () => {
    const paths: Array<[string, string]> = [
      ['POST', `/exam-results/${resultPass85Id}/process-promotion`],
      ['POST', `/exam-results/${MISSING_ID}/process-promotion`],
      ['POST', `/promotions/process/${resultPass85Id}`],
      ['POST', `/promotions/process/${MISSING_ID}`],
      ['GET', '/promotions'],
      ['GET', `/promotions/${promoPass85Id}`],
      ['GET', `/promotions/${MISSING_ID}`],
      ['GET', `/students/${student1Id}/promotions`],
      ['GET', `/students/${MISSING_ID}/promotions`],
      ['GET', `/classes/${class1Id}/exams`],
      ['GET', `/exams/${exam1Id}`],
      ['GET', `/exams/${exam1Id}/results`],
      ['PATCH', `/exam-results/${resultPass85Id}`],
    ];
    for (const [method, path] of paths) {
      const r = await call(method, path, teacherNoRecordToken);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.code, 'FORBIDDEN_RESOURCE', `${method} ${path}`);
    }
  });

  it('26. GET /students/:id/promotions: a teacher gets the same 403 FORBIDDEN_RESOURCE for a missing and an out-of-scope student', async () => {
    const unrelatedStudentId = await mkStudent('NoClassWithA'); // exists, enrolled nowhere
    const studentOfBOnlyId = await mkStudent('OnlyInClassB', [class2Id]); // exists, other teacher's class

    const missing = await call('GET', `/students/${MISSING_ID}/promotions`, teacherAToken);
    const unrelated = await call('GET', `/students/${unrelatedStudentId}/promotions`, teacherAToken);
    const ofB = await call('GET', `/students/${studentOfBOnlyId}/promotions`, teacherAToken);

    for (const r of [missing, unrelated, ofB]) {
      assert.equal(r.status, 403);
      assert.equal(r.code, 'FORBIDDEN_RESOURCE');
    }
    assert.equal(missing.message, unrelated.message);
    assert.equal(missing.message, ofB.message);
    assert.ok(!String(missing.message).includes(MISSING_ID));
  });

  it('27. GET /students/:id/promotions: an in-scope student without promotions still returns 200 with an empty list', async () => {
    const inScopeNoPromotionsId = await mkStudent('InScopeNoPromos', [class1Id]);
    const r = await call('GET', `/students/${inScopeNoPromotionsId}/promotions`, teacherAToken);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);

    // An in-scope student with promotions still lists them
    const withPromos = await call('GET', `/students/${student1Id}/promotions`, teacherAToken);
    assert.equal(withPromos.status, 200);
    assert.equal(withPromos.body.length, 1);
    assert.equal(withPromos.body[0].id, promoPass85Id);
  });

  it('27b. GET /students/:id/promotions: an enrollment of ANY status in the teacher\'s class grants the same historical scope', async () => {
    // Statuses of the enrollment_status enum: ACTIVE (current) and COMPLETED / WITHDRAWN (historical)
    const statuses = ['ACTIVE', 'COMPLETED', 'WITHDRAWN'] as const;

    for (const status of statuses) {
      // In scope, no promotion records: 200 with an empty list
      const [noPromos] = await db.insert(students).values({ firstName: `NoPromos-${status}`, lastName: 'AuthTest' }).returning();
      await db.insert(enrollments).values({ classId: class1Id, studentId: noPromos.id, status });
      const empty = await call('GET', `/students/${noPromos.id}/promotions`, teacherAToken);
      assert.equal(empty.status, 200, `${status}: in-scope student without promotions`);
      assert.deepEqual(empty.body, [], `${status}: empty list`);

      // In scope, with a promotion from the teacher's class: the promotion is listed
      const [withPromo] = await db.insert(students).values({ firstName: `WithPromo-${status}`, lastName: 'AuthTest' }).returning();
      await db.insert(enrollments).values({ classId: class1Id, studentId: withPromo.id, status });
      const [er] = await db
        .insert(examResults)
        .values({ examId: exam1Id, studentId: withPromo.id, score: '65.00' })
        .returning();
      const [pr] = await db
        .insert(promotions)
        .values({ studentId: withPromo.id, fromBookId: book1Id, examResultId: er.id, status: 'PENDING_DECISION' })
        .returning();
      const listed = await call('GET', `/students/${withPromo.id}/promotions`, teacherAToken);
      assert.equal(listed.status, 200, `${status}: in-scope student with a promotion`);
      assert.deepEqual(listed.body.map((p: any) => p.id), [pr.id], `${status}: promotion listed`);

      // The same status in ANOTHER teacher's class gives Teacher A no access
      const [otherTeacherOnly] = await db.insert(students).values({ firstName: `OtherTeacher-${status}`, lastName: 'AuthTest' }).returning();
      await db.insert(enrollments).values({ classId: class2Id, studentId: otherTeacherOnly.id, status });
      const denied = await call('GET', `/students/${otherTeacherOnly.id}/promotions`, teacherAToken);
      assert.equal(denied.status, 403, `${status}: enrolled only with another teacher`);
      assert.equal(denied.code, 'FORBIDDEN_RESOURCE', `${status}: enrolled only with another teacher (code)`);
    }

    // A student with no enrollment in any class stays out of scope
    const [unenrolled] = await db.insert(students).values({ firstName: 'Unenrolled-27b', lastName: 'AuthTest' }).returning();
    const outOfScope = await call('GET', `/students/${unenrolled.id}/promotions`, teacherAToken);
    assert.equal(outOfScope.status, 403);
    assert.equal(outOfScope.code, 'FORBIDDEN_RESOURCE');
  });

  it('28. GET /students/:id/promotions: supervisor is unrestricted and gets 404 for a missing student', async () => {
    const missing = await call('GET', `/students/${MISSING_ID}/promotions`, supervisorToken);
    assert.equal(missing.status, 404);
    assert.equal(missing.code, 'RESOURCE_NOT_FOUND');

    const unrelatedStudentId = await mkStudent('SupervisorSees');
    const any = await call('GET', `/students/${unrelatedStudentId}/promotions`, supervisorToken);
    assert.equal(any.status, 200);
    assert.deepEqual(any.body, []);
  });

  it('29. Owner teacher keeps historical read access to promotions of a COMPLETED class, and others stay denied', async () => {
    await db.update(classes).set({ status: 'COMPLETED' }).where(eq(classes.id, class1Id));
    try {
      const list = await call('GET', '/promotions', teacherAToken);
      assert.equal(list.status, 200);
      assert.ok(list.body.some((p: any) => p.id === promoPass85Id));

      assert.equal((await call('GET', `/promotions/${promoPass85Id}`, teacherAToken)).status, 200);
      assert.equal((await call('GET', `/students/${student1Id}/promotions`, teacherAToken)).status, 200);

      const other = await call('GET', `/promotions/${promoPass85Id}`, teacherBToken);
      assert.equal(other.status, 403);
      assert.equal(other.code, 'FORBIDDEN_RESOURCE');
    } finally {
      await db.update(classes).set({ status: 'ACTIVE' }).where(eq(classes.id, class1Id));
    }
  });
  // ==========================================
  // Teacher Conditional Promotion decisions (60 <= score < 70)
  // ==========================================

  const decideRoutes = (promotionId: string) => [
    `/promotions/${promotionId}/decision`,
    `/promotions/${promotionId}/decide`,
  ];

  const postDecision = async (
    path: string,
    token: string,
    body: unknown = { decision: 'PROMOTE' },
  ): Promise<{ status: number; code: string | undefined; message: string | undefined; body: any }> => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, code: json?.error?.code, message: json?.error?.message, body: json };
  };

  // A promotion row in exam1 (class 1, teacher A) with the given linked score and status, inserted directly.
  const mkPromotion = async (
    score: string,
    status: 'PENDING_DECISION' | 'PROMOTED' | 'NOT_PROMOTED' | 'AUTOMATIC' = 'PENDING_DECISION',
  ): Promise<string> => {
    const studentId = await mkStudent(`Decide-${score}-${status}`, [class1Id]);
    const [result] = await db.insert(examResults).values({ examId: exam1Id, studentId, score }).returning();
    const [promo] = await db
      .insert(promotions)
      .values({ studentId, fromBookId: book1Id, examResultId: result.id, status })
      .returning();
    return promo.id as string;
  };

  const auditCount = async (promotionId: string): Promise<number> =>
    (
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, promotionId), eq(auditLogs.action, 'UPDATE_PROMOTION')))
    ).length;

  it('30. Owner teacher decides a 60-69 promotion through both decision routes and is recorded as the actor', async () => {
    const decisions = [
      { route: 0, score: '60.00', decision: 'PROMOTE', status: 'PROMOTED' },
      { route: 1, score: '69.99', decision: 'DO_NOT_PROMOTE', status: 'NOT_PROMOTED' },
      { route: 0, score: '65.00', decision: 'REPEAT', status: 'NOT_PROMOTED' },
      { route: 1, score: '66.00', decision: 'REMEDIAL', status: 'NOT_PROMOTED' },
    ];
    for (const d of decisions) {
      const id = await mkPromotion(d.score);
      const r = await postDecision(decideRoutes(id)[d.route], teacherAToken, { decision: d.decision, reason: 'teacher call' });
      assert.equal(r.status, 200, `${d.score} ${d.decision}`);
      assert.equal(r.body.status, d.status);
      assert.equal(r.body.decision, d.decision);
      assert.equal(r.body.decidedBy, teacherAAccountId);
      if (d.decision === 'PROMOTE') assert.equal(r.body.toBookId, book2Id);
      else assert.equal(r.body.toBookId, null);

      const logs = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, 'UPDATE_PROMOTION')));
      assert.equal(logs.length, 1);
      assert.equal(logs[0].actorAccountId, teacherAAccountId);
      assert.equal(logs[0].metadata.previousStatus, 'PENDING_DECISION');
      assert.equal(logs[0].metadata.newStatus, d.status);
      assert.equal(logs[0].metadata.decision, d.decision);
      assert.equal(logs[0].metadata.reason, 'teacher call');
    }
  });

  it('31. Another teacher and a missing id both get the same 403 FORBIDDEN_RESOURCE on both routes, and nothing is written', async () => {
    const id = await mkPromotion('65.00');
    for (let i = 0; i < 2; i++) {
      const foreign = await postDecision(decideRoutes(id)[i], teacherBToken);
      const missing = await postDecision(decideRoutes(MISSING_ID)[i], teacherBToken);
      assert.equal(foreign.status, 403);
      assert.equal(foreign.code, 'FORBIDDEN_RESOURCE');
      assert.equal(missing.status, 403);
      assert.equal(missing.code, 'FORBIDDEN_RESOURCE');
      assert.equal(foreign.message, missing.message);
    }
    const [row] = await db.select().from(promotions).where(eq(promotions.id, id));
    assert.equal(row.status, 'PENDING_DECISION');
    assert.equal(await auditCount(id), 0);
  });

  it('32. Supervisor gets 404 RESOURCE_NOT_FOUND for a missing promotion on both routes', async () => {
    for (const route of decideRoutes(MISSING_ID)) {
      const r = await postDecision(route, supervisorToken);
      assert.equal(r.status, 404);
      assert.equal(r.code, 'RESOURCE_NOT_FOUND');
    }
  });

  it('33. A teacher account without a linked teacher record gets 403 FORBIDDEN_RESOURCE and nothing is written', async () => {
    const id = await mkPromotion('65.00');
    for (const route of [...decideRoutes(id), ...decideRoutes(MISSING_ID)]) {
      const r = await postDecision(route, teacherNoRecordToken);
      assert.equal(r.status, 403, route);
      assert.equal(r.code, 'FORBIDDEN_RESOURCE', route);
    }
    const [row] = await db.select().from(promotions).where(eq(promotions.id, id));
    assert.equal(row.status, 'PENDING_DECISION');
    assert.equal(await auditCount(id), 0);
  });

  it('34. A teacher cannot decide when the linked score is below 60 or 70 and above, even with a pending row', async () => {
    for (const score of ['59.99', '0.00', '70.00', '85.00', '100.00']) {
      const id = await mkPromotion(score);
      for (const route of decideRoutes(id)) {
        const r = await postDecision(route, teacherAToken);
        assert.equal(r.status, 400, `${score} ${route}`);
        assert.equal(r.code, 'INVALID_INPUT', `${score} ${route}`);
      }
      const [row] = await db.select().from(promotions).where(eq(promotions.id, id));
      assert.equal(row.status, 'PENDING_DECISION', score);
      assert.equal(row.decision, null, score);
      assert.equal(await auditCount(id), 0, score);
    }
  });

  it('35. Supervisor keeps the established decision behavior, with no score-range restriction, and is recorded as actor', async () => {
    const id = await mkPromotion('65.00');
    const r = await postDecision(decideRoutes(id)[1], supervisorToken, { decision: 'PROMOTE' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'PROMOTED');
    assert.equal(r.body.decidedBy, supervisorAccountId);
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, 'UPDATE_PROMOTION')));
    assert.equal(log.actorAccountId, supervisorAccountId);

    // Established behavior: a Supervisor can decide any PENDING_DECISION row regardless of the linked score.
    const outOfRange = await mkPromotion('85.00');
    const r2 = await postDecision(decideRoutes(outOfRange)[0], supervisorToken, { decision: 'DO_NOT_PROMOTE' });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.status, 'NOT_PROMOTED');
  });

  it('36. Finalized promotions stay immutable for both roles and no extra audit event is written', async () => {
    for (const status of ['PROMOTED', 'NOT_PROMOTED', 'AUTOMATIC'] as const) {
      const id = await mkPromotion('65.00', status);
      for (const token of [teacherAToken, supervisorToken]) {
        for (const route of decideRoutes(id)) {
          const r = await postDecision(route, token, { decision: 'REPEAT' });
          assert.equal(r.status, 400, `${status} ${route}`);
          assert.equal(r.code, 'INVALID_INPUT', `${status} ${route}`);
        }
      }
      const [row] = await db.select().from(promotions).where(eq(promotions.id, id));
      assert.equal(row.status, status);
      assert.equal(row.decision, null);
      assert.equal(await auditCount(id), 0);
    }
  });

  it('37. A second and a concurrent decision cannot create a second successful decision or audit event', async () => {
    const sequential = await mkPromotion('64.00');
    const first = await postDecision(decideRoutes(sequential)[0], teacherAToken, { decision: 'PROMOTE' });
    const second = await postDecision(decideRoutes(sequential)[1], supervisorToken, { decision: 'REPEAT' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.equal(await auditCount(sequential), 1);
    const [seqRow] = await db.select().from(promotions).where(eq(promotions.id, sequential));
    assert.equal(seqRow.decision, 'PROMOTE');

    const racing = await mkPromotion('64.00');
    const results = await Promise.all([
      postDecision(decideRoutes(racing)[0], teacherAToken, { decision: 'PROMOTE' }),
      postDecision(decideRoutes(racing)[1], supervisorToken, { decision: 'REPEAT' }),
      postDecision(decideRoutes(racing)[0], teacherAToken, { decision: 'DO_NOT_PROMOTE' }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 400, 400]);
    assert.equal(await auditCount(racing), 1);
    const [raceRow] = await db.select().from(promotions).where(eq(promotions.id, racing));
    assert.notEqual(raceRow.decision, null);
    assert.equal(raceRow.status === 'PROMOTED' || raceRow.status === 'NOT_PROMOTED', true);
  });
});
