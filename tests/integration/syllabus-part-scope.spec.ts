/**
 * Canonical syllabus per Book Part (Phase 7).
 *
 * Rule: a syllabus is defined per Book Part. A book with Parts has Part-specific syllabi only (no whole-book
 * syllabus); a book without Parts has exactly one whole-book syllabus. Segments are subdivisions inside a Part
 * and are never a syllabus scope. Lesson plans copy the syllabus of the class's exact Book + Part.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import {
  academicTerms,
  bookParts,
  bookSegments,
  books,
  syllabi,
  syllabusItems,
} from '../../apps/api/src/infrastructure/database/schema/academics.schema';
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
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { applyMigrations } from '../helpers/migration-helper';
import { SyllabusService } from '../../apps/api/src/academics/application/services/syllabus.service';
import { SyllabiController } from '../../apps/api/src/academics/presentation/syllabi.controller';
import { SyllabusItemsController } from '../../apps/api/src/academics/presentation/syllabus-items.controller';
import { LessonPlanService } from '../../apps/api/src/education/application/services/lesson-plan.service';
import { ClassLessonPlansController } from '../../apps/api/src/education/presentation/class-lesson-plans.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [SyllabiController, SyllabusItemsController, ClassLessonPlansController],
  providers: [
    SyllabusService,
    LessonPlanService,
    AuthService,
    AuthGuard,
    RolesGuard,
    { provide: DRIZZLE_DB, useFactory: () => sharedDb },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKEN_SERVICE, useClass: CryptoSessionTokenService },
    { provide: LOGIN_RATE_LIMITER, useClass: MemoryLoginRateLimiter },
    { provide: SECURITY_AUDIT_SERVICE, useClass: DrizzleSecurityAuditService },
  ],
})
class TestSyllabusScopeModule {}

describe('Canonical syllabus per Book Part (Phase 7)', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;
  let supervisorAccountId: string;

  // Multi-part book "Touchstone 1": Part 1 (segments 1a, 1b), Part 2 (segment 2a), Part 3 (segment 3a, no syllabus yet)
  let multiBookId: string;
  const part: Record<'p1' | 'p2' | 'p3', string> = { p1: '', p2: '', p3: '' };
  const seg: Record<'s1a' | 's1b' | 's2a' | 's3a', string> = { s1a: '', s1b: '', s2a: '', s3a: '' };
  // Book without parts
  let singleBookId: string;
  let emptySingleBookId: string;
  const cls: Record<string, string> = {};

  const api = (path: string, token: string | null, init: { method?: string; body?: unknown } = {}) =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  const createSyllabus = (body: Record<string, unknown>, token = supervisorToken) =>
    api('/syllabi', token, { method: 'POST', body });
  const syllabusRows = (bookId: string) => db.select().from(syllabi).where(eq(syllabi.bookId, bookId));
  const errorOf = async (res: Response) => (await res.json()).error as { code: string; message: string };

  async function addItems(syllabusId: string, titles: string[]) {
    let order = 1;
    for (const title of titles) {
      await db.insert(syllabusItems).values({ syllabusId, type: 'GRAMMAR', title, sequenceOrder: order++ });
    }
  }

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
    const mkAccount = async (code: string, password: string, roleId: string) => {
      const [acc] = await db
        .insert(accounts)
        .values({ personnelCode: code, passwordHash: await hasher.hash(password), isActive: true })
        .returning();
      await db.insert(accountRoles).values({ accountId: acc.id, roleId });
      return acc;
    };
    const sup = await mkAccount('SUP-01', 'SupervisorPass123!', supRole.id);
    supervisorAccountId = sup.id;
    const tA = await mkAccount('TCH-A', 'TeacherAPass123!', tchRole.id);
    const tB = await mkAccount('TCH-B', 'TeacherBPass123!', tchRole.id);
    const [teacherA] = await db
      .insert(teachers)
      .values({ accountId: tA.id, firstName: 'Alice', lastName: 'A', baseRate: '100.00', isActive: true })
      .returning();
    await db.insert(teachers).values({ accountId: tB.id, firstName: 'Bob', lastName: 'B', baseRate: '100.00', isActive: true });

    supervisorToken = (await authService.login({ personnelCode: 'SUP-01', password: 'SupervisorPass123!' })).rawToken;
    teacherAToken = (await authService.login({ personnelCode: 'TCH-A', password: 'TeacherAPass123!' })).rawToken;
    teacherBToken = (await authService.login({ personnelCode: 'TCH-B', password: 'TeacherBPass123!' })).rawToken;

    const [term] = await db
      .insert(academicTerms)
      .values({ name: 'Term', startDate: '2026-03-01', endDate: '2026-06-30', status: 'ACTIVE' })
      .returning();

    const mkBook = async (name: string, order: number) => {
      const [b] = await db
        .insert(books)
        .values({ name, level: 'A1', sequenceOrder: order, sessionCount: 20 })
        .returning();
      return b.id as string;
    };
    multiBookId = await mkBook('Touchstone 1', 1);
    singleBookId = await mkBook('Single Part Book', 2);
    emptySingleBookId = await mkBook('Single Part Book Without Syllabus', 3);

    const mkPart = async (key: 'p1' | 'p2' | 'p3', order: number) => {
      const [p] = await db.insert(bookParts).values({ bookId: multiBookId, name: `Part ${order}`, sequenceOrder: order }).returning();
      part[key] = p.id;
    };
    await mkPart('p1', 1);
    await mkPart('p2', 2);
    await mkPart('p3', 3);
    const mkSeg = async (key: 's1a' | 's1b' | 's2a' | 's3a', partKey: 'p1' | 'p2' | 'p3', order: number) => {
      const [s] = await db
        .insert(bookSegments)
        .values({ bookPartId: part[partKey], name: `Unit ${key}`, sequenceOrder: order })
        .returning();
      seg[key] = s.id;
    };
    await mkSeg('s1a', 'p1', 1);
    await mkSeg('s1b', 'p1', 2);
    await mkSeg('s2a', 'p2', 1);
    await mkSeg('s3a', 'p3', 1);

    const mkClass = async (key: string, bookId: string, segmentId: string | null) => {
      const [c] = await db
        .insert(classes)
        .values({
          academicTermId: term.id,
          bookId,
          bookSegmentId: segmentId,
          teacherId: teacherA.id,
          classType: 'REGULAR',
          status: 'ACTIVE',
          capacity: 10,
        })
        .returning();
      cls[key] = c.id;
    };
    await mkClass('p1a', multiBookId, seg.s1a);
    await mkClass('p1b', multiBookId, seg.s1b);
    await mkClass('p2a', multiBookId, seg.s2a);
    await mkClass('p3a', multiBookId, seg.s3a);
    await mkClass('noSegment', multiBookId, null);
    await mkClass('single', singleBookId, null);
    await mkClass('singleEmpty', emptySingleBookId, null);

    app = await NestFactory.create(TestSyllabusScopeModule);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
  });

  after(async () => {
    await app.close();
    await pg.close();
  });

  describe('multi-part book: one syllabus per Part', () => {
    it('1 + 4. accepts one syllabus for each Part; different Parts each get their own syllabus', async () => {
      const r1 = await createSyllabus({ bookId: multiBookId, bookPartId: part.p1 });
      assert.equal(r1.status, 201);
      const s1 = await r1.json();
      assert.equal(s1.bookPartId, part.p1);
      assert.equal(s1.bookPart.name, 'Part 1');
      assert.equal(s1.bookSegmentId, null);

      const r2 = await createSyllabus({ bookId: multiBookId, bookPartId: part.p2 });
      assert.equal(r2.status, 201);
      const s2 = await r2.json();
      assert.equal(s2.bookPartId, part.p2);
      assert.notEqual(s1.id, s2.id);

      await addItems(s1.id, ['P1 grammar', 'P1 vocab']);
      await addItems(s2.id, ['P2 grammar']);
      assert.equal((await syllabusRows(multiBookId)).length, 2);
    });

    it('2. rejects a whole-book syllabus for a book that has Parts, and writes nothing', async () => {
      const before = (await syllabusRows(multiBookId)).length;
      const res = await createSyllabus({ bookId: multiBookId });
      assert.equal(res.status, 400);
      assert.equal((await errorOf(res)).code, 'SYLLABUS_PART_REQUIRED');
      const explicitNull = await createSyllabus({ bookId: multiBookId, bookPartId: null });
      assert.equal(explicitNull.status, 400);
      assert.equal((await errorOf(explicitNull)).code, 'SYLLABUS_PART_REQUIRED');
      assert.equal((await syllabusRows(multiBookId)).length, before);
    });

    it('3. rejects a duplicate syllabus for the same Book + Part with 409 and keeps a single row', async () => {
      const res = await createSyllabus({ bookId: multiBookId, bookPartId: part.p1 });
      assert.equal(res.status, 409);
      assert.equal((await errorOf(res)).code, 'SYLLABUS_DUPLICATE_SCOPE');
      const rows = await db.select().from(syllabi).where(and(eq(syllabi.bookId, multiBookId), eq(syllabi.bookPartId, part.p1)));
      assert.equal(rows.length, 1);
    });

    it('rejects a Part that does not exist (404) or belongs to another book (400)', async () => {
      const missing = await createSyllabus({ bookId: multiBookId, bookPartId: '00000000-0000-4000-8000-000000000000' });
      assert.equal(missing.status, 404);
      // Part 1 of the multi-part book, used for a different book that has its own parts: invalid, not applicable.
      const [other] = await db.insert(books).values({ name: 'Other', level: 'A1', sequenceOrder: 9, sessionCount: 10 }).returning();
      await db.insert(bookParts).values({ bookId: other.id, name: 'Other part', sequenceOrder: 1 });
      const foreign = await createSyllabus({ bookId: other.id, bookPartId: part.p1 });
      assert.equal(foreign.status, 400);
      assert.equal((await errorOf(foreign)).code, 'INVALID_INPUT');
    });

    it('concurrent creation for the same Part yields exactly one syllabus (service check + unique index)', async () => {
      const [raced] = await db.insert(bookParts).values({ bookId: multiBookId, name: 'Race part', sequenceOrder: 9 }).returning();
      const results = await Promise.all([
        createSyllabus({ bookId: multiBookId, bookPartId: raced.id }),
        createSyllabus({ bookId: multiBookId, bookPartId: raced.id }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const rows = await db.select().from(syllabi).where(eq(syllabi.bookPartId, raced.id));
      assert.equal(rows.length, 1);
    });
  });

  describe('book without Parts: one whole-book syllabus', () => {
    it('5. accepts exactly one whole-book syllabus and rejects a second', async () => {
      const first = await createSyllabus({ bookId: singleBookId });
      assert.equal(first.status, 201);
      const created = await first.json();
      assert.equal(created.bookPartId, null);
      assert.equal(created.bookSegmentId, null);
      await addItems(created.id, ['Whole-book item']);

      const second = await createSyllabus({ bookId: singleBookId, bookPartId: null });
      assert.equal(second.status, 409);
      assert.equal((await errorOf(second)).code, 'SYLLABUS_DUPLICATE_SCOPE');
      assert.equal((await syllabusRows(singleBookId)).length, 1);
    });

    it('6. rejects Part-specific and Segment-specific scopes', async () => {
      const withPart = await createSyllabus({ bookId: singleBookId, bookPartId: part.p1 });
      assert.equal(withPart.status, 400);
      assert.equal((await errorOf(withPart)).code, 'SYLLABUS_PART_NOT_APPLICABLE');

      const withSegment = await createSyllabus({ bookId: singleBookId, bookSegmentId: seg.s1a });
      assert.equal(withSegment.status, 400);
      assert.equal((await errorOf(withSegment)).code, 'SYLLABUS_SEGMENT_SCOPE_NOT_ALLOWED');
      assert.equal((await syllabusRows(singleBookId)).length, 1);
    });
  });

  describe('segments are never a syllabus scope', () => {
    it('7. rejects a segment on create (alone or together with its part) with a clear code, writing nothing', async () => {
      const before = await db.select().from(syllabi);
      for (const body of [
        { bookId: multiBookId, bookSegmentId: seg.s1a },
        { bookId: multiBookId, bookPartId: part.p3, bookSegmentId: seg.s3a },
        { bookId: singleBookId, bookSegmentId: seg.s1a },
      ]) {
        const res = await createSyllabus(body);
        assert.equal(res.status, 400);
        const error = await errorOf(res);
        assert.equal(error.code, 'SYLLABUS_SEGMENT_SCOPE_NOT_ALLOWED');
        assert.match(error.message, /cannot be defined for a segment/);
      }
      assert.equal((await db.select().from(syllabi)).length, before.length);
    });

    it('7. rejects a segment on update, leaving the syllabus unchanged', async () => {
      const [p1] = await db.select().from(syllabi).where(eq(syllabi.bookPartId, part.p1));
      const res = await api(`/syllabi/${p1.id}`, supervisorToken, { method: 'PATCH', body: { bookSegmentId: seg.s1a } });
      assert.equal(res.status, 400);
      assert.equal((await errorOf(res)).code, 'SYLLABUS_SEGMENT_SCOPE_NOT_ALLOWED');
      const [after] = await db.select().from(syllabi).where(eq(syllabi.id, p1.id));
      assert.equal(after.bookPartId, part.p1);
      assert.equal(after.bookSegmentId, null);
    });

    it('7. the database refuses a syllabus with both a part and a segment, and duplicate scopes', async () => {
      const rawInsert = (values: Record<string, unknown>) => db.insert(syllabi).values(values);
      await assert.rejects(rawInsert({ bookId: multiBookId, bookPartId: part.p3, bookSegmentId: seg.s3a }), /syllabi_single_scope_check|check constraint/);
      await assert.rejects(rawInsert({ bookId: multiBookId, bookPartId: part.p1 }), /syllabi_book_part_unique|unique/);
      await assert.rejects(rawInsert({ bookId: singleBookId }), /syllabi_book_whole_unique|unique/);
      // A non-duplicate part scope is fine at the database level.
      await rawInsert({ bookId: multiBookId, bookPartId: part.p3 }).returning();
      await db.delete(syllabi).where(eq(syllabi.bookPartId, part.p3));
    });

    it('7. lists syllabi by part without exposing segments as scopes', async () => {
      const res = await api(`/syllabi?bookId=${multiBookId}&bookPartId=${part.p2}`, teacherAToken);
      assert.equal(res.status, 200);
      const list = await res.json();
      assert.equal(list.length, 1);
      assert.equal(list[0].bookPartId, part.p2);
      assert.equal(list[0].bookSegmentId, null);
    });
  });

  describe('lesson plan creation resolves the syllabus of the exact Book + Part', () => {
    const createPlan = (classKey: string, token = teacherAToken, body: Record<string, unknown> = {}) =>
      api(`/classes/${cls[classKey]}/lesson-plans`, token, { method: 'POST', body });
    const planItemTitles = async (planId: string) =>
      (await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, planId)))
        .map((i: any) => i.title)
        .sort();

    it('8. copies the syllabus of the class Part; two segments of one Part use the same syllabus; another Part uses its own', async () => {
      const a = await createPlan('p1a');
      assert.equal(a.status, 201);
      assert.deepEqual(await planItemTitles((await a.json()).id), ['P1 grammar', 'P1 vocab']);

      const b = await createPlan('p1b');
      assert.equal(b.status, 201);
      assert.deepEqual(await planItemTitles((await b.json()).id), ['P1 grammar', 'P1 vocab']);

      const c = await createPlan('p2a');
      assert.equal(c.status, 201);
      const cPlanId = (await c.json()).id;
      assert.deepEqual(await planItemTitles(cPlanId), ['P2 grammar']);

      // The copied items reference items of exactly the Part syllabus.
      const [p2Syllabus] = await db.select().from(syllabi).where(eq(syllabi.bookPartId, part.p2));
      const p2Items = await db.select().from(syllabusItems).where(eq(syllabusItems.syllabusId, p2Syllabus.id));
      const copied = await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, cPlanId));
      assert.deepEqual(copied.map((i: any) => i.syllabusItemId), p2Items.map((i: any) => i.id));
    });

    it('9. copies the whole-book syllabus for a class of a book without Parts', async () => {
      const res = await createPlan('single');
      assert.equal(res.status, 201);
      assert.deepEqual(await planItemTitles((await res.json()).id), ['Whole-book item']);
    });

    it('10. a Part without a syllabus is a clear domain error, never a fallback to another Part or a legacy segment syllabus', async () => {
      // A legacy segment-scoped syllabus exists for this very segment and must not be used.
      const [legacy] = await db.insert(syllabi).values({ bookId: multiBookId, bookSegmentId: seg.s3a }).returning();
      await addItems(legacy.id, ['Legacy segment item']);
      const plansBefore = (await db.select().from(lessonPlans)).length;
      const auditsBefore = (await db.select().from(auditLogs).where(eq(auditLogs.action, 'CREATE_LESSON_PLAN'))).length;

      const res = await createPlan('p3a');
      assert.equal(res.status, 409);
      const error = await errorOf(res);
      assert.equal(error.code, 'SYLLABUS_NOT_DEFINED');
      assert.match(error.message, /book part "Part 3"/);

      assert.equal((await db.select().from(lessonPlans)).length, plansBefore, 'no plan is created');
      assert.equal(
        (await db.select().from(auditLogs).where(eq(auditLogs.action, 'CREATE_LESSON_PLAN'))).length,
        auditsBefore,
        'no audit row is written',
      );
    });

    it('10. a book without Parts and without a syllabus is a clear domain error', async () => {
      const res = await createPlan('singleEmpty');
      assert.equal(res.status, 409);
      const error = await errorOf(res);
      assert.equal(error.code, 'SYLLABUS_NOT_DEFINED');
      assert.match(error.message, /whole book "Single Part Book Without Syllabus"/);
    });

    it('10. a class without a segment on a book with Parts cannot resolve its Part', async () => {
      const res = await createPlan('noSegment');
      assert.equal(res.status, 409);
      assert.equal((await errorOf(res)).code, 'CLASS_PART_UNKNOWN');
    });

    it('10. an explicit blank plan (copySyllabusItems: false) or explicit items still work without a syllabus', async () => {
      const blank = await createPlan('p3a', teacherAToken, { copySyllabusItems: false });
      assert.equal(blank.status, 201);
      assert.deepEqual(await planItemTitles((await blank.json()).id), []);

      const explicit = await createPlan('p3a', teacherAToken, { initialItems: [{ title: 'My own item' }] });
      assert.equal(explicit.status, 201);
      assert.deepEqual(await planItemTitles((await explicit.json()).id), ['My own item']);
    });
  });

  describe('legacy segment syllabi and historical lesson plans', () => {
    it('11. moving a legacy segment syllabus to its Part keeps its items and every historical lesson plan item', async () => {
      const [legacy] = await db.select().from(syllabi).where(eq(syllabi.bookSegmentId, seg.s3a));
      const legacyItems = await db.select().from(syllabusItems).where(eq(syllabusItems.syllabusId, legacy.id));
      // A historical lesson plan whose item was copied from the legacy syllabus.
      const [teacher] = await db.select().from(teachers).where(eq(teachers.firstName, 'Alice'));
      const [historical] = await db
        .insert(lessonPlans)
        .values({ classId: cls.p3a, teacherId: teacher.id, status: 'APPROVED' })
        .returning();
      await db.insert(lessonPlanItems).values({
        lessonPlanId: historical.id,
        syllabusItemId: legacyItems[0].id,
        title: legacyItems[0].title,
        completed: true,
      });
      const planItemsBefore = await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, historical.id));

      const res = await api(`/syllabi/${legacy.id}`, supervisorToken, { method: 'PATCH', body: { bookPartId: part.p3 } });
      assert.equal(res.status, 200);
      const moved = await res.json();
      assert.equal(moved.bookPartId, part.p3);
      assert.equal(moved.bookSegmentId, null, 'the legacy segment link is cleared by the explicit move');
      assert.equal(moved.items.length, legacyItems.length, 'its items are kept');

      const planItemsAfter = await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, historical.id));
      assert.deepEqual(planItemsAfter, planItemsBefore, 'the historical plan items are untouched');
      const [auditRow] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, legacy.id), eq(auditLogs.action, 'UPDATE_SYLLABUS')));
      assert.equal((auditRow.metadata as any).previousBookSegmentId, seg.s3a);

      // Now Part 3 has its syllabus and lesson plans copy it.
      const res2 = await api(`/classes/${cls.p3a}/lesson-plans`, teacherAToken, { method: 'POST', body: {} });
      assert.equal(res2.status, 201);
      assert.deepEqual(
        (await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, (await res2.json()).id))).map((i: any) => i.title),
        ['Legacy segment item'],
      );
    });

    it('11. adding to or changing a syllabus later does not change an existing lesson plan', async () => {
      const [p1] = await db.select().from(syllabi).where(eq(syllabi.bookPartId, part.p1));
      const [plan] = await db.select().from(lessonPlans).where(eq(lessonPlans.classId, cls.p1a));
      const before = await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, plan.id));
      const add = await api(`/syllabi/${p1.id}/items`, supervisorToken, {
        method: 'POST',
        body: { type: 'FILM', title: 'Added later', sequenceOrder: 99 },
      });
      assert.equal(add.status, 201);
      const after = await db.select().from(lessonPlanItems).where(eq(lessonPlanItems.lessonPlanId, plan.id));
      assert.deepEqual(after, before);
    });

    it('a legacy segment syllabus cannot be moved onto a Part that already has a syllabus', async () => {
      const [legacy] = await db.insert(syllabi).values({ bookId: multiBookId, bookSegmentId: seg.s1b }).returning();
      const res = await api(`/syllabi/${legacy.id}`, supervisorToken, { method: 'PATCH', body: { bookPartId: part.p1 } });
      assert.equal(res.status, 409);
      assert.equal((await errorOf(res)).code, 'SYLLABUS_DUPLICATE_SCOPE');
      const [unchanged] = await db.select().from(syllabi).where(eq(syllabi.id, legacy.id));
      assert.equal(unchanged.bookSegmentId, seg.s1b, 'nothing is rewritten on a rejected move');
      assert.equal(unchanged.bookPartId, null);
    });

    it('a legacy segment syllabus on a multi-part book cannot be silently turned into a whole-book syllabus', async () => {
      const [legacy] = await db.select().from(syllabi).where(eq(syllabi.bookSegmentId, seg.s1b));
      const res = await api(`/syllabi/${legacy.id}`, supervisorToken, { method: 'PATCH', body: {} });
      assert.equal(res.status, 400);
      assert.equal((await errorOf(res)).code, 'SYLLABUS_PART_REQUIRED');
    });

    it('legacy segment syllabi do not occupy the whole-book scope of a book without parts', async () => {
      // The whole-book unique index only covers rows with neither part nor segment.
      const rows = await db.select().from(syllabi).where(and(eq(syllabi.bookId, singleBookId), isNull(syllabi.bookPartId), isNull(syllabi.bookSegmentId)));
      assert.equal(rows.length, 1);
    });
  });

  describe('authorization is unchanged', () => {
    it('13. teachers cannot create or update syllabi (403); anonymous requests are 401', async () => {
      const before = (await db.select().from(syllabi)).length;
      const create = await createSyllabus({ bookId: multiBookId, bookPartId: part.p3 }, teacherAToken);
      assert.equal(create.status, 403);
      const [any] = await db.select().from(syllabi).where(eq(syllabi.bookPartId, part.p1));
      const patch = await api(`/syllabi/${any.id}`, teacherAToken, { method: 'PATCH', body: { bookPartId: part.p2 } });
      assert.equal(patch.status, 403);
      const anonymous = await createSyllabus({ bookId: multiBookId, bookPartId: part.p3 }, null as any);
      assert.equal(anonymous.status, 401);
      assert.equal((await db.select().from(syllabi)).length, before);
    });

    it('13. teachers can still read syllabi, and a teacher cannot create a lesson plan for another teacher\'s class', async () => {
      const list = await api(`/syllabi?bookId=${multiBookId}`, teacherBToken);
      assert.equal(list.status, 200);
      const forbidden = await api(`/classes/${cls.p1a}/lesson-plans`, teacherBToken, { method: 'POST', body: {} });
      assert.equal(forbidden.status, 403);
    });

    it('13. the supervisor still creates lesson plans through the same resolution', async () => {
      const res = await api(`/classes/${cls.p2a}/lesson-plans`, supervisorToken, { method: 'POST', body: { teacherId: undefined } });
      // A supervisor must name a teacher unless the class has one; the class has Alice, so this succeeds.
      assert.equal(res.status, 201);
    });
  });
});
