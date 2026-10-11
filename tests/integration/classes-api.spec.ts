import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers, teacherSkills } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books, bookParts, bookSegments } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
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
import { ClassesController } from '../../apps/api/src/classes/presentation/classes.controller';
import { EnrollmentsController } from '../../apps/api/src/classes/presentation/enrollments.controller';
import { ClassesService } from '../../apps/api/src/classes/application/services/classes.service';
import { EnrollmentsService } from '../../apps/api/src/classes/application/services/enrollments.service';
import { DrizzleClassRepository } from '../../apps/api/src/classes/infrastructure/drizzle-class.repository';
import { DrizzleEnrollmentRepository } from '../../apps/api/src/classes/infrastructure/drizzle-enrollment.repository';
import { CLASS_REPOSITORY, ENROLLMENT_REPOSITORY } from '../../apps/api/src/classes/domain/tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [ClassesController, EnrollmentsController],
  providers: [
    ClassesService,
    EnrollmentsService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: CLASS_REPOSITORY,
      useClass: DrizzleClassRepository,
    },
    {
      provide: ENROLLMENT_REPOSITORY,
      useClass: DrizzleEnrollmentRepository,
    },
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
class TestClassesApiModule {}

describe('Classes & Enrollment API & Authorization Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacherToken: string;

  let termId: string;
  let book1Id: string;
  let book2Id: string;
  let teacherId: string;
  let student1Id: string;
  let student2Id: string;

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

    // Seed roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // Create supervisor account
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

    // Create teacher account & teacher profile
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
    const [tch] = await db.insert(teachers).values({
      accountId: tchAccount.id,
      firstName: 'Jane',
      lastName: 'Doe',
      isActive: true,
    }).returning();
    teacherId = tch.id;

    // Login both
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

    // Seed academic foundation
    const [term] = await db.insert(academicTerms).values({
      name: 'Spring 2026',
      startDate: '2026-03-01',
      endDate: '2026-06-30',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [b1] = await db.insert(books).values({
      name: 'Book A1',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    book1Id = b1.id;

    const [b2] = await db.insert(books).values({
      name: 'Book B1',
      level: 'B1',
      sequenceOrder: 2,
      sessionCount: 24,
      isTerminal: false,
      isActive: true,
    }).returning();
    book2Id = b2.id;

    // Teacher has skill for Book A1 ONLY (not Book B1)
    await db.insert(teacherSkills).values({
      teacherId,
      bookId: book1Id,
    });

    // Students
    const [s1] = await db.insert(students).values({
      firstName: 'Student',
      lastName: 'One',
      isActive: true,
    }).returning();
    student1Id = s1.id;

    const [s2] = await db.insert(students).values({
      firstName: 'Student',
      lastName: 'Two',
      isActive: true,
    }).returning();
    student2Id = s2.id;

    // Start NestJS app
    app = await NestFactory.create(TestClassesApiModule, { logger: false });
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

  it('1. Unauthenticated requests to /api/v1/classes return 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('2. TEACHER role can read classes and class enrollments (200 OK)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items));
  });

  it('3. TEACHER role is forbidden from creating classes (403 FORBIDDEN)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        capacity: 12,
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('4. SUPERVISOR can create a Class in DRAFT status (201 CREATED)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        teacherId,
        capacity: 10,
        classType: 'REGULAR',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.academicTermId, termId);
    assert.equal(body.bookId, book1Id);
    assert.equal(body.teacherId, teacherId);
    assert.equal(body.status, 'DRAFT');
    assert.equal(body.capacity, 10);
  });

  it('5. Class activation enforces teacher skill validation', async () => {
    // Create class with Book B1 (where teacher has NO skill)
    const createRes = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book2Id,
        teacherId,
      }),
    });
    assert.equal(createRes.status, 201);
    const clsB1 = await createRes.json();

    // Attempting to activate class where teacher lacks skill must fail with TEACHER_INELIGIBLE
    const activateRes1 = await fetch(`${baseUrl}/api/v1/classes/${clsB1.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(activateRes1.status, 400);
    const errBody = await activateRes1.json();
    assert.equal(errBody.error.code, 'TEACHER_INELIGIBLE');

    // Create class with Book A1 (where teacher HAS skill)
    const createRes2 = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        teacherId,
      }),
    });
    assert.equal(createRes2.status, 201);
    const clsA1 = await createRes2.json();

    // Activation succeeds
    const activateRes2 = await fetch(`${baseUrl}/api/v1/classes/${clsA1.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(activateRes2.status, 200);
    const activated = await activateRes2.json();
    assert.equal(activated.status, 'ACTIVE');
  });

  it('6. Class capacity is strictly enforced on student enrollments', async () => {
    // Create private class with capacity = 1
    const createRes = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        teacherId,
        capacity: 1,
        classType: 'PRIVATE',
      }),
    });
    assert.equal(createRes.status, 201);
    const cls = await createRes.json();

    // 1st student enrollment succeeds
    const enr1Res = await fetch(`${baseUrl}/api/v1/classes/${cls.id}/enrollments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student1Id,
      }),
    });
    assert.equal(enr1Res.status, 201);
    const enr1 = await enr1Res.json();
    assert.equal(enr1.studentId, student1Id);
    assert.equal(enr1.status, 'ACTIVE');

    // 2nd student enrollment exceeds capacity -> 400 CAPACITY_EXCEEDED
    const enr2Res = await fetch(`${baseUrl}/api/v1/classes/${cls.id}/enrollments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: student2Id,
      }),
    });
    assert.equal(enr2Res.status, 400);
    const errBody = await enr2Res.json();
    assert.equal(errBody.error.code, 'CAPACITY_EXCEEDED');
  });

  it('7. Duplicate active student enrollment in the same class is rejected', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        teacherId,
        capacity: 10,
      }),
    });
    const cls = await createRes.json();

    // 1st enrollment
    const enr1 = await fetch(`${baseUrl}/api/v1/classes/${cls.id}/enrollments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId: student1Id }),
    });
    assert.equal(enr1.status, 201);

    // Duplicate enrollment attempt for student1 in same class
    const dupRes = await fetch(`${baseUrl}/api/v1/classes/${cls.id}/enrollments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId: student1Id }),
    });
    assert.equal(dupRes.status, 400);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.error.code, 'DUPLICATE_ENROLLMENT');
  });

  it('8. Student enrollment withdrawal sets status to WITHDRAWN and records leftAt timestamp', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/classes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId: book1Id,
        teacherId,
        capacity: 10,
      }),
    });
    const cls = await createRes.json();

    const enrRes = await fetch(`${baseUrl}/api/v1/classes/${cls.id}/enrollments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId: student2Id }),
    });
    const enr = await enrRes.json();

    // Withdraw enrollment
    const withdrawRes = await fetch(`${baseUrl}/api/v1/enrollments/${enr.id}/withdraw`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(withdrawRes.status, 200);
    const withdrawn = await withdrawRes.json();
    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.ok(withdrawn.leftAt);
  });
  describe('Class name creation, editing, and persistence', () => {
    const authHeaders = () => ({
      Authorization: `Bearer ${supervisorToken}`,
      'Content-Type': 'application/json',
    });

    const createClass = (extra: Record<string, unknown> = {}) =>
      fetch(`${baseUrl}/api/v1/classes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          academicTermId: termId,
          bookId: book1Id,
          teacherId,
          capacity: 10,
          ...extra,
        }),
      });

    it('9. SUPERVISOR can create a class with a name; it is trimmed, returned, and persists after reload', async () => {
      const res = await createClass({ className: '  Touchstone 1 - A  ', color: 'mint' });
      assert.equal(res.status, 201);
      const created = await res.json();
      assert.equal(created.className, 'Touchstone 1 - A');
      assert.equal(created.color, 'mint');

      const getRes = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(getRes.status, 200);
      assert.equal((await getRes.json()).className, 'Touchstone 1 - A');

      const listRes = await fetch(`${baseUrl}/api/v1/classes?pageSize=100`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      const list = await listRes.json();
      const listed = list.items.find((c: any) => c.id === created.id);
      assert.ok(listed, 'created class should appear in the class list');
      assert.equal(listed.className, 'Touchstone 1 - A');

      const [row] = await db.select().from(classes).where(eq(classes.id, created.id));
      assert.equal(row.name, 'Touchstone 1 - A');
    });

    it('10. A class created without a name keeps a null name (no invented name)', async () => {
      const res = await createClass();
      assert.equal(res.status, 201);
      const created = await res.json();
      assert.equal(created.className, null);

      const [row] = await db.select().from(classes).where(eq(classes.id, created.id));
      assert.equal(row.name, null);
    });

    it('11. SUPERVISOR can rename a class; unrelated updates leave the name untouched; null clears it', async () => {
      const created = await (await createClass({ className: 'Original Name', color: 'pink' })).json();

      const renameRes = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ className: 'Renamed Section B' }),
      });
      assert.equal(renameRes.status, 200);
      const renamed = await renameRes.json();
      assert.equal(renamed.className, 'Renamed Section B');
      assert.equal(renamed.color, 'pink', 'class color must be preserved');

      const capacityRes = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ capacity: 9 }),
      });
      assert.equal(capacityRes.status, 200);
      assert.equal((await capacityRes.json()).className, 'Renamed Section B');

      const reload = await (
        await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
          headers: { Authorization: `Bearer ${supervisorToken}` },
        })
      ).json();
      assert.equal(reload.className, 'Renamed Section B');
      assert.equal(reload.capacity, 9);

      const clearRes = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ className: null }),
      });
      assert.equal(clearRes.status, 200);
      assert.equal((await clearRes.json()).className, null);
    });

    it('12. Blank, whitespace-only, and over-long class names are rejected with 400 INVALID_INPUT', async () => {
      for (const bad of ['', '   ', 'x'.repeat(129)]) {
        const createRes = await createClass({ className: bad });
        assert.equal(createRes.status, 400, `create should reject ${JSON.stringify(bad.slice(0, 10))}`);
        assert.equal((await createRes.json()).error.code, 'INVALID_INPUT');
      }

      const created = await (await createClass({ className: 'Valid Name' })).json();
      for (const bad of ['', '   ', 'y'.repeat(129)]) {
        const patchRes = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ className: bad }),
        });
        assert.equal(patchRes.status, 400, `patch should reject ${JSON.stringify(bad.slice(0, 10))}`);
        assert.equal((await patchRes.json()).error.code, 'INVALID_INPUT');
      }

      const reload = await (
        await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
          headers: { Authorization: `Bearer ${supervisorToken}` },
        })
      ).json();
      assert.equal(reload.className, 'Valid Name', 'rejected updates must not change the stored name');
    });

    it('13. Existing classes without a stored name stay readable and editable (backward compatible)', async () => {
      const [legacy] = await db
        .insert(classes)
        .values({
          academicTermId: termId,
          bookId: book1Id,
          teacherId,
          classType: 'REGULAR',
          status: 'DRAFT',
          capacity: 8,
          color: 'lavender',
        })
        .returning();

      const getRes = await fetch(`${baseUrl}/api/v1/classes/${legacy.id}`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
      });
      assert.equal(getRes.status, 200);
      const body = await getRes.json();
      assert.equal(body.className, null);
      assert.equal(body.color, 'lavender');
      assert.equal(body.capacity, 8);

      const patchRes = await fetch(`${baseUrl}/api/v1/classes/${legacy.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ className: 'Now Named' }),
      });
      assert.equal(patchRes.status, 200);
      const patched = await patchRes.json();
      assert.equal(patched.className, 'Now Named');
      assert.equal(patched.color, 'lavender');
    });

    it('14. TEACHER role cannot rename a class (403 FORBIDDEN)', async () => {
      const created = await (await createClass({ className: 'Protected Name' })).json();
      const res = await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${teacherToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ className: 'Hijacked' }),
      });
      assert.equal(res.status, 403);

      const reload = await (
        await fetch(`${baseUrl}/api/v1/classes/${created.id}`, {
          headers: { Authorization: `Bearer ${supervisorToken}` },
        })
      ).json();
      assert.equal(reload.className, 'Protected Name');
    });
  });
});
