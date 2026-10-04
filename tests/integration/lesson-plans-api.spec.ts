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
import { academicTerms, books, syllabi, syllabusItems } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { lessonPlans, lessonPlanItems } from '../../apps/api/src/infrastructure/database/schema/education.schema';
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
import { LessonPlanService } from '../../apps/api/src/education/application/services/lesson-plan.service';
import { ClassLessonPlansController } from '../../apps/api/src/education/presentation/class-lesson-plans.controller';
import { LessonPlansController } from '../../apps/api/src/education/presentation/lesson-plans.controller';
import { LessonPlanItemsController } from '../../apps/api/src/education/presentation/lesson-plan-items.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { eq } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [
    ClassLessonPlansController,
    LessonPlansController,
    LessonPlanItemsController,
  ],
  providers: [
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
class TestEducationApiModule {}

describe('Lesson Plans API & Authorization Integration Tests (Phase 7.2.1)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  let teacherAId: string;
  let teacherBId: string;
  let class1Id: string;
  let book1Id: string;

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

    await db.insert(accountRoles).values({
      accountId: supAccount.id,
      roleId: supRole.id,
    });

    // Seed Teacher A (Assigned Teacher)
    const tchAHash = await hasher.hash('TeacherAPass123!');
    const [tAAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-01',
        passwordHash: tchAHash,
        isActive: true,
      })
      .returning();

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

    // Seed Teacher B (Unassigned Teacher)
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
        name: 'Spring 2026',
        startDate: '2026-03-01',
        endDate: '2026-06-30',
        status: 'ACTIVE',
      })
      .returning();

    const [bk] = await db
      .insert(books)
      .values({
        name: 'Top Notch 1',
        level: 'A1',
        sequenceOrder: 1,
        sessionCount: 20,
      })
      .returning();
    book1Id = bk.id;

    // Seed Canonical Syllabus with items for Book 1
    const [syl] = await db
      .insert(syllabi)
      .values({
        bookId: bk.id,
      })
      .returning();

    await db.insert(syllabusItems).values([
      {
        syllabusId: syl.id,
        type: 'VOCABULARY',
        title: 'Unit 1 Vocab',
        sequenceOrder: 1,
        required: true,
      },
      {
        syllabusId: syl.id,
        type: 'GRAMMAR',
        title: 'Unit 1 Grammar',
        sequenceOrder: 2,
        required: true,
      },
    ]);

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

    // Login accounts to obtain valid session tokens
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

    app = await NestFactory.create(TestEducationApiModule, { logger: false });
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

  it('1. Unauthenticated requests to lesson plan endpoints return 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('2. Assigned Teacher can create a Lesson Plan in DRAFT status with auto-copied syllabus items (201 CREATED)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 201);
    const plan = await res.json();
    assert.equal(plan.classId, class1Id);
    assert.equal(plan.teacherId, teacherAId);
    assert.equal(plan.status, 'DRAFT');
    assert.ok(Array.isArray(plan.items));
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0].title, 'Unit 1 Vocab');
    assert.equal(plan.items[1].title, 'Unit 1 Grammar');
  });

  it('3. Unassigned Teacher B is forbidden (403 FORBIDDEN) from accessing or creating lesson plans for Class 1', async () => {
    // Attempt GET
    const getRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${teacherBToken}` },
    });
    assert.equal(getRes.status, 403);
    const getBody = await getRes.json();
    assert.equal(getBody.error.code, 'FORBIDDEN');

    // Attempt POST
    const postRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherBToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(postRes.status, 403);
  });

  it('4. Assigned Teacher can view, update items of DRAFT plan, and submit plan (DRAFT -> SUBMITTED)', async () => {
    // 1. List plans for class
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(list.length >= 1);
    const planId = list[0].id;

    // 2. Update items
    const updateRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { title: 'Custom Unit 1 Intro', description: 'Warm-up activity' },
          { title: 'Unit 1 Vocab Drills' },
        ],
      }),
    });
    assert.equal(updateRes.status, 200);
    const updatedPlan = await updateRes.json();
    assert.equal(updatedPlan.items.length, 2);
    assert.equal(updatedPlan.items[0].title, 'Custom Unit 1 Intro');

    // 3. Submit plan
    const submitRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(submitRes.status, 200);
    const submittedPlan = await submitRes.json();
    assert.equal(submittedPlan.status, 'SUBMITTED');
    assert.ok(submittedPlan.submittedAt);
  });

  it('5. Teacher cannot approve or reject their own plan (403 FORBIDDEN)', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    const list = await listRes.json();
    const planId = list[0].id;

    // Attempt Approve as Teacher
    const appRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(appRes.status, 403);

    // Attempt Reject as Teacher
    const rejRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Self-rejection attempt' }),
    });
    assert.equal(rejRes.status, 403);
  });

  it('6. Supervisor can reject submitted plan (SUBMITTED -> REJECTED); Teacher can revise and resubmit', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    const list = await listRes.json();
    const planId = list[0].id;

    // Supervisor Rejects plan
    const rejRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Please include more speaking activities' }),
    });
    assert.equal(rejRes.status, 200);
    const rejPlan = await rejRes.json();
    assert.equal(rejPlan.status, 'REJECTED');

    // Teacher updates rejected plan
    const updateRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { title: 'Speaking Pair Work' },
          { title: 'Unit 1 Vocab Drills' },
        ],
      }),
    });
    assert.equal(updateRes.status, 200);

    // Teacher resubmits
    const resubmitRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(resubmitRes.status, 200);
    const resubmitted = await resubmitRes.json();
    assert.equal(resubmitted.status, 'SUBMITTED');
  });

  it('7. Supervisor can approve submitted plan (SUBMITTED -> APPROVED) and verify immutability and audit logs', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    const list = await listRes.json();
    const planId = list[0].id;

    // Supervisor Approves plan
    const appRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(appRes.status, 200);
    const approvedPlan = await appRes.json();
    assert.equal(approvedPlan.status, 'APPROVED');
    assert.ok(approvedPlan.approvedAt);

    // Verify Immutability: Editing approved plan must return 400 INVALID_INPUT
    const editRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ title: 'Attempted edit after approval' }],
      }),
    });
    assert.equal(editRes.status, 400);
    const editBody = await editRes.json();
    assert.equal(editBody.error.code, 'INVALID_INPUT');

    // Verify Immutability: Submitting approved plan must return 400 INVALID_INPUT
    const subRes = await fetch(`${baseUrl}/api/v1/lesson-plans/${planId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(subRes.status, 400);

    // Verify Audit Logs
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, planId));

    const actions = audits.map((a: any) => a.action);
    assert.ok(actions.includes('CREATE_LESSON_PLAN'));
    assert.ok(actions.includes('UPDATE_LESSON_PLAN'));
    assert.ok(actions.includes('SUBMIT_LESSON_PLAN'));
    assert.ok(actions.includes('REJECT_LESSON_PLAN'));
    assert.ok(actions.includes('APPROVE_LESSON_PLAN'));
  });

  it('8. Unauthenticated request to /api/v1/lesson-plan-items/:id/complete returns 401 UNAUTHENTICATED', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/lesson-plan-items/00000000-0000-0000-0000-000000000000/complete`,
      { method: 'POST' },
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('9. Nonexistent lesson plan item returns 404 RESOURCE_NOT_FOUND', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/lesson-plan-items/00000000-0000-0000-0000-000000000000/complete`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${supervisorToken}` },
      },
    );
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'RESOURCE_NOT_FOUND');
  });

  it('10. Unassigned Teacher B is forbidden from completing an item of Class 1 (403 FORBIDDEN)', async () => {
    // Get Class 1 approved plan items
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    const list = await listRes.json();
    const approvedPlan = list.find((p: any) => p.status === 'APPROVED');
    assert.ok(approvedPlan);
    const firstItemId = approvedPlan.items[0].id;

    const res = await fetch(`${baseUrl}/api/v1/lesson-plan-items/${firstItemId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherBToken}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN_RESOURCE');
  });

  let completedItemId: string;

  it('11. Assigned Teacher A can complete an item of an APPROVED lesson plan', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    const list = await listRes.json();
    const approvedPlan = list.find((p: any) => p.status === 'APPROVED');
    assert.ok(approvedPlan);
    const itemToComplete = approvedPlan.items[0];
    completedItemId = itemToComplete.id;

    const res = await fetch(`${baseUrl}/api/v1/lesson-plan-items/${itemToComplete.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(res.status, 200);
    const completedItem = await res.json();
    assert.equal(completedItem.id, itemToComplete.id);
    assert.equal(completedItem.completed, true);
    assert.ok(completedItem.completedAt);
  });

  it('12. Completing an already completed item is idempotent (preserves completedAt and avoids duplicate audit)', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    const list = await listRes.json();
    const approvedPlan = list.find((p: any) => p.status === 'APPROVED');
    const completedItem = approvedPlan.items.find((i: any) => i.id === completedItemId);
    assert.ok(completedItem);
    assert.equal(completedItem.completed, true);
    const originalCompletedAt = completedItem.completedAt;

    // Count audit logs before
    const auditsBefore = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, completedItemId));
    const countBefore = auditsBefore.length;

    // Call complete again
    const res = await fetch(`${baseUrl}/api/v1/lesson-plan-items/${completedItemId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.completed, true);
    assert.equal(new Date(result.completedAt).toISOString(), new Date(originalCompletedAt).toISOString());

    // Count audit logs after
    const auditsAfter = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, completedItemId));
    assert.equal(auditsAfter.length, countBefore);
  });

  it('13. Supervisor can complete another item of the approved lesson plan', async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/classes/${class1Id}/lesson-plans`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    const list = await listRes.json();
    const approvedPlan = list.find((p: any) => p.status === 'APPROVED');
    const secondItem = approvedPlan.items.find((i: any) => !i.completed);
    assert.ok(secondItem);
    assert.equal(secondItem.completed, false);

    const res = await fetch(`${baseUrl}/api/v1/lesson-plan-items/${secondItem.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(res.status, 200);
    const completedItem = await res.json();
    assert.equal(completedItem.id, secondItem.id);
    assert.equal(completedItem.completed, true);
    assert.ok(completedItem.completedAt);
  });

  it('14. Audit logs are verified for COMPLETE_LESSON_PLAN_ITEM', async () => {
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'COMPLETE_LESSON_PLAN_ITEM'));

    assert.ok(audits.length >= 2);
    for (const audit of audits) {
      assert.equal(audit.entityType, 'LESSON_PLAN_ITEM');
      assert.ok(audit.metadata.lessonPlanId);
      assert.ok(audit.metadata.classId);
      assert.equal(audit.metadata.completed, true);
    }
  });
});
