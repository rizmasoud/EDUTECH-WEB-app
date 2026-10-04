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
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
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
import { DrizzleClassRepository } from '../../apps/api/src/classes/infrastructure/drizzle-class.repository';
import { DrizzleEnrollmentRepository } from '../../apps/api/src/classes/infrastructure/drizzle-enrollment.repository';
import { CLASS_REPOSITORY, ENROLLMENT_REPOSITORY } from '../../apps/api/src/classes/domain/tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [StudentsController, TeachersController],
  providers: [
    StudentsService,
    TeachersService,
    TeacherOwnershipPolicy,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: STUDENT_REPOSITORY,
      useClass: DrizzleStudentRepository,
    },
    {
      provide: TEACHER_REPOSITORY,
      useClass: DrizzleTeacherRepository,
    },
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
class TestStudentsTeachersApiModule {}

describe('Students & Teachers API, Ownership & Operational Views Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacher1Token: string;
  let teacher2Token: string;

  let teacher1Id: string;
  let teacher2Id: string;
  let termId: string;
  let bookId: string;
  let studentId: string;
  let classId: string;

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

    // Create Teacher 1 account & profile
    const tch1Hash = await hasher.hash('Teacher1Pass123!');
    const [tch1Account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-01',
        passwordHash: tch1Hash,
        isActive: true,
      })
      .returning();
    await db.insert(accountRoles).values({
      accountId: tch1Account.id,
      roleId: tchRole.id,
    });
    const [tch1] = await db.insert(teachers).values({
      accountId: tch1Account.id,
      firstName: 'Teacher',
      lastName: 'One',
      isActive: true,
    }).returning();
    teacher1Id = tch1.id;

    // Create Teacher 2 account & profile
    const tch2Hash = await hasher.hash('Teacher2Pass123!');
    const [tch2Account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-02',
        passwordHash: tch2Hash,
        isActive: true,
      })
      .returning();
    await db.insert(accountRoles).values({
      accountId: tch2Account.id,
      roleId: tchRole.id,
    });
    const [tch2] = await db.insert(teachers).values({
      accountId: tch2Account.id,
      firstName: 'Teacher',
      lastName: 'Two',
      isActive: true,
    }).returning();
    teacher2Id = tch2.id;

    // Login tokens
    const supLogin = await authService.login({
      personnelCode: 'SUP-01',
      password: 'SupervisorPass123!',
    });
    supervisorToken = supLogin.rawToken;

    const tch1Login = await authService.login({
      personnelCode: 'TCH-01',
      password: 'Teacher1Pass123!',
    });
    teacher1Token = tch1Login.rawToken;

    const tch2Login = await authService.login({
      personnelCode: 'TCH-02',
      password: 'Teacher2Pass123!',
    });
    teacher2Token = tch2Login.rawToken;

    // Seed Term, Book, Class, Student, Enrollment
    const [term] = await db.insert(academicTerms).values({
      name: 'Fall 2026',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [b] = await db.insert(books).values({
      name: 'English Level 1',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    bookId = b.id;

    const [cls] = await db.insert(classes).values({
      academicTermId: termId,
      bookId,
      teacherId: teacher1Id,
      classType: 'REGULAR',
      status: 'ACTIVE',
      capacity: 12,
    }).returning();
    classId = cls.id;

    const [stu] = await db.insert(students).values({
      firstName: 'Samantha',
      lastName: 'Jones',
      isActive: true,
    }).returning();
    studentId = stu.id;

    await db.insert(enrollments).values({
      classId,
      studentId,
      status: 'ACTIVE',
    });

    // Start NestJS app
    app = await NestFactory.create(TestStudentsTeachersApiModule, { logger: false });
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

  it('1. Student management endpoints enforce role authorization', async () => {
    // Unauthenticated GET /students returns 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/students`);
    assert.equal(unauthRes.status, 401);

    // Teacher can read students
    const tchReadRes = await fetch(`${baseUrl}/api/v1/students`, {
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    assert.equal(tchReadRes.status, 200);
    const list = await tchReadRes.json();
    assert.ok(Array.isArray(list.items));

    // Teacher cannot create students (403)
    const tchCreateRes = await fetch(`${baseUrl}/api/v1/students`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacher1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ firstName: 'New', lastName: 'Student' }),
    });
    assert.equal(tchCreateRes.status, 403);

    // Supervisor can create students (201)
    const supCreateRes = await fetch(`${baseUrl}/api/v1/students`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ firstName: 'Daniel', lastName: 'Craig', shahvarCode: 'SH-888' }),
    });
    assert.equal(supCreateRes.status, 201);
    const createdStudent = await supCreateRes.json();
    assert.equal(createdStudent.firstName, 'Daniel');
    assert.equal(createdStudent.lastName, 'Craig');
  });

  it('2. Student operational view exposes enrollment history', async () => {
    const res = await fetch(`${baseUrl}/api/v1/students/${studentId}/enrollments`, {
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    assert.equal(res.status, 200);
    const history = await res.json();
    assert.ok(Array.isArray(history));
    assert.equal(history.length, 1);
    assert.equal(history[0].classId, classId);
    assert.equal(history[0].studentId, studentId);
  });

  it('3. Teacher skills management allows Supervisor to assign and delete skills', async () => {
    // Supervisor assigns skill
    const addSkillRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/skills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId }),
    });
    assert.equal(addSkillRes.status, 201);
    const skill = await addSkillRes.json();
    assert.equal(skill.teacherId, teacher1Id);
    assert.equal(skill.bookId, bookId);

    // Duplicate skill is rejected
    const dupSkillRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/skills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId }),
    });
    assert.equal(dupSkillRes.status, 400);

    // List skills
    const getSkillsRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/skills`, {
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    assert.equal(getSkillsRes.status, 200);
    const skillsList = await getSkillsRes.json();
    assert.ok(skillsList.length >= 1);

    // Supervisor deletes skill
    const delRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/skills/${skill.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(delRes.status, 204);
  });

  it('4. Teacher Classes operational view enforces Teacher Ownership policy', async () => {
    // Teacher 1 viewing Teacher 1's classes -> 200 OK
    const t1SelfRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/classes`, {
      headers: { Authorization: `Bearer ${teacher1Token}` },
    });
    assert.equal(t1SelfRes.status, 200);
    const t1Classes = await t1SelfRes.json();
    assert.ok(Array.isArray(t1Classes.items));
    assert.equal(t1Classes.items[0].id, classId);

    // Teacher 2 viewing Teacher 1's classes -> 403 FORBIDDEN
    const t2CrossRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/classes`, {
      headers: { Authorization: `Bearer ${teacher2Token}` },
    });
    assert.equal(t2CrossRes.status, 403);
    const forbiddenBody = await t2CrossRes.json();
    assert.equal(forbiddenBody.error.code, 'FORBIDDEN');

    // Supervisor viewing Teacher 1's classes -> 200 OK
    const supViewRes = await fetch(`${baseUrl}/api/v1/teachers/${teacher1Id}/classes`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(supViewRes.status, 200);
  });
});
