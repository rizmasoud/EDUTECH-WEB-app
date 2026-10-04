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
class TestImportsApiModule {}

describe('Shahvar Import Foundation API & Validation Integration Tests', () => {
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

    // Existing student with Shahvar code
    const [stu] = await db.insert(students).values({
      firstName: 'Hassan',
      lastName: 'Rezaei',
      shahvarCode: 'SH-1001',
      isActive: true,
    }).returning();
    existingStudentId = stu.id;

    app = await NestFactory.create(TestImportsApiModule, { logger: false });
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

  it('1. Import job management endpoints enforce role authorization', async () => {
    // Unauthenticated -> 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/import-jobs`);
    assert.equal(unauthRes.status, 401);

    // Teacher -> 403 Forbidden (Import is Supervisor-only)
    const tchRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(tchRes.status, 403);

    // Supervisor -> 200 OK
    const supRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(supRes.status, 200);
  });

  it('2. Create ImportJob in PENDING status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'term1_shahvar_class.xlsx',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.id);
    assert.equal(body.type, 'SHAHVAR_EXCEL');
    assert.equal(body.status, 'PENDING');
    assert.equal(body.fileName, 'term1_shahvar_class.xlsx');
  });

  it('3. Validate Shahvar import rows with duplicate detection and match diagnostics', async () => {
    // Create a job first
    const createRes = await fetch(`${baseUrl}/api/v1/import-jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SHAHVAR_EXCEL',
        fileName: 'test_validation.xlsx',
      }),
    });
    const job = await createRes.json();

    // Validate rows containing:
    // Row 1: Valid new student with unique code
    // Row 2: Existing student match by code (SH-1001)
    // Row 3: Missing last name -> ERROR
    // Row 4: Duplicate code (same as Row 1) -> ERROR
    const validateRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicTermId: termId,
        bookId,
        rows: [
          {
            rowNumber: 1,
            firstName: 'Ali',
            lastName: 'Ahmadi',
            shahvarStudentCode: 'SH-2001',
          },
          {
            rowNumber: 2,
            firstName: 'Hassan',
            lastName: 'Rezaei',
            shahvarStudentCode: 'SH-1001',
          },
          {
            rowNumber: 3,
            firstName: 'Incomplete',
            lastName: '',
            shahvarStudentCode: 'SH-3001',
          },
          {
            rowNumber: 4,
            firstName: 'Duplicate',
            lastName: 'User',
            shahvarStudentCode: 'SH-2001',
          },
        ],
      }),
    });

    assert.equal(validateRes.status, 200);
    const preview = await validateRes.json();
    assert.equal(preview.totalRows, 4);
    assert.equal(preview.validRows, 2);
    assert.equal(preview.invalidRows, 2);
    assert.equal(preview.studentsToCreate.length, 1);
    assert.equal(preview.studentsToCreate[0].firstName, 'Ali');
    assert.equal(preview.studentsToMatch.length, 1);
    assert.equal(preview.studentsToMatch[0].studentId, existingStudentId);

    // Check that results were persisted
    const resultsRes = await fetch(`${baseUrl}/api/v1/import-jobs/${job.id}/results`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(resultsRes.status, 200);
    const resultsData = await resultsRes.json();
    assert.equal(resultsData.total, 4);
  });
});
