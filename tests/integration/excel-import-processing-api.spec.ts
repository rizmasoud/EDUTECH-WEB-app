import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
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
import { count } from 'drizzle-orm';

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
class TestExcelImportModule {}

describe('Shahvar Excel Multipart Upload & Processing Integration Tests', () => {
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

  function createExcelBuffer(headers: string[], rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ShahvarData');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

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
      name: 'Fall 2026',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      status: 'ACTIVE',
    }).returning();
    termId = term.id;

    const [b] = await db.insert(books).values({
      name: 'English Starter',
      level: 'Intro',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    }).returning();
    bookId = b.id;

    // Existing student with Shahvar code
    const [stu] = await db.insert(students).values({
      firstName: 'Reza',
      lastName: 'Hosseini',
      shahvarCode: 'SH-8801',
      isActive: true,
    }).returning();
    existingStudentId = stu.id;

    app = await NestFactory.create(TestExcelImportModule, { logger: false });
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

  it('1. Uploads multipart Excel workbook, generates preview, and ensures NO production side-effects', async () => {
    // Initial counts
    const [initStudents] = await db.select({ val: count() }).from(students);
    const [initClasses] = await db.select({ val: count() }).from(classes);
    const [initEnrollments] = await db.select({ val: count() }).from(enrollments);

    // Create an import job
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'term1_shahvar.xlsx',
      }),
    });
    const job = await createJobRes.json();

    // Create Excel file buffer with 1 matched student and 1 new student
    const excelBuffer = createExcelBuffer(
      ['نام', 'نام خانوادگی', 'کد زبان‌آموز', 'شهریه', 'تخفیف'],
      [
        ['Reza', 'Hosseini', 'SH-8801', '600000', '0%'],
        ['Kian', 'Parsi', 'SH-8802', '600000', '10%'],
      ],
    );

    // Prepare multipart form data
    const formData = new FormData();
    const fileBlob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    formData.append('file', fileBlob, 'term1_shahvar.xlsx');
    formData.append('academicTermId', termId);
    formData.append('bookId', bookId);

    const uploadRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
      },
      body: formData,
    });

    assert.equal(uploadRes.status, 200);
    const preview = await uploadRes.json();

    assert.equal(preview.totalRows, 2);
    assert.equal(preview.validRows, 2);
    assert.equal(preview.invalidRows, 0);
    assert.equal(preview.studentsToMatch.length, 1);
    assert.equal(preview.studentsToMatch[0].studentId, existingStudentId);
    assert.equal(preview.studentsToCreate.length, 1);
    assert.equal(preview.studentsToCreate[0].firstName, 'Kian');

    // Verify SAFETY: Database production records must NOT have changed!
    const [afterStudents] = await db.select({ val: count() }).from(students);
    const [afterClasses] = await db.select({ val: count() }).from(classes);
    const [afterEnrollments] = await db.select({ val: count() }).from(enrollments);

    assert.equal(afterStudents.val, initStudents.val);
    assert.equal(afterClasses.val, initClasses.val);
    assert.equal(afterEnrollments.val, initEnrollments.val);
  });

  it('2. Rejects teacher role on upload endpoint with 403 Forbidden', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'teacher_test.xlsx',
      }),
    });
    const job = await createJobRes.json();

    const excelBuffer = createExcelBuffer(['نام', 'نام خانوادگی'], [['Sara', 'Test']]);
    const formData = new FormData();
    formData.append('file', new Blob([excelBuffer]), 'test.xlsx');
    formData.append('academicTermId', termId);
    formData.append('bookId', bookId);

    const uploadRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
      },
      body: formData,
    });

    assert.equal(uploadRes.status, 403);
  });

  it('3. Rejects upload with missing required metadata fields', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'invalid_meta.xlsx',
      }),
    });
    const job = await createJobRes.json();

    const excelBuffer = createExcelBuffer(['نام', 'نام خانوادگی'], [['Sara', 'Test']]);
    const formData = new FormData();
    formData.append('file', new Blob([excelBuffer]), 'test.xlsx');

    const uploadRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
      },
      body: formData,
    });

    assert.equal(uploadRes.status, 400);
  });

  it('4. Allows supervisor to query GET /api/v1/import-jobs/:id/preview', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'preview_query.xlsx',
      }),
    });
    const job = await createJobRes.json();

    const previewRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/preview`, {
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
      },
    });

    assert.equal(previewRes.status, 200);
    const previewData = await previewRes.json();
    assert.equal(previewData.importJobId, job.id);
  });
});
