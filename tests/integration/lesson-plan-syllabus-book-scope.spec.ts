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
import { academicTerms, books, bookParts, bookSegments, syllabi, syllabusItems } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
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


describe('Lesson Plan creation resolves the canonical Syllabus by Book only', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  let teacherToken: string;
  let teacherId: string;
  let termId: string;

  const createPlan = (classId: string) =>
    fetch(`${baseUrl}/api/v1/classes/${classId}/lesson-plans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

  async function seedBook(name: string, order: number) {
    const [book] = await db.insert(books).values({ name, level: 'A1', sequenceOrder: order, sessionCount: 20 }).returning();
    const [part] = await db.insert(bookParts).values({ bookId: book.id, name: `${name} Part`, sequenceOrder: 1 }).returning();
    const [seg1] = await db.insert(bookSegments).values({ bookPartId: part.id, name: 'Unit 1', sequenceOrder: 1 }).returning();
    const [seg2] = await db.insert(bookSegments).values({ bookPartId: part.id, name: 'Unit 2', sequenceOrder: 2 }).returning();
    return { book, part, seg1, seg2 };
  }

  async function seedSyllabus(bookId: string, titles: string[], bookSegmentId: string | null = null) {
    const [syl] = await db.insert(syllabi).values({ bookId, bookSegmentId }).returning();
    await db.insert(syllabusItems).values(
      titles.map((title, i) => ({ syllabusId: syl.id, type: 'GRAMMAR', title, sequenceOrder: i + 1, required: true })),
    );
    return syl;
  }

  async function seedClass(bookId: string, bookSegmentId: string | null) {
    const [cls] = await db
      .insert(classes)
      .values({
        academicTermId: termId,
        bookId,
        bookSegmentId,
        teacherId,
        classType: 'REGULAR',
        status: 'ACTIVE',
        capacity: 12,
      })
      .returning();
    return cls;
  }

  const snapshot = async () => ({
    books: await db.select().from(books).orderBy(books.id),
    parts: await db.select().from(bookParts).orderBy(bookParts.id),
    segments: await db.select().from(bookSegments).orderBy(bookSegments.id),
    syllabi: await db.select().from(syllabi).orderBy(syllabi.id),
    syllabusItems: await db.select().from(syllabusItems).orderBy(syllabusItems.id),
    classes: await db.select().from(classes).orderBy(classes.id),
  });

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
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();
    const [acc] = await db
      .insert(accounts)
      .values({ personnelCode: 'TCH-01', passwordHash: await hasher.hash('TeacherPass123!'), isActive: true })
      .returning();
    await db.insert(accountRoles).values({ accountId: acc.id, roleId: tchRole.id });
    const [t] = await db.insert(teachers).values({ accountId: acc.id, firstName: 'Alice', lastName: 'Smith', isActive: true }).returning();
    teacherId = t.id;
    const [term] = await db
      .insert(academicTerms)
      .values({ name: 'Spring 2026', startDate: '2026-03-01', endDate: '2026-06-30', status: 'ACTIVE' })
      .returning();
    termId = term.id;
    teacherToken = (await authService.login({ personnelCode: 'TCH-01', password: 'TeacherPass123!' })).rawToken;

    app = await NestFactory.create(TestEducationApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  it('a class with a Segment still receives the activities of its Book canonical Syllabus', async () => {
    const { book, seg1 } = await seedBook('Book One', 1);
    await seedSyllabus(book.id, ['Canonical 1', 'Canonical 2']);
    const cls = await seedClass(book.id, seg1.id);
    assert.notEqual(cls.bookSegmentId, null);

    const res = await createPlan(cls.id);
    assert.equal(res.status, 201);
    const plan = await res.json();
    assert.deepEqual(plan.items.map((i: any) => i.title), ['Canonical 1', 'Canonical 2']);
  });

  it('a legacy segment-linked Syllabus is resolved by Book id, not by matching the class Segment', async () => {
    const { book, seg1, seg2 } = await seedBook('Book Two', 2);
    // The only Syllabus of the Book carries a legacy link to Unit 2; the class is on Unit 1.
    const legacy = await seedSyllabus(book.id, ['Legacy A', 'Legacy B'], seg2.id);
    const cls = await seedClass(book.id, seg1.id);
    const before = await snapshot();

    const res = await createPlan(cls.id);
    assert.equal(res.status, 201);
    const plan = await res.json();
    assert.deepEqual(plan.items.map((i: any) => i.title), ['Legacy A', 'Legacy B']);
    const [item] = await db.select().from(syllabusItems).where(eq(syllabusItems.syllabusId, legacy.id)).orderBy(syllabusItems.sequenceOrder);
    assert.equal(plan.items[0].syllabusItemId, item.id);

    // Creating a plan never rewrites Books, Parts, Segments, Syllabi, Syllabus Items or Classes.
    assert.deepEqual(await snapshot(), before);
  });

  it('a class without a Segment behaves the same way', async () => {
    const { book } = await seedBook('Book Three', 3);
    await seedSyllabus(book.id, ['Whole 1']);
    const cls = await seedClass(book.id, null);
    const plan = await (await createPlan(cls.id)).json();
    assert.deepEqual(plan.items.map((i: any) => i.title), ['Whole 1']);
  });

  it("another Book's Syllabus never leaks into a class", async () => {
    const a = await seedBook('Book Four', 4);
    const b = await seedBook('Book Five', 5);
    await seedSyllabus(a.book.id, ['Only in A']);
    await seedSyllabus(b.book.id, ['Only in B']);
    const clsB = await seedClass(b.book.id, b.seg1.id);
    const plan = await (await createPlan(clsB.id)).json();
    assert.deepEqual(plan.items.map((i: any) => i.title), ['Only in B']);
  });
});
