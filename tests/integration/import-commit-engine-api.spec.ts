import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { importJobs, importResults } from '../../apps/api/src/infrastructure/database/schema/imports.schema';
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
import { ImportsController } from '../../apps/api/src/imports/presentation/imports.controller';
import { ImportsService } from '../../apps/api/src/imports/application/services/imports.service';
import { ShahvarValidatorService } from '../../apps/api/src/imports/application/services/shahvar-validator.service';
import { DrizzleImportJobRepository } from '../../apps/api/src/imports/infrastructure/drizzle-import-job.repository';
import { DrizzleImportResultRepository } from '../../apps/api/src/imports/infrastructure/drizzle-import-result.repository';
import { SheetJsExcelParserAdapter } from '../../apps/api/src/imports/infrastructure/adapters/sheetjs-excel-parser.adapter';
import {
  IMPORT_JOB_REPOSITORY,
  IMPORT_RESULT_REPOSITORY,
  EXCEL_PARSER,
} from '../../apps/api/src/imports/domain/tokens';
import { DrizzleStudentRepository } from '../../apps/api/src/students/infrastructure/drizzle-student.repository';
import { STUDENT_REPOSITORY } from '../../apps/api/src/students/domain/tokens';
import { DrizzleClassRepository } from '../../apps/api/src/classes/infrastructure/drizzle-class.repository';
import { CLASS_REPOSITORY } from '../../apps/api/src/classes/domain/tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { count, eq } from 'drizzle-orm';

let sharedDb: any;

@Module({
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ShahvarValidatorService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: IMPORT_JOB_REPOSITORY,
      useClass: DrizzleImportJobRepository,
    },
    {
      provide: IMPORT_RESULT_REPOSITORY,
      useClass: DrizzleImportResultRepository,
    },
    {
      provide: EXCEL_PARSER,
      useClass: SheetJsExcelParserAdapter,
    },
    {
      provide: STUDENT_REPOSITORY,
      useClass: DrizzleStudentRepository,
    },
    {
      provide: CLASS_REPOSITORY,
      useClass: DrizzleClassRepository,
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
class TestImportCommitModule {}

describe('Shahvar Import Commit Engine Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacherToken: string;

  let termId: string;
  let bookId: string;
  let existingStudentId: string;

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

    // Roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    // Accounts
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

    // Academic reference data
    const [term] = await db.insert(academicTerms).values({
      name: 'Winter 2026',
      startDate: '2026-01-10',
      endDate: '2026-04-10',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [b] = await db.insert(books).values({
      name: 'English Level 2',
      level: 'A2',
      sequenceOrder: 2,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    bookId = b.id;

    // Existing student with Shahvar code
    const [stu] = await db.insert(students).values({
      firstName: 'Farhad',
      lastName: 'Majidi',
      shahvarCode: 'SH-9901',
      isActive: true,
    }).returning();
    existingStudentId = stu.id;

    app = await NestFactory.create(TestImportCommitModule, { logger: false });
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

  it('1. Rejects unauthenticated and teacher requests to commit endpoint', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/v1/import-jobs/00000000-0000-0000-0000-000000000000/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicTermId: termId, bookId, rows: [] }),
    });
    assert.equal(unauthRes.status, 401);

    const tchRes = await fetch(`${baseUrl}/api/v1/import-jobs/00000000-0000-0000-0000-000000000000/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ academicTermId: termId, bookId, rows: [] }),
    });
    assert.equal(tchRes.status, 403);
  });

  it('2. Rejects commit on unvalidated import job', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'unvalidated_test.xlsx',
      }),
    });
    const job = await createJobRes.json();

    const commitRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows: [
          { rowNumber: 1, firstName: 'Test', lastName: 'Student', shahvarStudentCode: 'SH-8888' },
        ],
      }),
    });

    assert.equal(commitRes.status, 400);
    const body = await commitRes.json();
    assert.equal(body.error.code, 'UNVALIDATED_IMPORT_JOB');
  });

  it('3. Successfully commits validated import job: creates new student, matches existing student, creates class & enrollments, and completes job', async () => {
    // 1. Create job
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'valid_commit_test.xlsx',
      }),
    });
    const job = await createJobRes.json();

    const rows = [
      {
        rowNumber: 1,
        firstName: 'Farhad',
        lastName: 'Majidi',
        shahvarStudentCode: 'SH-9901', // Existing match
      },
      {
        rowNumber: 2,
        firstName: 'Omid',
        lastName: 'Nourizad',
        shahvarStudentCode: 'SH-9902', // New student
      },
    ];

    // 2. Validate first
    const validateRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows,
      }),
    });
    assert.equal(validateRes.status, 200);

    // Initial counts
    const [initStudents] = await db.select({ val: count() }).from(students);
    const [initClasses] = await db.select({ val: count() }).from(classes);
    const [initEnrollments] = await db.select({ val: count() }).from(enrollments);

    // 3. Commit
    const commitRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        capacity: 12,
        rows,
      }),
    });

    assert.equal(commitRes.status, 200);
    const result = await commitRes.json();

    assert.equal(result.importJobId, job.id);
    assert.equal(result.status, 'COMPLETED');
    assert.ok(result.classId);
    assert.equal(result.studentsMatchedCount, 1);
    assert.equal(result.studentsCreatedCount, 1);
    assert.equal(result.enrollmentsCreatedCount, 2);
    assert.equal(result.matchedStudentIds[0], existingStudentId);

    // Verify DB mutations
    const [afterStudents] = await db.select({ val: count() }).from(students);
    const [afterClasses] = await db.select({ val: count() }).from(classes);
    const [afterEnrollments] = await db.select({ val: count() }).from(enrollments);

    assert.equal(afterStudents.val, initStudents.val + 1); // 1 new student
    assert.equal(afterClasses.val, initClasses.val + 1); // 1 new class
    assert.equal(afterEnrollments.val, initEnrollments.val + 2); // 2 enrollments

    // Verify class properties
    const [createdClass] = await db.select().from(classes).where(eq(classes.id, result.classId));
    assert.equal(createdClass.academicTermId, termId);
    assert.equal(createdClass.bookId, bookId);
    assert.equal(createdClass.capacity, 12);
    assert.equal(createdClass.status, 'DRAFT');

    // Verify job updated to COMPLETED
    const [completedJob] = await db.select().from(importJobs).where(eq(importJobs.id, job.id));
    assert.equal(completedJob.status, 'COMPLETED');
    assert.ok(completedJob.completedAt);
  });

  it('4. Idempotency: prevents committing an already completed job and prevents duplicate creation', async () => {
    // Attempting to commit the already completed job from previous test
    // List all jobs to get completed one
    const jobsList = await db.select().from(importJobs).where(eq(importJobs.status, 'COMPLETED')).limit(1);
    const completedJob = jobsList[0];

    const [initStudents] = await db.select({ val: count() }).from(students);
    const [initClasses] = await db.select({ val: count() }).from(classes);
    const [initEnrollments] = await db.select({ val: count() }).from(enrollments);

    const repeatCommitRes = await fetch(`${baseUrl}/api/v1/import-jobs/${completedJob.id}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows: [
          { rowNumber: 1, firstName: 'Omid', lastName: 'Nourizad', shahvarStudentCode: 'SH-9902' },
        ],
      }),
    });

    assert.equal(repeatCommitRes.status, 400);
    const repeatBody = await repeatCommitRes.json();
    assert.equal(repeatBody.error.code, 'JOB_ALREADY_COMMITTED');

    // Verify NO duplicate records created
    const [afterStudents] = await db.select({ val: count() }).from(students);
    const [afterClasses] = await db.select({ val: count() }).from(classes);
    const [afterEnrollments] = await db.select({ val: count() }).from(enrollments);

    assert.equal(afterStudents.val, initStudents.val);
    assert.equal(afterClasses.val, initClasses.val);
    assert.equal(afterEnrollments.val, initEnrollments.val);
  });

  it('5. Transactional safety: validation error rolls back all mutations', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'rollback_test.xlsx',
      }),
    });
    const job = await createJobRes.json();

    // Validate with valid rows first so status is PROCESSING
    await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows: [{ rowNumber: 1, firstName: 'Valid', lastName: 'Student', shahvarStudentCode: 'SH-5555' }],
      }),
    });

    const [initStudents] = await db.select({ val: count() }).from(students);
    const [initClasses] = await db.select({ val: count() }).from(classes);
    const [initEnrollments] = await db.select({ val: count() }).from(enrollments);

    // Attempt commit with invalid row (missing last name)
    const commitRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows: [
          { rowNumber: 1, firstName: 'New', lastName: 'Student', shahvarStudentCode: 'SH-6661' },
          { rowNumber: 2, firstName: 'Bad', lastName: '', shahvarStudentCode: 'SH-6662' },
        ],
      }),
    });

    assert.equal(commitRes.status, 400);
    const rollbackBody = await commitRes.json();
    assert.equal(rollbackBody.error.code, 'IMPORT_VALIDATION_ERRORS');

    // Verify complete rollback: zero mutations in production tables
    const [afterStudents] = await db.select({ val: count() }).from(students);
    const [afterClasses] = await db.select({ val: count() }).from(classes);
    const [afterEnrollments] = await db.select({ val: count() }).from(enrollments);

    assert.equal(afterStudents.val, initStudents.val);
    assert.equal(afterClasses.val, initClasses.val);
    assert.equal(afterEnrollments.val, initEnrollments.val);
  });
});
