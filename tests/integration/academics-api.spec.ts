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
import { AcademicTermsController } from '../../apps/api/src/academics/presentation/academic-terms.controller';
import { BooksController } from '../../apps/api/src/academics/presentation/books.controller';
import { BookPartsController } from '../../apps/api/src/academics/presentation/book-parts.controller';
import { BookSegmentsController } from '../../apps/api/src/academics/presentation/book-segments.controller';
import { SyllabiController } from '../../apps/api/src/academics/presentation/syllabi.controller';
import { SyllabusItemsController } from '../../apps/api/src/academics/presentation/syllabus-items.controller';
import { AcademicTermsService } from '../../apps/api/src/academics/application/services/academic-terms.service';
import { BooksService } from '../../apps/api/src/academics/application/services/books.service';
import { SyllabusService } from '../../apps/api/src/academics/application/services/syllabus.service';
import { DrizzleAcademicTermRepository } from '../../apps/api/src/academics/infrastructure/drizzle-academic-term.repository';
import { DrizzleBookRepository } from '../../apps/api/src/academics/infrastructure/drizzle-book.repository';
import { ACADEMIC_TERM_REPOSITORY, BOOK_REPOSITORY } from '../../apps/api/src/academics/domain/tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [
    AcademicTermsController,
    BooksController,
    BookPartsController,
    BookSegmentsController,
    SyllabiController,
    SyllabusItemsController,
  ],
  providers: [
    AcademicTermsService,
    BooksService,
    SyllabusService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: ACADEMIC_TERM_REPOSITORY,
      useClass: DrizzleAcademicTermRepository,
    },
    {
      provide: BOOK_REPOSITORY,
      useClass: DrizzleBookRepository,
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
class TestAcademicsApiModule {}

describe('Academics API & Authorization Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;

  let supervisorToken: string;
  let teacherToken: string;

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
    await db.insert(teachers).values({
      accountId: tchAccount.id,
      firstName: 'Jane',
      lastName: 'Doe',
      isActive: true,
    });

    // Login both to get valid session tokens
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

    // Start NestJS app
    app = await NestFactory.create(TestAcademicsApiModule, { logger: false });
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

  it('1. Unauthenticated requests to /api/v1/academic-terms return 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/academic-terms`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('2. Unauthenticated requests to /api/v1/books return 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/books`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('3. TEACHER role can read academic terms and books (200 OK)', async () => {
    const termRes = await fetch(`${baseUrl}/api/v1/academic-terms`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(termRes.status, 200);
    const termBody = await termRes.json();
    assert.ok(Array.isArray(termBody.items));

    const bookRes = await fetch(`${baseUrl}/api/v1/books`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(bookRes.status, 200);
    const bookBody = await bookRes.json();
    assert.ok(Array.isArray(bookBody.items));
  });

  it('4. TEACHER role is forbidden from creating/modifying academic resources (403 FORBIDDEN)', async () => {
    const createTermRes = await fetch(`${baseUrl}/api/v1/academic-terms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unauthorized Term',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      }),
    });
    assert.equal(createTermRes.status, 403);
    const errBody = await createTermRes.json();
    assert.equal(errBody.error.code, 'FORBIDDEN');

    const createBookRes = await fetch(`${baseUrl}/api/v1/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unauthorized Book',
        level: 'A1',
        sequenceOrder: 1,
        sessionCount: 20,
      }),
    });
    assert.equal(createBookRes.status, 403);
  });

  it('5. SUPERVISOR can create an Academic Term (201 CREATED) and enforce date validation', async () => {
    // Invalid date range fails with 400
    const invalidRes = await fetch(`${baseUrl}/api/v1/academic-terms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid Term Dates',
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      }),
    });
    assert.equal(invalidRes.status, 400);

    // Valid creation succeeds
    const validRes = await fetch(`${baseUrl}/api/v1/academic-terms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Fall 2026 Term',
        startDate: '2026-09-01',
        endDate: '2026-12-25',
      }),
    });
    assert.equal(validRes.status, 201);
    const term = await validRes.json();
    assert.equal(term.name, 'Fall 2026 Term');
    assert.equal(term.status, 'PLANNED');

    // Lifecycle transitions: PLANNED -> ACTIVE
    const activateRes = await fetch(`${baseUrl}/api/v1/academic-terms/${term.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(activateRes.status, 200);
    const activated = await activateRes.json();
    assert.equal(activated.status, 'ACTIVE');

    // Invalid transition: activating already ACTIVE term returns 400 INVALID_STATE_TRANSITION
    const reActivateRes = await fetch(`${baseUrl}/api/v1/academic-terms/${term.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(reActivateRes.status, 400);
    const transErr = await reActivateRes.json();
    assert.equal(transErr.error.code, 'INVALID_STATE_TRANSITION');

    // Lifecycle transitions: ACTIVE -> CLOSED
    const closeRes = await fetch(`${baseUrl}/api/v1/academic-terms/${term.id}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(closeRes.status, 200);
    const closed = await closeRes.json();
    assert.equal(closed.status, 'CLOSED');

    // Closed term cannot be modified
    const patchRes = await fetch(`${baseUrl}/api/v1/academic-terms/${term.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Attempted Renaming' }),
    });
    assert.equal(patchRes.status, 400);
    const patchErr = await patchRes.json();
    assert.equal(patchErr.error.code, 'INVALID_STATE_TRANSITION');
  });

  it('6. SUPERVISOR can create Books, BookParts, BookSegments, and verify complete hierarchy', async () => {
    // 1. Create Book
    const bookRes = await fetch(`${baseUrl}/api/v1/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Top Notch 1',
        level: 'A1',
        sequenceOrder: 1,
        sessionCount: 24,
        isTerminal: false,
      }),
    });
    assert.equal(bookRes.status, 201);
    const book = await bookRes.json();
    assert.equal(book.name, 'Top Notch 1');

    // 2. Create BookPart
    const partRes = await fetch(`${baseUrl}/api/v1/books/${book.id}/parts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Units 1-5',
        sequenceOrder: 1,
      }),
    });
    assert.equal(partRes.status, 201);
    const part = await partRes.json();
    assert.equal(part.name, 'Units 1-5');
    assert.equal(part.bookId, book.id);

    // 3. Create BookSegment
    const segRes = await fetch(`${baseUrl}/api/v1/book-parts/${part.id}/segments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unit 1: Getting Acquainted',
        sequenceOrder: 1,
      }),
    });
    assert.equal(segRes.status, 201);
    const segment = await segRes.json();
    assert.equal(segment.name, 'Unit 1: Getting Acquainted');
    assert.equal(segment.bookPartId, part.id);

    // 4. Retrieve complete hierarchy
    const hierRes = await fetch(`${baseUrl}/api/v1/book-segments/${segment.id}/hierarchy`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(hierRes.status, 200);
    const hier = await hierRes.json();
    assert.equal(hier.segment.id, segment.id);
    assert.equal(hier.part.id, part.id);
    assert.equal(hier.book.id, book.id);
  });

  it('7. Unauthenticated requests to /api/v1/syllabi return 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/syllabi`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('8. TEACHER role is forbidden from write operations on syllabi (403 FORBIDDEN)', async () => {
    // Attempt POST syllabus
    const createRes = await fetch(`${baseUrl}/api/v1/syllabi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(createRes.status, 403);
    const errBody = await createRes.json();
    assert.equal(errBody.error.code, 'FORBIDDEN');

    // Attempt PATCH syllabus
    const patchRes = await fetch(`${baseUrl}/api/v1/syllabi/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(patchRes.status, 403);

    // Attempt POST syllabus item
    const itemRes = await fetch(`${baseUrl}/api/v1/syllabi/00000000-0000-0000-0000-000000000000/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'VOCABULARY',
        title: 'Forbidden Item',
        sequenceOrder: 1,
      }),
    });
    assert.equal(itemRes.status, 403);

    // Attempt PATCH syllabus item
    const patchItemRes = await fetch(`${baseUrl}/api/v1/syllabus-items/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    assert.equal(patchItemRes.status, 403);

    // Attempt DELETE syllabus item
    const delItemRes = await fetch(`${baseUrl}/api/v1/syllabus-items/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(delItemRes.status, 403);
  });

  it('9. SUPERVISOR can manage canonical syllabi and syllabus items; TEACHER can read; audits logged', async () => {
    // 1. Create a Book first
    const bookRes = await fetch(`${baseUrl}/api/v1/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Syllabus Book 1',
        level: 'B1',
        sequenceOrder: 10,
        sessionCount: 20,
      }),
    });
    assert.equal(bookRes.status, 201);
    const book = await bookRes.json();

    // 2. Create Syllabus as SUPERVISOR
    const sylRes = await fetch(`${baseUrl}/api/v1/syllabi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: book.id }),
    });
    assert.equal(sylRes.status, 201);
    const syllabus = await sylRes.json();
    assert.equal(syllabus.bookId, book.id);

    // 3. TEACHER can list syllabi and get syllabus detail
    const listRes = await fetch(`${baseUrl}/api/v1/syllabi?bookId=${book.id}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 1);

    const getRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(getRes.status, 200);
    const detail = await getRes.json();
    assert.equal(detail.id, syllabus.id);

    // 4. Update Syllabus metadata as SUPERVISOR
    const patchSylRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: book.id }),
    });
    assert.equal(patchSylRes.status, 200);

    // 5. Add Syllabus Items as SUPERVISOR
    const item1Res = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'VOCABULARY',
        title: 'Unit 1 Vocab',
        description: 'Key words',
        required: true,
        sequenceOrder: 1,
      }),
    });
    assert.equal(item1Res.status, 201);
    const item1 = await item1Res.json();
    assert.equal(item1.title, 'Unit 1 Vocab');
    assert.equal(item1.type, 'VOCABULARY');

    const item2Res = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'GRAMMAR',
        title: 'Unit 1 Grammar',
        sequenceOrder: 2,
      }),
    });
    assert.equal(item2Res.status, 201);
    const item2 = await item2Res.json();
    assert.equal(item2.type, 'GRAMMAR');

    // 6. TEACHER can view items
    const itemsRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(itemsRes.status, 200);
    const itemsList = await itemsRes.json();
    assert.equal(itemsList.length, 2);
    assert.equal(itemsList[0].sequenceOrder, 1);
    assert.equal(itemsList[1].sequenceOrder, 2);

    // 7. Update Syllabus Item as SUPERVISOR
    const patchItemRes = await fetch(`${baseUrl}/api/v1/syllabus-items/${item1.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Unit 1 Vocab' }),
    });
    assert.equal(patchItemRes.status, 200);
    const updatedItem = await patchItemRes.json();
    assert.equal(updatedItem.title, 'Updated Unit 1 Vocab');

    // 8. Delete Syllabus Item as SUPERVISOR
    const delRes = await fetch(`${baseUrl}/api/v1/syllabus-items/${item2.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.deleted, true);

    // Verify remaining item count
    const remainingRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const remaining = await remainingRes.json();
    assert.equal(remaining.length, 1);
  });

  it('10. Enforces syllabus validations: duplicate sequenceOrder, invalid book reference, invalid item type', async () => {
    // Create book and syllabus
    const bookRes = await fetch(`${baseUrl}/api/v1/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Validation Book',
        level: 'B2',
        sequenceOrder: 11,
        sessionCount: 20,
      }),
    });
    const book = await bookRes.json();

    const sylRes = await fetch(`${baseUrl}/api/v1/syllabi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: book.id }),
    });
    const syllabus = await sylRes.json();

    // Invalid Book reference -> 404
    const invalidBookRes = await fetch(`${baseUrl}/api/v1/syllabi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(invalidBookRes.status, 404);

    // Add first item sequenceOrder: 1
    await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'WORKBOOK',
        title: 'Workbook 1',
        sequenceOrder: 1,
      }),
    });

    // Duplicate sequenceOrder: 1 -> 400 INVALID_INPUT
    const dupRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'FILM',
        title: 'Film 1',
        sequenceOrder: 1,
      }),
    });
    assert.equal(dupRes.status, 400);

    // Invalid Item Type -> 400 INVALID_INPUT
    const invalidTypeRes = await fetch(`${baseUrl}/api/v1/syllabi/${syllabus.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'INVALID_TYPE',
        title: 'Invalid Item',
        sequenceOrder: 2,
      }),
    });
    assert.equal(invalidTypeRes.status, 400);
  });
});
