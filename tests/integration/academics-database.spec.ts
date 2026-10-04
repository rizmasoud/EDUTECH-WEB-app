import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { academicTerms, books, bookParts, bookSegments } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { DrizzleAcademicTermRepository } from '../../apps/api/src/academics/infrastructure/drizzle-academic-term.repository';
import { DrizzleBookRepository } from '../../apps/api/src/academics/infrastructure/drizzle-book.repository';
import { eq } from 'drizzle-orm';
import { applyMigrations } from '../helpers/migration-helper';

describe('Academics Database Schema & Repository Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let termRepo: DrizzleAcademicTermRepository;
  let bookRepo: DrizzleBookRepository;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    termRepo = new DrizzleAcademicTermRepository(db);
    bookRepo = new DrizzleBookRepository(db);
  });

  after(async () => {
    if (pg) {
      await pg.close();
    }
  });

  it('1. Database check constraint enforces startDate < endDate on academic_terms', async () => {
    // Valid dates insert succeeds
    const term = await termRepo.create({
      name: 'Spring 2026',
      startDate: '2026-02-01',
      endDate: '2026-06-30',
      status: 'PLANNED',
    });
    assert.ok(term.id);
    assert.equal(term.name, 'Spring 2026');

    // Invalid dates insert (startDate > endDate) must be rejected by check constraint
    await assert.rejects(
      async () => {
        await db.insert(academicTerms).values({
          name: 'Invalid Term',
          startDate: '2026-08-01',
          endDate: '2026-02-01',
          status: 'PLANNED',
        });
      },
      (err: any) => {
        return (
          err?.cause?.code === '23514' ||
          err?.cause?.constraint === 'academic_terms_dates_check' ||
          /academic_terms_dates_check/i.test(err?.message || '') ||
          /check constraint/i.test(err?.cause?.message || '')
        );
      },
    );
  });

  it('2. AcademicTermRepository supports search, filtering, and pagination', async () => {
    await termRepo.create({
      name: 'Summer 2026',
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      status: 'PLANNED',
    });

    const list = await termRepo.findAll({ search: 'Summer' });
    assert.equal(list.total, 1);
    assert.equal(list.items[0].name, 'Summer 2026');

    const all = await termRepo.findAll({ page: 1, pageSize: 10 });
    assert.ok(all.total >= 2);
  });

  it('3. Book ordering and sequence progression work properly', async () => {
    const book1 = await bookRepo.createBook({
      name: 'Starter Book',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    });

    const book2 = await bookRepo.createBook({
      name: 'Intermediate Book',
      level: 'B1',
      sequenceOrder: 2,
      sessionCount: 24,
      isTerminal: false,
      isActive: true,
    });

    const book3 = await bookRepo.createBook({
      name: 'Advanced Book',
      level: 'C1',
      sequenceOrder: 3,
      sessionCount: 30,
      isTerminal: true,
      isActive: true,
    });

    // Progression from book1 should find book2
    const nextOf1 = await bookRepo.findNextBookBySequence(book1.sequenceOrder);
    assert.ok(nextOf1);
    assert.equal(nextOf1.id, book2.id);

    // Progression from book2 should find book3
    const nextOf2 = await bookRepo.findNextBookBySequence(book2.sequenceOrder);
    assert.ok(nextOf2);
    assert.equal(nextOf2.id, book3.id);

    // Progression from book3 (highest) has no next book
    const nextOf3 = await bookRepo.findNextBookBySequence(book3.sequenceOrder);
    assert.equal(nextOf3, null);
  });

  it('4. Book hierarchy Book -> BookPart -> BookSegment can be created and queried', async () => {
    const book = await bookRepo.createBook({
      name: 'Grammar Course',
      level: 'A2',
      sequenceOrder: 10,
      sessionCount: 16,
      isTerminal: false,
      isActive: true,
    });

    const part1 = await bookRepo.createPart({
      bookId: book.id,
      name: 'Part 1: Tenses',
      sequenceOrder: 1,
    });

    const part2 = await bookRepo.createPart({
      bookId: book.id,
      name: 'Part 2: Modals',
      sequenceOrder: 2,
    });

    const segment1 = await bookRepo.createSegment({
      bookPartId: part1.id,
      name: 'Unit 1: Present Simple',
      sequenceOrder: 1,
    });

    const segment2 = await bookRepo.createSegment({
      bookPartId: part1.id,
      name: 'Unit 2: Present Continuous',
      sequenceOrder: 2,
    });

    const parts = await bookRepo.findPartsByBookId(book.id);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].name, 'Part 1: Tenses');

    const segments = await bookRepo.findSegmentsByPartId(part1.id);
    assert.equal(segments.length, 2);
    assert.equal(segments[0].name, 'Unit 1: Present Simple');

    // Hierarchy tracing: segment -> part -> book
    const hierarchy = await bookRepo.findSegmentHierarchy(segment1.id);
    assert.ok(hierarchy);
    assert.equal(hierarchy.segment.id, segment1.id);
    assert.equal(hierarchy.part.id, part1.id);
    assert.equal(hierarchy.book.id, book.id);
  });

  it('5. Database unique constraint prevents duplicate sequenceOrder in BookPart for same Book', async () => {
    const book = await bookRepo.createBook({
      name: 'Phonics',
      level: 'Pre-A',
      sequenceOrder: 20,
      sessionCount: 12,
      isTerminal: false,
      isActive: true,
    });

    await bookRepo.createPart({
      bookId: book.id,
      name: 'Part A',
      sequenceOrder: 1,
    });

    // Duplicate sequenceOrder for the same book must be rejected
    await assert.rejects(async () => {
      await db.insert(bookParts).values({
        bookId: book.id,
        name: 'Part B duplicate order',
        sequenceOrder: 1,
      });
    }, /unique|duplicate/i);
  });

  it('6. Database unique constraint prevents duplicate sequenceOrder in BookSegment for same BookPart', async () => {
    const book = await bookRepo.createBook({
      name: 'Vocabulary',
      level: 'A1',
      sequenceOrder: 30,
      sessionCount: 10,
      isTerminal: false,
      isActive: true,
    });

    const part = await bookRepo.createPart({
      bookId: book.id,
      name: 'Module 1',
      sequenceOrder: 1,
    });

    await bookRepo.createSegment({
      bookPartId: part.id,
      name: 'Lesson 1',
      sequenceOrder: 1,
    });

    // Duplicate sequenceOrder for the same part must be rejected
    await assert.rejects(async () => {
      await db.insert(bookSegments).values({
        bookPartId: part.id,
        name: 'Lesson 2 duplicate order',
        sequenceOrder: 1,
      });
    }, /unique|duplicate/i);
  });

  it('7. Foreign key referential integrity protects against cascade deletion', async () => {
    const book = await bookRepo.createBook({
      name: 'Protected Book',
      level: 'B2',
      sequenceOrder: 40,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    });

    const part = await bookRepo.createPart({
      bookId: book.id,
      name: 'Module A',
      sequenceOrder: 1,
    });

    const segment = await bookRepo.createSegment({
      bookPartId: part.id,
      name: 'Chapter 1',
      sequenceOrder: 1,
    });

    // Deleting book with parts must be rejected (onDelete: 'restrict')
    await assert.rejects(
      async () => {
        await db.delete(books).where(eq(books.id, book.id));
      },
      (err: any) => {
        return (
          err?.cause?.code === '23503' ||
          /foreign key/i.test(err?.cause?.message || '') ||
          /foreign key/i.test(err?.message || '')
        );
      },
    );

    // Deleting part with segments must be rejected (onDelete: 'restrict')
    await assert.rejects(
      async () => {
        await db.delete(bookParts).where(eq(bookParts.id, part.id));
      },
      (err: any) => {
        return (
          err?.cause?.code === '23503' ||
          /foreign key/i.test(err?.cause?.message || '') ||
          /foreign key/i.test(err?.message || '')
        );
      },
    );
  });
});
