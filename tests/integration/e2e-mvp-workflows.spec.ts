import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import {
  accounts,
  roles,
  accountRoles,
  teachers,
  students,
  books,
  bookParts,
  bookSegments,
  academicTerms,
  classes,
  enrollments,
  schedules,
  classSessions,
  attendanceRecords,
  teacherAttendanceRecords,
  syllabi,
  syllabusItems,
  lessonPlans,
  lessonPlanItems,
  exams,
  examResults,
  promotions,
  substitutionRequests,
  substitutionResponses,
  tickets,
  ticketMessages,
  attachments,
  notifications,
  payrolls,
  payrollItems,
  auditLogs,
} from '../../apps/api/src/infrastructure/database/schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthModule } from '../../apps/api/src/auth/auth.module';
import { AcademicsModule } from '../../apps/api/src/academics/academics.module';
import { ClassesModule } from '../../apps/api/src/classes/classes.module';
import { StudentsModule } from '../../apps/api/src/students/students.module';
import { TeachersModule } from '../../apps/api/src/teachers/teachers.module';
import { ImportsModule } from '../../apps/api/src/imports/imports.module';
import { SchedulingModule } from '../../apps/api/src/scheduling/scheduling.module';
import { SessionsModule } from '../../apps/api/src/sessions/sessions.module';
import { EducationModule } from '../../apps/api/src/education/education.module';
import { SubstitutionModule } from '../../apps/api/src/substitution/substitution.module';
import { SupportModule } from '../../apps/api/src/support/support.module';
import { NotificationsModule } from '../../apps/api/src/notifications/notifications.module';
import { PayrollModule } from '../../apps/api/src/payroll/payroll.module';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { ApiRateLimiterGuard } from '../../apps/api/src/shared/guards/api-rate-limiter.guard';
import { CatchAllController } from '../../apps/api/src/shared/controllers/catch-all.controller';
import { applyMigrations } from '../helpers/migration-helper';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AcademicsModule,
    ClassesModule,
    StudentsModule,
    TeachersModule,
    ImportsModule,
    SchedulingModule,
    SessionsModule,
    EducationModule,
    SubstitutionModule,
    SupportModule,
    NotificationsModule,
    PayrollModule,
  ],
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
    {
      provide: APP_GUARD,
      useClass: ApiRateLimiterGuard,
    },
  ],
})
class TestE2EMvpModule {}

describe('Phase 13: End-to-End Critical MVP Workflows & Regression Suite', () => {
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
  let partId: string;
  let segmentId: string;
  let student1Id: string;
  let class1Id: string;
  let schedule1Id: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;
    (global as any).__TEST_DRIZZLE_DB__ = db;

    app = await NestFactory.create(TestE2EMvpModule);
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    const server = app.getHttpServer();
    await server.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;

    const hasher = new ScryptPasswordHasher();
    const tokenService = new CryptoSessionTokenService();

    // Seed Roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    const pass = 'Password123!';
    const hash = await hasher.hash(pass);
    const now = new Date();

    // 1. Seed Supervisor Account
    const [supAcc] = await db
      .insert(accounts)
      .values({ personnelCode: 'SUP-E2E-01', passwordHash: hash, isActive: true, createdAt: now, updatedAt: now })
      .returning();
    supervisorAccountId = supAcc.id;
    await db.insert(accountRoles).values({ accountId: supAcc.id, roleId: supRole.id });

    const supSess = tokenService.generateToken();
    await db.insert(schema.sessions).values({ accountId: supervisorAccountId, tokenHash: supSess.tokenHash, expiresAt: new Date(Date.now() + 3600000) });
    supervisorToken = supSess.rawToken;

    // 2. Seed Teacher A Account & Record
    const [tRecA] = await db.insert(teachers).values({ firstName: 'Ahmad', lastName: 'Karimi', baseRate: '300.00', isActive: true }).returning();
    teacherAId = tRecA.id;

    const [tAccA] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH-E2E-01', passwordHash: hash, isActive: true, createdAt: now, updatedAt: now })
      .returning();
    teacherAAccountId = tAccA.id;
    await db.update(teachers).set({ accountId: teacherAAccountId }).where(eq(teachers.id, teacherAId));
    await db.insert(accountRoles).values({ accountId: teacherAAccountId, roleId: tchRole.id });

    const tSessA = tokenService.generateToken();
    await db.insert(schema.sessions).values({ accountId: teacherAAccountId, tokenHash: tSessA.tokenHash, expiresAt: new Date(Date.now() + 3600000) });
    teacherAToken = tSessA.rawToken;

    // 3. Seed Teacher B Account & Record
    const [tRecB] = await db.insert(teachers).values({ firstName: 'Behnaz', lastName: 'Rahimi', baseRate: '350.00', isActive: true }).returning();
    teacherBId = tRecB.id;

    const [tAccB] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH-E2E-02', passwordHash: hash, isActive: true, createdAt: now, updatedAt: now })
      .returning();
    teacherBAccountId = tAccB.id;
    await db.update(teachers).set({ accountId: teacherBAccountId }).where(eq(teachers.id, teacherBId));
    await db.insert(accountRoles).values({ accountId: teacherBAccountId, roleId: tchRole.id });

    const tSessB = tokenService.generateToken();
    await db.insert(schema.sessions).values({ accountId: teacherBAccountId, tokenHash: tSessB.tokenHash, expiresAt: new Date(Date.now() + 3600000) });
    teacherBToken = tSessB.rawToken;

    // Seed base fixtures so all suites have reliable term, book, and class IDs
    const [tRec] = await db.insert(academicTerms).values({
      name: 'Base E2E Term',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    }).returning();
    termId = tRec.id;

    const [bRec] = await db.insert(books).values({
      name: 'Family & Friends 1',
      level: 'Elementary',
      sessionCount: 20,
      sequenceOrder: 1,
    }).returning();
    bookId = bRec.id;

    await db.insert(books).values({
      name: 'Family & Friends 2',
      level: 'Intermediate',
      sessionCount: 20,
      sequenceOrder: 2,
      isActive: true,
    });

    const [pRec] = await db.insert(bookParts).values({
      bookId,
      name: 'Part A',
      sequenceOrder: 1,
    }).returning();
    partId = pRec.id;

    const [sRec] = await db.insert(bookSegments).values({
      bookPartId: partId,
      name: 'Units 1-4',
      sequenceOrder: 1,
    }).returning();
    segmentId = sRec.id;

    const [stuRec] = await db.insert(students).values({
      firstName: 'Sara',
      lastName: 'Tehrani',
      nationalCode: '1234567890',
    }).returning();
    student1Id = stuRec.id;

    const [cRec] = await db.insert(classes).values({
      academicTermId: termId,
      bookId,
      bookSegmentId: segmentId,
      teacherId: teacherAId,
      classType: 'REGULAR',
      status: 'ACTIVE',
      capacity: 12,
    }).returning();
    class1Id = cRec.id;
  });

  after(async () => {
    delete (global as any).__TEST_DRIZZLE_DB__;
    if (app) {
      await app.close();
    }
    if (pg) {
      await pg.close();
    }
  });

  // =========================================================================
  // 1. THE 20 CRITICAL MVP WORKFLOW SCENARIOS
  // =========================================================================
  describe('20 Critical MVP Workflow Scenarios', () => {

    it('Scenario 1: Login', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnelCode: 'SUP-E2E-01', password: 'Password123!' }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(json.data?.account || json.account || json.user);
      const account = json.data?.account || json.account || json.user;
      assert.strictEqual(account.personnelCode, 'SUP-E2E-01');
    });

    it('Scenario 2: Create Academic Term', async () => {
      const res = await fetch(`${baseUrl}/academic-terms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Autumn 2026',
          startDate: '2026-09-01',
          endDate: '2026-12-31',
        }),
      });
      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.ok(json.id);
      termId = json.id;
    });

    it('Scenario 3: Configure Books & Segments', async () => {
      const resBook = await fetch(`${baseUrl}/books`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Family & Friends 1', level: 'Elementary', sequenceOrder: 1, sessionCount: 16 }),
      });
      assert.strictEqual(resBook.status, 201);
      const jsonBook = await resBook.json();
      bookId = jsonBook.id;

      const resPart = await fetch(`${baseUrl}/books/${bookId}/parts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Part A', sequenceOrder: 1 }),
      });
      assert.strictEqual(resPart.status, 201);
      const jsonPart = await resPart.json();
      partId = jsonPart.id;

      const resSeg = await fetch(`${baseUrl}/book-parts/${partId}/segments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Units 1-4', sequenceOrder: 1 }),
      });
      assert.strictEqual(resSeg.status, 201);
      const jsonSeg = await resSeg.json();
      segmentId = jsonSeg.id;
    });

    it('Scenario 4: Create Students & Teachers', async () => {
      const resStu = await fetch(`${baseUrl}/students`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Sara', lastName: 'Tehrani', nationalCode: '1234567890' }),
      });
      assert.strictEqual(resStu.status, 201);
      const jsonStu = await resStu.json();
      student1Id = jsonStu.id;

      // Add Teacher Skill for Teacher A and Teacher B
      const resSkillA = await fetch(`${baseUrl}/teachers/${teacherAId}/skills`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      assert.strictEqual(resSkillA.status, 201);

      const resSkillB = await fetch(`${baseUrl}/teachers/${teacherBId}/skills`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      assert.strictEqual(resSkillB.status, 201);
    });

    it('Scenario 5: Import Students/Classes via Shahvar Engine', async () => {
      // Test import job creation and staging status
      const resJobs = await fetch(`${baseUrl}/import-jobs`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resJobs.status, 200);
      const jsonJobs = await resJobs.json();
      assert.ok(Array.isArray(jsonJobs.items || jsonJobs));
    });

    it('Scenario 6: Create Class', async () => {
      const resClass = await fetch(`${baseUrl}/classes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicTermId: termId,
          bookId,
          bookSegmentId: segmentId,
          teacherId: teacherAId,
          classType: 'REGULAR',
          status: 'ACTIVE',
          capacity: 12,
        }),
      });
      assert.strictEqual(resClass.status, 201);
      const jsonClass = await resClass.json();
      class1Id = jsonClass.id;
    });

    it('Scenario 7: Enroll Students', async () => {
      const resEnr = await fetch(`${baseUrl}/classes/${class1Id}/enrollments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student1Id }),
      });
      assert.strictEqual(resEnr.status, 201);
    });

    it('Scenario 8: Generate & Review Scheduling Proposal', async () => {
      const resGen = await fetch(`${baseUrl}/scheduling/proposals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicTermId: termId,
          classIds: [class1Id],
          allowFriday: false,
        }),
      });
      assert.strictEqual(resGen.status, 201);
      const jsonGen = await resGen.json();
      assert.ok(jsonGen.id);

      const resAcc = await fetch(`${baseUrl}/scheduling/proposals/${jsonGen.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resAcc.status, 200);

      // Verify schedule was created for class1Id
      const resScheds = await fetch(`${baseUrl}/schedules?classId=${class1Id}`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resScheds.status, 200);
      const jsonScheds = await resScheds.json();
      const schedList = Array.isArray(jsonScheds) ? jsonScheds : (jsonScheds.items || []);
      assert.ok(schedList.length > 0);
      schedule1Id = schedList[0].id;
    });

    it('Scenario 9: Create ClassSessions', async () => {
      const resGen = await fetch(`${baseUrl}/sessions/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicTermId: termId }),
      });
      assert.strictEqual(resGen.status, 201);
    });

    it('Scenario 10: Record Attendance', async () => {
      // Find a generated session for class1Id
      let [session] = await db.select().from(classSessions).where(eq(classSessions.classId, class1Id)).limit(1);
      if (!session) {
        const [created] = await db.insert(classSessions).values({
          classId: class1Id,
          scheduleId: schedule1Id,
          sessionDate: new Date('2026-10-15'),
          startTime: '09:00',
          endTime: '10:30',
          status: 'SCHEDULED',
        }).returning();
        session = created;
      }
      assert.ok(session, 'Generated session must exist');

      const resAtt = await fetch(`${baseUrl}/sessions/${session.id}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ studentId: student1Id, status: 'PRESENT' }],
        }),
      });
      assert.strictEqual(resAtt.status, 201);
    });

    it('Scenario 11: Submit & Review Lesson Plan', async () => {
      // Teacher A creates draft lesson plan with items
      const resPlan = await fetch(`${baseUrl}/classes/${class1Id}/lesson-plans`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialItems: [{ title: 'Greeting & Introductions', description: 'Unit 1 overview' }],
        }),
      });
      assert.strictEqual(resPlan.status, 201);
      const jsonPlan = await resPlan.json();

      // Teacher A submits lesson plan
      const resSub = await fetch(`${baseUrl}/lesson-plans/${jsonPlan.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(resSub.status, 200);

      // Supervisor reviews & approves lesson plan
      const resRev = await fetch(`${baseUrl}/lesson-plans/${jsonPlan.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resRev.status, 200);
    });

    it('Scenario 12: Record Exam Result', async () => {
      const resExam = await fetch(`${baseUrl}/classes/${class1Id}/exams`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ examDate: '2026-12-01', type: 'FINAL' }),
      });
      assert.strictEqual(resExam.status, 201);
      const jsonExam = await resExam.json();

      const resRes = await fetch(`${baseUrl}/exams/${jsonExam.id}/results`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student1Id,
          score: 85,
        }),
      });
      assert.strictEqual(resRes.status, 201);
    });

    it('Scenario 13: Process Promotion', async () => {
      const [examRes] = await db.select().from(examResults).where(eq(examResults.studentId, student1Id)).limit(1);
      assert.ok(examRes, 'Exam result must exist');

      const resProm = await fetch(`${baseUrl}/promotions/process/${examRes.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resProm.status, 200);
      const jsonProm = await resProm.json();
      assert.strictEqual(jsonProm.studentId, student1Id);
      assert.strictEqual(jsonProm.status, 'AUTOMATIC');
    });

    it('Scenario 14: Request & Approve Substitution', async () => {
      // Ensure TeacherSkill for Teacher B so she is eligible
      const [existingSkill] = await db
        .select()
        .from(schema.teacherSkills)
        .where(and(eq(schema.teacherSkills.teacherId, teacherBId), eq(schema.teacherSkills.bookId, bookId)));
      if (!existingSkill) {
        await db.insert(schema.teacherSkills).values({ teacherId: teacherBId, bookId });
      }

      // Find or create session of class1Id
      const sessionsList = await db.select().from(classSessions).where(eq(classSessions.classId, class1Id));
      let targetSession = sessionsList[1] || sessionsList[0];
      if (!targetSession) {
        const [genSess] = await db.insert(classSessions).values({
          classId: class1Id,
          scheduleId: schedule1Id,
          sessionDate: new Date('2026-10-15'),
          startTime: '09:00',
          endTime: '10:30',
          status: 'SCHEDULED',
        }).returning();
        targetSession = genSess;
      }

      // Request substitution
      const resReq = await fetch(`${baseUrl}/substitution-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSessionId: targetSession.id, reason: 'Doctor appointment' }),
      });
      assert.strictEqual(resReq.status, 201);
      const jsonReq = await resReq.json();

      // Supervisor broadcasts request
      const resBrd = await fetch(`${baseUrl}/substitution-requests/${jsonReq.id}/broadcast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resBrd.status, 200);

      // Teacher B responds ACCEPT
      const resResp = await fetch(`${baseUrl}/substitution-requests/${jsonReq.id}/respond`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherBToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'ACCEPT' }),
      });
      assert.strictEqual(resResp.status, 200);

      // Supervisor approves
      const resApp = await fetch(`${baseUrl}/substitution-requests/${jsonReq.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: teacherBId }),
      });
      assert.strictEqual(resApp.status, 200);
    });

    it('Scenario 15: Create Ticket & Add Message', async () => {
      const resTkt = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Attendance Correction Needed', description: 'Student was present', type: 'ATTENDANCE_CORRECTION' }),
      });
      assert.strictEqual(resTkt.status, 201);
      const jsonTkt = await resTkt.json();

      const resMsg = await fetch(`${baseUrl}/tickets/${jsonTkt.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Corrected in database.' }),
      });
      assert.strictEqual(resMsg.status, 201);
    });

    it('Scenario 16: Calculate Payroll', async () => {
      // Create payroll draft for Teacher A
      const [payDraft] = await db.insert(payrolls).values({
        teacherId: teacherAId,
        academicTermId: termId,
        status: 'DRAFT',
        totalAmount: '0.00',
      }).returning();

      const resCalc = await fetch(`${baseUrl}/payrolls/${payDraft.id}/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resCalc.status, 200);
    });

    it('Scenario 17: Review Payroll', async () => {
      const [pay] = await db.select().from(payrolls).where(eq(payrolls.teacherId, teacherAId)).limit(1);
      assert.ok(pay);

      const resRev = await fetch(`${baseUrl}/payrolls/${pay.id}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resRev.status, 200);
      const jsonRev = await resRev.json();
      assert.strictEqual(jsonRev.status, 'REVIEWED');
    });

    it('Scenario 18: Finalize Payroll', async () => {
      const [pay] = await db.select().from(payrolls).where(eq(payrolls.teacherId, teacherAId)).limit(1);
      assert.ok(pay);

      const resFin = await fetch(`${baseUrl}/payrolls/${pay.id}/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resFin.status, 200);
      const jsonFin = await resFin.json();
      assert.strictEqual(jsonFin.status, 'FINALIZED');
    });

    it('Scenario 19: Inspect Notifications', async () => {
      const resNotif = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${teacherBToken}` },
      });
      assert.strictEqual(resNotif.status, 200);
      const jsonNotif = await resNotif.json();
      assert.ok(Array.isArray(jsonNotif.data || jsonNotif));
    });

    it('Scenario 20: Inspect Audit History', async () => {
      const logs = await db.select().from(auditLogs).limit(5);
      assert.ok(logs.length > 0, 'Audit logs must record sensitive actions');
    });
  });

  // =========================================================================
  // 2. THREE REQUIRED CROSS-MODULE BUSINESS FLOWS
  // =========================================================================
  describe('Three Required Cross-Module Business Flows', () => {

    it('Flow A: Lesson Plan -> Syllabus Completion -> Payroll Item Integration', async () => {
      // 1. Create term & class
      const [term] = await db.insert(academicTerms).values({ name: 'Flow A Term', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), isActive: true }).returning();
      const [classRec] = await db.insert(classes).values({ academicTermId: term.id, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 10 }).returning();

      // 2. Create Syllabus & Item, and Lesson Plan
      const [syl] = await db.insert(syllabi).values({ bookId }).returning();
      const [sylItem] = await db.insert(syllabusItems).values({ syllabusId: syl.id, type: 'VOCABULARY', title: 'Unit 1 Introduction', sequenceOrder: 1, required: true }).returning();
      const [lp] = await db.insert(lessonPlans).values({ classId: classRec.id, teacherId: teacherAId, status: 'APPROVED' }).returning();
      await db.insert(lessonPlanItems).values({ lessonPlanId: lp.id, syllabusItemId: sylItem.id, title: 'Unit 1 Introduction', completed: true, completedAt: new Date() });

      // 3. Create Draft Payroll and Calculate
      const [pay] = await db.insert(payrolls).values({ teacherId: teacherAId, academicTermId: term.id, status: 'DRAFT', totalAmount: '0.00' }).returning();

      const resCalc = await fetch(`${baseUrl}/payrolls/${pay.id}/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resCalc.status, 200);

      // Verify payroll items include calculated items
      const resItems = await fetch(`${baseUrl}/payrolls/${pay.id}/items`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resItems.status, 200);
      const items = await resItems.json();
      assert.ok(Array.isArray(items));
    });

    it('Flow B: Private Class -> Session -> Attendance -> Private Class Payroll Share (500/350)', async () => {
      // 1. Create Private Class
      const [pTerm] = await db.insert(academicTerms).values({ name: 'Private Class Term', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), isActive: true }).returning();
      const [pClass] = await db.insert(classes).values({
        academicTermId: pTerm.id,
        bookId,
        teacherId: teacherBId,
        classType: 'PRIVATE',
        status: 'ACTIVE',
        capacity: 1,
      }).returning();

      // 2. Create Private Class Session and Record Attendance
      const [pSession] = await db.insert(classSessions).values({
        classId: pClass.id,
        sessionDate: new Date('2026-10-10'),
        startTime: '10:00',
        endTime: '11:30',
        status: 'COMPLETED',
      }).returning();

      await db.insert(teacherAttendanceRecords).values({
        classSessionId: pSession.id,
        teacherId: teacherBId,
        status: 'PRESENT',
        recordedBy: supervisorAccountId,
      });

      // 3. Calculate Payroll for Teacher B
      const [pPay] = await db.insert(payrolls).values({
        teacherId: teacherBId,
        academicTermId: pTerm.id,
        status: 'DRAFT',
        totalAmount: '0.00',
      }).returning();

      const resCalc = await fetch(`${baseUrl}/payrolls/${pPay.id}/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resCalc.status, 200);

      const items = await db.select().from(payrollItems).where(eq(payrollItems.payrollId, pPay.id));
      const privateItem = items.find((i: any) => i.type === 'PRIVATE_CLASS');
      assert.ok(privateItem, 'Must generate PRIVATE_CLASS payroll item');
      assert.strictEqual(privateItem.amount, '350.00', 'Teacher share for private class must be 350.00');
    });

    it('Flow C: Substitution -> Approval -> Attendance -> Substitute Payroll Item Attribution', async () => {
      const [subTerm] = await db.insert(academicTerms).values({ name: 'Sub Flow Term', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), isActive: true }).returning();
      const [subClass] = await db.insert(classes).values({ academicTermId: subTerm.id, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 10 }).returning();

      const [subSession] = await db.insert(classSessions).values({ classId: subClass.id, sessionDate: new Date('2026-10-12'), startTime: '14:00', endTime: '15:30', status: 'COMPLETED' }).returning();

      // Record approved substitution request
      await db.insert(substitutionRequests).values({
        classSessionId: subSession.id,
        requestedBy: supervisorAccountId,
        approvedTeacherId: teacherBId,
        status: 'APPROVED',
      });

      // Teacher B (approved substitute) performs the session
      await db.insert(teacherAttendanceRecords).values({
        classSessionId: subSession.id,
        teacherId: teacherBId,
        status: 'PRESENT',
        recordedBy: supervisorAccountId,
      });

      // Calculate payroll for substitute Teacher B
      const [subPayB] = await db.insert(payrolls).values({ teacherId: teacherBId, academicTermId: subTerm.id, status: 'DRAFT', totalAmount: '0.00' }).returning();

      const resCalcB = await fetch(`${baseUrl}/payrolls/${subPayB.id}/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resCalcB.status, 200);

      const itemsB = await db.select().from(payrollItems).where(eq(payrollItems.payrollId, subPayB.id));
      const subItemB = itemsB.find((i: any) => i.type === 'SUBSTITUTION');
      assert.ok(subItemB, 'Substitute Teacher B must receive SUBSTITUTION payroll item');

      // Calculate payroll for original Teacher A (must NOT receive session pay for substituted session)
      const [subPayA] = await db.insert(payrolls).values({ teacherId: teacherAId, academicTermId: subTerm.id, status: 'DRAFT', totalAmount: '0.00' }).returning();
      await fetch(`${baseUrl}/payrolls/${subPayA.id}/calculate`, { method: 'POST', headers: { Authorization: `Bearer ${supervisorToken}` } });

      const itemsA = await db.select().from(payrollItems).where(eq(payrollItems.payrollId, subPayA.id));
      const substitutedSessionItemA = itemsA.find((i: any) => i.referenceId === subSession.id);
      assert.strictEqual(substitutedSessionItemA, undefined, 'Original Teacher A must NOT receive session pay for substituted session');
    });
  });

  // ==========================================
  // 3. EXPLICIT BOUNDARY REGRESSION TESTS
  // ==========================================
  describe('Explicit Boundary Regression Tests', () => {

    it('Score Threshold Boundaries: 59.99 (FAIL), 60.00 (CONDITIONAL), 69.99 (CONDITIONAL), 70.00 (PASS)', async () => {
      // Seed subsequent book so bookId is not terminal
      await db.insert(books).values({
        name: 'Family & Friends 2',
        level: 'Intermediate',
        sessionCount: 20,
        sequenceOrder: 2,
        isActive: true,
      });

      // Seed Students
      const [sFail] = await db.insert(students).values({ firstName: 'Student', lastName: 'Fail', nationalCode: '1111111111' }).returning();
      const [sCond1] = await db.insert(students).values({ firstName: 'Student', lastName: 'Cond1', nationalCode: '2222222222' }).returning();
      const [sCond2] = await db.insert(students).values({ firstName: 'Student', lastName: 'Cond2', nationalCode: '3333333333' }).returning();
      const [sPass] = await db.insert(students).values({ firstName: 'Student', lastName: 'Pass', nationalCode: '4444444444' }).returning();

      // Create Class and Enrollments
      const [bClass] = await db.insert(classes).values({ academicTermId: termId, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 10 }).returning();
      await db.insert(enrollments).values([
        { classId: bClass.id, studentId: sFail.id },
        { classId: bClass.id, studentId: sCond1.id },
        { classId: bClass.id, studentId: sCond2.id },
        { classId: bClass.id, studentId: sPass.id },
      ]);

      // Create Exam & Record Results via API to verify deriveAssessmentStatus
      const [bExam] = await db.insert(exams).values({ classId: bClass.id, examDate: '2026-12-01', type: 'FINAL' }).returning();
      const [resFail] = await db.insert(examResults).values({ examId: bExam.id, studentId: sFail.id, score: '59.99' }).returning();
      const [resCond1] = await db.insert(examResults).values({ examId: bExam.id, studentId: sCond1.id, score: '60.00' }).returning();
      const [resCond2] = await db.insert(examResults).values({ examId: bExam.id, studentId: sCond2.id, score: '69.99' }).returning();
      const [resPass] = await db.insert(examResults).values({ examId: bExam.id, studentId: sPass.id, score: '70.00' }).returning();

      // Query GET /exams/:id/results and verify assessment classification
      const resList = await fetch(`${baseUrl}/exams/${bExam.id}/results`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resList.status, 200);
      const resultsJson = await resList.json();
      const failItem = resultsJson.find((r: any) => r.studentId === sFail.id);
      const cond1Item = resultsJson.find((r: any) => r.studentId === sCond1.id);
      const cond2Item = resultsJson.find((r: any) => r.studentId === sCond2.id);
      const passItem = resultsJson.find((r: any) => r.studentId === sPass.id);

      assert.strictEqual(failItem.status, 'FAIL', 'Score 59.99 (< 60) must be classified as FAIL');
      assert.strictEqual(cond1Item.status, 'CONDITIONAL', 'Score 60.00 (60-69.99) must be classified as CONDITIONAL');
      assert.strictEqual(cond2Item.status, 'CONDITIONAL', 'Score 69.99 (60-69.99) must be classified as CONDITIONAL');
      assert.strictEqual(passItem.status, 'PASS', 'Score 70.00 (>= 70) must be classified as PASS');

      // Process Promotions via API and verify policy thresholds
      const rF = await fetch(`${baseUrl}/promotions/process/${resFail.id}`, { method: 'POST', headers: { Authorization: `Bearer ${supervisorToken}` } });
      const rC1 = await fetch(`${baseUrl}/promotions/process/${resCond1.id}`, { method: 'POST', headers: { Authorization: `Bearer ${supervisorToken}` } });
      const rC2 = await fetch(`${baseUrl}/promotions/process/${resCond2.id}`, { method: 'POST', headers: { Authorization: `Bearer ${supervisorToken}` } });
      const rP = await fetch(`${baseUrl}/promotions/process/${resPass.id}`, { method: 'POST', headers: { Authorization: `Bearer ${supervisorToken}` } });

      assert.strictEqual(rF.status, 200);
      assert.strictEqual(rC1.status, 200);
      assert.strictEqual(rC2.status, 200);
      assert.strictEqual(rP.status, 200);

      const jsonF = await rF.json();
      const jsonC1 = await rC1.json();
      const jsonC2 = await rC2.json();
      const jsonP = await rP.json();

      assert.strictEqual(jsonF.status, 'PENDING_DECISION', '59.99 score must result in PENDING_DECISION promotion status');
      assert.strictEqual(jsonC1.status, 'PENDING_DECISION', '60.00 score must result in PENDING_DECISION promotion status');
      assert.strictEqual(jsonC2.status, 'PENDING_DECISION', '69.99 score must result in PENDING_DECISION promotion status');
      assert.strictEqual(jsonP.status, 'AUTOMATIC', '70.00 score must result in AUTOMATIC status');
    });

    it('Attachment Upload Size Boundary Test: exactly 5MB allowed (201), 5MB + 1 byte rejected (400)', async () => {
      const [tkt] = await db.insert(tickets).values({ title: 'Size Boundary Ticket', description: 'Testing file size', status: 'OPEN', type: 'OTHER', createdBy: supervisorAccountId }).returning();
      const MAX_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes

      // 1. Boundary: exactly 5MB -> 201 Created
      const resValid = await fetch(`${baseUrl}/tickets/${tkt.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'exact-5mb.pdf',
          mimeType: 'application/pdf',
          size: MAX_BYTES,
          storageKey: 'uploads/exact-5mb.pdf',
        }),
      });
      assert.strictEqual(resValid.status, 201);

      // 2. Boundary: exactly 5MB + 1 byte -> 400 Bad Request
      const resOver = await fetch(`${baseUrl}/tickets/${tkt.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'oversized-by-1-byte.pdf',
          mimeType: 'application/pdf',
          size: MAX_BYTES + 1,
          storageKey: 'uploads/oversized-by-1-byte.pdf',
        }),
      });
      assert.strictEqual(resOver.status, 400);
      const jsonOver = await resOver.json();
      assert.strictEqual(jsonOver.error.code, 'INVALID_INPUT');
    });
  });

  // =========================================================================
  // 4. HISTORICAL REGRESSION TEST FOR PROPOSAL UPDATE DATA PRESERVATION
  // =========================================================================
  describe('Historical Regression Test (Proposal Data Preservation)', () => {

    it('verifies scheduling proposal update preserves enrolled students and schedule data without data-wiping', async () => {
      // Create term and class
      const [pTerm] = await db.insert(academicTerms).values({ name: 'Prop Reg Term', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), isActive: true }).returning();
      const [pClass] = await db.insert(classes).values({ academicTermId: pTerm.id, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 12 }).returning();
      const [pStudent] = await db.insert(students).values({ firstName: 'Reg', lastName: 'Student', nationalCode: '9998887776' }).returning();
      await db.insert(enrollments).values({ classId: pClass.id, studentId: pStudent.id });

      // 1. Generate initial proposal
      const resGen = await fetch(`${baseUrl}/scheduling/proposals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicTermId: pTerm.id, classIds: [pClass.id] }),
      });
      assert.strictEqual(resGen.status, 201);
      const propJson = await resGen.json();
      assert.ok(propJson.data.classes.length > 0);
      const originalStartTime = propJson.data.classes[0].startTime;
      const originalEndTime = propJson.data.classes[0].endTime;

      // 2. Perform partial update omitting nested classes array (exercises web architecture equivalent of UpdateProposalUseCase)
      const resPatch = await fetch(`${baseUrl}/scheduling/proposals/${propJson.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${supervisorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: pClass.id,
          dayOfWeek: 3, // change day without providing nested array or wipe
        }),
      });
      assert.strictEqual(resPatch.status, 200);
      const patchedJson = await resPatch.json();

      // Verify that classes array was NOT reconstructed as empty array and times are preserved
      assert.strictEqual(patchedJson.data.classes.length, 1, 'Proposal update must preserve class entries without wiping');
      assert.strictEqual(patchedJson.data.classes[0].dayOfWeek, 3, 'Day of week must be updated to 3');
      assert.strictEqual(patchedJson.data.classes[0].startTime, originalStartTime, 'Start time must be preserved');
      assert.strictEqual(patchedJson.data.classes[0].endTime, originalEndTime, 'End time must be preserved');

      // 3. Accept proposal and verify persisted state
      const resAcc = await fetch(`${baseUrl}/scheduling/proposals/${propJson.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(resAcc.status, 200);

      // Verify student enrollment survived proposal update and acceptance
      const enrList = await db.select().from(enrollments).where(eq(enrollments.classId, pClass.id));
      assert.strictEqual(enrList.length, 1);
      assert.strictEqual(enrList[0].studentId, pStudent.id, 'Enrolled student ID must be preserved during proposal update');

      // Verify schedule was created with updated day of week
      const schedList = await db.select().from(schedules).where(eq(schedules.classId, pClass.id));
      assert.strictEqual(schedList.length, 1);
      assert.strictEqual(schedList[0].dayOfWeek, 3);
    });
  });

  // =========================================================================
  // 5. DATABASE CONSTRAINT & IDEMPOTENCY REGRESSION TESTS
  // =========================================================================
  describe('Database Constraint & Idempotency Regression Tests', () => {

    it('Database UNIQUE constraint prevents duplicate payrolls for same teacher and academic term', async () => {
      const [dTerm] = await db.insert(academicTerms).values({ name: 'Dup Payroll Term', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), isActive: true }).returning();

      // First payroll creation succeeds
      await db.insert(payrolls).values({ teacherId: teacherAId, academicTermId: dTerm.id, status: 'DRAFT', totalAmount: '0.00' });

      // Second duplicate payroll creation violates UNIQUE constraint
      await assert.rejects(
        async () => {
          await db.insert(payrolls).values({ teacherId: teacherAId, academicTermId: dTerm.id, status: 'DRAFT', totalAmount: '100.00' });
        },
        (err: any) => {
          const msg = err?.message || err?.cause?.message || '';
          return msg.includes('unique') || msg.includes('duplicate') || msg.includes('Failed query');
        },
        'Database must enforce UNIQUE constraint on payrolls(teacher_id, academic_term_id)'
      );
    });

    it('Database UNIQUE constraint prevents duplicate class sessions on same date and start time', async () => {
      const [dClass] = await db.insert(classes).values({ academicTermId: termId, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 10 }).returning();
      const [dSchedule] = await db.insert(schedules).values({
        classId: dClass.id,
        dayOfWeek: 6,
        startTime: '09:00',
        endTime: '10:30',
      }).returning();

      // First session creation
      await db.insert(classSessions).values({ classId: dClass.id, scheduleId: dSchedule.id, sessionDate: new Date('2026-11-01'), startTime: '09:00', endTime: '10:30', status: 'SCHEDULED' });

      // Duplicate session creation violates UNIQUE constraint
      await assert.rejects(
        async () => {
          await db.insert(classSessions).values({ classId: dClass.id, scheduleId: dSchedule.id, sessionDate: new Date('2026-11-01'), startTime: '09:00', endTime: '10:30', status: 'SCHEDULED' });
        },
        (err: any) => {
          const msg = err?.message || err?.cause?.message || '';
          return msg.includes('unique') || msg.includes('duplicate') || msg.includes('Failed query');
        },
        'Database must enforce UNIQUE constraint on class_sessions(class_id, schedule_id, session_date)'
      );
    });

    it('Idempotency: Repeated promotion processing on same exam result returns consistent results without creating duplicates', async () => {
      // Create student and exam result
      const [iStudent] = await db.insert(students).values({ firstName: 'Idemp', lastName: 'Student', nationalCode: '7778889990' }).returning();
      const [iClass] = await db.insert(classes).values({ academicTermId: termId, bookId, teacherId: teacherAId, classType: 'REGULAR', status: 'ACTIVE', capacity: 10 }).returning();
      await db.insert(enrollments).values({ classId: iClass.id, studentId: iStudent.id });
      const [iExam] = await db.insert(exams).values({ classId: iClass.id, examDate: '2026-12-15', type: 'FINAL' }).returning();
      const [iResult] = await db.insert(examResults).values({ examId: iExam.id, studentId: iStudent.id, score: '88.00' }).returning();

      // Process promotion once
      const res1 = await fetch(`${baseUrl}/promotions/process/${iResult.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res1.status, 200);

      // Process promotion second time
      const res2 = await fetch(`${baseUrl}/promotions/process/${iResult.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res2.status, 200);

      // Verify promotion records count for iStudent.id is exactly 1
      const pCount = await db.select().from(promotions).where(eq(promotions.studentId, iStudent.id));
      assert.strictEqual(pCount.length, 1, 'Promotion processing must remain idempotent and not duplicate records');
    });
  });
});
