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

import { eq } from 'drizzle-orm';
import { books, bookParts, bookSegments, syllabi, syllabusItems } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
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


describe('Canonical Syllabus per Book (Book is the only scope)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let supervisorToken: string;
  let teacherToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const call = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: token ? auth(token) : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function seedBook(name: string, order: number) {
    const [book] = await db.insert(books).values({ name, level: 'A1', sequenceOrder: order, sessionCount: 20 }).returning();
    const [part] = await db.insert(bookParts).values({ bookId: book.id, name: `${name} Part`, sequenceOrder: 1 }).returning();
    const [segment] = await db
      .insert(bookSegments)
      .values({ bookPartId: part.id, name: `${name} Unit`, sequenceOrder: 1 })
      .returning();
    return { book, part, segment };
  }

  const snapshotHierarchy = async () => ({
    books: await db.select().from(books).orderBy(books.id),
    parts: await db.select().from(bookParts).orderBy(bookParts.id),
    segments: await db.select().from(bookSegments).orderBy(bookSegments.id),
  });

  const syllabusRows = (bookId: string) => db.select().from(syllabi).where(eq(syllabi.bookId, bookId));

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);
    db = drizzle(pg, { schema });
    sharedDb = db;

    const hasher = new ScryptPasswordHasher();
    const authService = new AuthService(
      db,
      hasher,
      new CryptoSessionTokenService(),
      new MemoryLoginRateLimiter({ maxAttempts: 5, windowMs: 900000 }),
      new DrizzleSecurityAuditService(db),
    );

    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();
    const [sup] = await db
      .insert(accounts)
      .values({ personnelCode: 'SUP-01', passwordHash: await hasher.hash('SupervisorPass123!'), isActive: true })
      .returning();
    await db.insert(accountRoles).values({ accountId: sup.id, roleId: supRole.id });
    const [tch] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH-01', passwordHash: await hasher.hash('TeacherPass123!'), isActive: true })
      .returning();
    await db.insert(accountRoles).values({ accountId: tch.id, roleId: tchRole.id });
    await db.insert(teachers).values({ accountId: tch.id, firstName: 'Jane', lastName: 'Doe', isActive: true });

    supervisorToken = (await authService.login({ personnelCode: 'SUP-01', password: 'SupervisorPass123!' })).rawToken;
    teacherToken = (await authService.login({ personnelCode: 'TCH-01', password: 'TeacherPass123!' })).rawToken;

    app = await NestFactory.create(TestAcademicsApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  it('two different Books have independent Syllabi, including items', async () => {
    const a = await seedBook('Series Book 1', 1);
    const b = await seedBook('Series Book 2', 2); // same series, different Book

    const resA = await call('POST', '/syllabi', supervisorToken, { bookId: a.book.id });
    const resB = await call('POST', '/syllabi', supervisorToken, { bookId: b.book.id });
    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);
    const sylA = await resA.json();
    const sylB = await resB.json();
    assert.notEqual(sylA.id, sylB.id);
    assert.equal(sylA.bookId, a.book.id);
    assert.equal(sylB.bookId, b.book.id);

    const item = { type: 'GRAMMAR', title: 'Only in A', required: true, sequenceOrder: 1 };
    assert.equal((await call('POST', `/syllabi/${sylA.id}/items`, supervisorToken, item)).status, 201);
    // The same order number is free in B: items are scoped to their own syllabus.
    assert.equal(
      (await call('POST', `/syllabi/${sylB.id}/items`, supervisorToken, { ...item, title: 'Only in B' })).status,
      201,
    );

    const listA = await (await call('GET', `/syllabi?bookId=${a.book.id}`, supervisorToken)).json();
    const listB = await (await call('GET', `/syllabi?bookId=${b.book.id}`, supervisorToken)).json();
    assert.deepEqual(listA.map((s: any) => s.id), [sylA.id]);
    assert.deepEqual(listB.map((s: any) => s.id), [sylB.id]);
    const detailA = await (await call('GET', `/syllabi/${sylA.id}`, supervisorToken)).json();
    const detailB = await (await call('GET', `/syllabi/${sylB.id}`, supervisorToken)).json();
    assert.deepEqual(detailA.items.map((i: any) => i.title), ['Only in A']);
    assert.deepEqual(detailB.items.map((i: any) => i.title), ['Only in B']);
  });

  it('a Book cannot have a second Syllabus: 409 from the API, nothing changed', async () => {
    const { book } = await seedBook('Dup Book', 3);
    const first = await call('POST', '/syllabi', supervisorToken, { bookId: book.id });
    assert.equal(first.status, 201);
    const firstBody = await first.json();

    const second = await call('POST', '/syllabi', supervisorToken, { bookId: book.id });
    assert.equal(second.status, 409);
    const err = await second.json();
    assert.equal(err.error.code, 'CONFLICT');
    assert.match(err.error.message, /already has a syllabus/);

    const rows = await syllabusRows(book.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, firstBody.id);
  });

  it('the database itself rejects a second Syllabus for a Book (unique index), even with a different segment', async () => {
    const { book, segment } = await seedBook('Raw Dup Book', 4);
    await db.insert(syllabi).values({ bookId: book.id });
    for (const values of [{ bookId: book.id }, { bookId: book.id, bookSegmentId: segment.id }]) {
      await assert.rejects(
        () => db.insert(syllabi).values(values),
        (e: any) => (e?.code ?? e?.cause?.code) === '23505' && /syllabi_book_unique/.test(String(e?.message ?? e?.cause?.message) + String(e?.constraint ?? e?.cause?.constraint ?? '')),
      );
    }
    assert.equal((await syllabusRows(book.id)).length, 1);
  });

  it('simultaneous creates for one Book leave exactly one Syllabus', async () => {
    const { book } = await seedBook('Race Book', 5);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call('POST', '/syllabi', supervisorToken, { bookId: book.id })),
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409]);
    assert.equal((await syllabusRows(book.id)).length, 1);
  });

  it('Part and Segment ids never influence creation, lookup or scope', async () => {
    const a = await seedBook('Scope Book A', 6);
    const b = await seedBook('Scope Book B', 7);

    // A segment/part id (even one from another Book) is ignored on create: no 400, and nothing is stored.
    const created = await call('POST', '/syllabi', supervisorToken, {
      bookId: a.book.id,
      bookSegmentId: b.segment.id,
      bookPartId: b.part.id,
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.bookId, a.book.id);
    assert.equal('bookSegmentId' in body, false);
    assert.equal('bookSegment' in body, false);
    const [row] = await syllabusRows(a.book.id);
    assert.equal(row.bookSegmentId, null);

    // Lookup filters by Book only: segment/part filters change nothing.
    for (const query of [
      `bookId=${a.book.id}`,
      `bookId=${a.book.id}&bookSegmentId=${a.segment.id}`,
      `bookId=${a.book.id}&bookSegmentId=${b.segment.id}`,
      `bookId=${a.book.id}&bookPartId=${b.part.id}`,
    ]) {
      const list = await (await call('GET', `/syllabi?${query}`, supervisorToken)).json();
      assert.deepEqual(list.map((s: any) => s.id), [body.id], query);
    }
    // A segment id alone does not resolve any Syllabus.
    const bySegmentOnly = await (await call('GET', `/syllabi?bookSegmentId=${a.segment.id}`, supervisorToken)).json();
    assert.ok(bySegmentOnly.some((s: any) => s.id === body.id), 'the filter is ignored, not applied');

    // Update ignores segment/part fields and never writes book_segment_id.
    const patched = await call('PATCH', `/syllabi/${body.id}`, supervisorToken, {
      bookSegmentId: a.segment.id,
      bookPartId: a.part.id,
    });
    assert.equal(patched.status, 200);
    assert.equal((await syllabusRows(a.book.id))[0].bookSegmentId, null);
  });

  it('a legacy segment-linked Syllabus is resolved by its Book and its stored segment link is left untouched', async () => {
    const { book, segment } = await seedBook('Legacy Book', 8);
    const [legacy] = await db.insert(syllabi).values({ bookId: book.id, bookSegmentId: segment.id }).returning();
    const [legacyItem] = await db
      .insert(syllabusItems)
      .values({ syllabusId: legacy.id, type: 'OTHER', title: 'Legacy item', required: true, sequenceOrder: 1 })
      .returning();
    const before = await snapshotHierarchy();

    const list = await (await call('GET', `/syllabi?bookId=${book.id}`, supervisorToken)).json();
    assert.deepEqual(list.map((s: any) => s.id), [legacy.id]);
    assert.equal('bookSegment' in list[0], false);

    // Creating is refused (the Book already has its Syllabus), editing and item changes work Book-level.
    assert.equal((await call('POST', '/syllabi', supervisorToken, { bookId: book.id })).status, 409);
    assert.equal((await call('PATCH', `/syllabi/${legacy.id}`, supervisorToken, { bookId: book.id })).status, 200);
    assert.equal(
      (await call('PATCH', `/syllabus-items/${legacyItem.id}`, supervisorToken, { title: 'Renamed' })).status,
      200,
    );

    const [after] = await syllabusRows(book.id);
    assert.equal(after.id, legacy.id);
    assert.equal(after.bookSegmentId, segment.id, 'legacy segment link is preserved, never rewritten');
    assert.deepEqual(await snapshotHierarchy(), before, 'books, parts and segments are untouched');
  });

  it('Parts and Segments keep working through their own endpoints', async () => {
    const { part, segment } = await seedBook('Hierarchy Book', 9);
    assert.equal((await call('GET', `/book-parts/${part.id}`, supervisorToken)).status, 200);
    const segments = await (await call('GET', `/book-parts/${part.id}/segments`, supervisorToken)).json();
    assert.ok(JSON.stringify(segments).includes(segment.id));
    assert.equal((await call('GET', `/book-segments/${segment.id}`, supervisorToken)).status, 200);
  });

  it('a Syllabus cannot be moved to another Book', async () => {
    const a = await seedBook('Move A', 10);
    const b = await seedBook('Move B', 11);
    const created = await (await call('POST', '/syllabi', supervisorToken, { bookId: a.book.id })).json();
    const res = await call('PATCH', `/syllabi/${created.id}`, supervisorToken, { bookId: b.book.id });
    assert.equal(res.status, 400);
    assert.equal((await syllabusRows(a.book.id)).length, 1);
    assert.equal((await syllabusRows(b.book.id)).length, 0);
  });

  it('rejects an unknown Book and an invalid book id', async () => {
    assert.equal(
      (await call('POST', '/syllabi', supervisorToken, { bookId: '00000000-0000-4000-8000-000000000000' })).status,
      404,
    );
    assert.equal((await call('POST', '/syllabi', supervisorToken, { bookId: 'nope' })).status, 400);
    assert.equal((await call('POST', '/syllabi', supervisorToken, {})).status, 400);
  });

  it('enforces authorization: unauthenticated 401, Teacher may read but not manage, Supervisor manages', async () => {
    const { book } = await seedBook('Auth Book', 12);

    assert.equal((await call('GET', '/syllabi')).status, 401);
    assert.equal((await call('POST', '/syllabi', undefined, { bookId: book.id })).status, 401);

    const forbidden = await call('POST', '/syllabi', teacherToken, { bookId: book.id });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');
    assert.equal((await syllabusRows(book.id)).length, 0, 'a forbidden create stores nothing');

    const created = await (await call('POST', '/syllabi', supervisorToken, { bookId: book.id })).json();
    assert.equal((await call('GET', `/syllabi?bookId=${book.id}`, teacherToken)).status, 200);
    assert.equal((await call('GET', `/syllabi/${created.id}`, teacherToken)).status, 200);
    assert.equal((await call('PATCH', `/syllabi/${created.id}`, teacherToken, { bookId: book.id })).status, 403);
    assert.equal(
      (await call('POST', `/syllabi/${created.id}/items`, teacherToken, { type: 'OTHER', title: 'x', sequenceOrder: 1 })).status,
      403,
    );
  });
});
