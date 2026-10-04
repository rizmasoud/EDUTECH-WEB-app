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
      .values({ examId: exam1Id, studentId: studentDecisionRemedialId, score: '58.00' })
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
    assert.equal(body.error.code, 'FORBIDDEN');
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

  it('9. Processing fail score (< 60) creates PENDING_DECISION with toBookId = null', async () => {
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
    assert.equal(promo.status, 'PENDING_DECISION');
    assert.equal(promo.decision, null);
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

  it('12. Teacher cannot make supervisor decision on a pending promotion (403 FORBIDDEN)', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/promotions/${promoPendingForPromoteId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'PROMOTE' }),
      },
    );
    assert.equal(res.status, 403);
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
});
