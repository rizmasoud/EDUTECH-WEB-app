/**
 * Migration 0011_syllabus_unique_per_book: one canonical Syllabus per Book.
 *
 * The migration must (a) refuse to run, changing nothing, when any Book already has more than one Syllabus,
 * naming the exact records, and (b) otherwise only add the unique index, leaving every Book, Part, Segment,
 * Syllabus and Syllabus Item row untouched. It never deletes, merges or reassigns legacy data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const dir = path.resolve(process.cwd(), 'apps/api/drizzle');
const MIGRATION = '0011_syllabus_unique_per_book.sql';

const sqlFiles = () =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/** A database at the schema that existed before this migration (every earlier migration applied). */
async function legacyDb(): Promise<PGlite> {
  const pg = new PGlite();
  const files = sqlFiles();
  assert.equal(files[files.length - 1] >= MIGRATION, true);
  for (const file of files.filter((f) => f < MIGRATION)) {
    await pg.exec(fs.readFileSync(path.join(dir, file), 'utf-8'));
  }
  return pg;
}

const runMigration = (pg: PGlite) => pg.exec(fs.readFileSync(path.join(dir, MIGRATION), 'utf-8'));

const ID = {
  bookA: '10000000-0000-4000-8000-000000000001',
  bookB: '10000000-0000-4000-8000-000000000002',
  bookC: '10000000-0000-4000-8000-000000000003',
  partA: '20000000-0000-4000-8000-000000000001',
  segA1: '30000000-0000-4000-8000-000000000001',
  segA2: '30000000-0000-4000-8000-000000000002',
  sylA1: '40000000-0000-4000-8000-000000000001',
  sylA2: '40000000-0000-4000-8000-000000000002',
  sylB: '40000000-0000-4000-8000-000000000003',
  item1: '50000000-0000-4000-8000-000000000001',
  item2: '50000000-0000-4000-8000-000000000002',
};

async function seedBooksPartsSegments(pg: PGlite) {
  await pg.exec(`
    INSERT INTO books (id, name, level, sequence_order, session_count) VALUES
      ('${ID.bookA}', 'Book A', 'A1', 1, 20),
      ('${ID.bookB}', 'Book B', 'A2', 2, 20),
      ('${ID.bookC}', 'Book C', 'B1', 3, 20);
    INSERT INTO book_parts (id, book_id, name, sequence_order) VALUES ('${ID.partA}', '${ID.bookA}', 'Part 1', 1);
    INSERT INTO book_segments (id, book_part_id, name, sequence_order) VALUES
      ('${ID.segA1}', '${ID.partA}', 'Unit 1', 1),
      ('${ID.segA2}', '${ID.partA}', 'Unit 2', 2);
  `);
}

async function snapshot(pg: PGlite) {
  const q = async (sql: string) => (await pg.query(sql)).rows;
  return {
    books: await q('SELECT * FROM books ORDER BY id'),
    parts: await q('SELECT * FROM book_parts ORDER BY id'),
    segments: await q('SELECT * FROM book_segments ORDER BY id'),
    syllabi: await q('SELECT * FROM syllabi ORDER BY id'),
    items: await q('SELECT * FROM syllabus_items ORDER BY id'),
  };
}

const indexExists = async (pg: PGlite) =>
  (await pg.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'syllabi_book_unique'`)).rows.length === 1;

describe('migration 0011: one Syllabus per Book', () => {
  it('is the last migration and only adds the unique index after the preflight', () => {
    const sql = fs.readFileSync(path.join(dir, MIGRATION), 'utf-8');
    assert.match(sql, /CREATE UNIQUE INDEX "syllabi_book_unique" ON "syllabi" USING btree \("book_id"\)/);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+(TABLE|COLUMN)\b|\bUPDATE\s+"?\w+"?\s+SET\b/i);
    assert.ok(sql.indexOf('RAISE EXCEPTION') < sql.indexOf('CREATE UNIQUE INDEX'), 'the preflight runs first');
  });

  it('aborts on duplicate legacy Syllabi, names the exact records, and changes nothing', async () => {
    const pg = await legacyDb();
    try {
      await seedBooksPartsSegments(pg);
      await pg.exec(`
        INSERT INTO syllabi (id, book_id, book_segment_id, created_at) VALUES
          ('${ID.sylA1}', '${ID.bookA}', '${ID.segA1}', '2026-01-01T00:00:00Z'),
          ('${ID.sylA2}', '${ID.bookA}', '${ID.segA2}', '2026-02-01T00:00:00Z'),
          ('${ID.sylB}', '${ID.bookB}', NULL, '2026-01-01T00:00:00Z');
        INSERT INTO syllabus_items (id, syllabus_id, type, title, required, sequence_order) VALUES
          ('${ID.item1}', '${ID.sylA1}', 'GRAMMAR', 'Item in first', true, 1),
          ('${ID.item2}', '${ID.sylA2}', 'FILM', 'Item in second', true, 1);
      `);
      const before = await snapshot(pg);

      await assert.rejects(
        () => runMigration(pg),
        (err: Error) => {
          assert.match(err.message, /Cannot enforce one Syllabus per Book/);
          assert.match(err.message, /No data was changed/);
          // exact affected Book, both Syllabi, their segment links and item counts
          assert.ok(err.message.includes(`book ${ID.bookA} (Book A)`));
          assert.ok(err.message.includes(`${ID.sylA1} segment=${ID.segA1} items=1`));
          assert.ok(err.message.includes(`${ID.sylA2} segment=${ID.segA2} items=1`));
          // unaffected Books are not reported
          assert.ok(!err.message.includes(ID.bookB));
          assert.ok(!err.message.includes(ID.sylB));
          return true;
        },
      );

      assert.equal(await indexExists(pg), false, 'no index was created');
      assert.deepEqual(await snapshot(pg), before, 'no row was deleted, merged, moved or rewritten');
    } finally {
      await pg.close();
    }
  });

  it('also reports a Book whose duplicates are a whole-book row and a segment row', async () => {
    const pg = await legacyDb();
    try {
      await seedBooksPartsSegments(pg);
      await pg.exec(`
        INSERT INTO syllabi (id, book_id, book_segment_id) VALUES
          ('${ID.sylA1}', '${ID.bookA}', NULL),
          ('${ID.sylA2}', '${ID.bookA}', '${ID.segA1}');
      `);
      await assert.rejects(() => runMigration(pg), (err: Error) => {
        assert.ok(err.message.includes(`${ID.sylA1} segment=none items=0`));
        assert.ok(err.message.includes(`${ID.sylA2} segment=${ID.segA1} items=0`));
        return true;
      });
      assert.equal(await indexExists(pg), false);
    } finally {
      await pg.close();
    }
  });

  it('applies cleanly when each Book has at most one Syllabus, leaving all data untouched', async () => {
    const pg = await legacyDb();
    try {
      await seedBooksPartsSegments(pg);
      await pg.exec(`
        INSERT INTO syllabi (id, book_id, book_segment_id) VALUES
          ('${ID.sylA1}', '${ID.bookA}', '${ID.segA1}'),
          ('${ID.sylB}', '${ID.bookB}', NULL);
        INSERT INTO syllabus_items (id, syllabus_id, type, title, required, sequence_order) VALUES
          ('${ID.item1}', '${ID.sylA1}', 'GRAMMAR', 'Kept', true, 1);
      `);
      const before = await snapshot(pg);

      await runMigration(pg);

      assert.equal(await indexExists(pg), true);
      assert.deepEqual(await snapshot(pg), before, 'legacy Syllabi (including the segment link), items, Parts and Segments are unchanged');
      // Book C has none; a Book with a Syllabus now rejects a second one at the database level.
      await pg.exec(`INSERT INTO syllabi (book_id) VALUES ('${ID.bookC}')`);
      await assert.rejects(() => pg.exec(`INSERT INTO syllabi (book_id) VALUES ('${ID.bookC}')`), /syllabi_book_unique|duplicate key/);
    } finally {
      await pg.close();
    }
  });

  it('applies on an empty database', async () => {
    const pg = await legacyDb();
    try {
      await runMigration(pg);
      assert.equal(await indexExists(pg), true);
    } finally {
      await pg.close();
    }
  });
});
