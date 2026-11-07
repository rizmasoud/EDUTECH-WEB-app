/**
 * Migration 0011 (syllabus per Book Part) against legacy data.
 * Applies 0000-0010, inserts legacy rows, then runs 0011 by hand.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const dir = path.resolve(process.cwd(), 'apps/api/drizzle');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const migration0011 = files.find((f) => f.startsWith('0011_'))!;

async function legacyDb() {
  const pg = new PGlite();
  for (const f of files) {
    if (f === migration0011) break;
    await pg.exec(fs.readFileSync(path.join(dir, f), 'utf-8'));
  }
  return pg;
}
const run0011 = (pg: PGlite) => pg.exec(fs.readFileSync(path.join(dir, migration0011), 'utf-8'));

async function seedBooks(pg: PGlite) {
  const book = async (name: string, order: number) =>
    (await pg.query<{ id: string }>(
      `INSERT INTO books (name, level, sequence_order, session_count) VALUES ($1,'A1',$2,20) RETURNING id`,
      [name, order],
    )).rows[0].id;
  const multi = await book('Multi', 1);
  const single = await book('Single', 2);
  const part = (await pg.query<{ id: string }>(
    `INSERT INTO book_parts (book_id, name, sequence_order) VALUES ($1,'Part 1',1) RETURNING id`, [multi])).rows[0].id;
  const segment = (await pg.query<{ id: string }>(
    `INSERT INTO book_segments (book_part_id, name, sequence_order) VALUES ($1,'Unit 1',1) RETURNING id`, [part])).rows[0].id;
  return { multi, single, part, segment };
}

describe('migration 0011: syllabus per book part', () => {
  it('keeps legacy segment-scoped and whole-book syllabi untouched (no backfill, no deletion)', async () => {
    const pg = await legacyDb();
    const { multi, single, segment } = await seedBooks(pg);
    await pg.query(`INSERT INTO syllabi (book_id, book_segment_id) VALUES ($1,$2)`, [multi, segment]);
    await pg.query(`INSERT INTO syllabi (book_id) VALUES ($1)`, [single]);
    const before = (await pg.query(`SELECT id, book_id, book_segment_id FROM syllabi ORDER BY id`)).rows;

    await run0011(pg);

    const after = (await pg.query(`SELECT id, book_id, book_segment_id, book_part_id FROM syllabi ORDER BY id`)).rows as any[];
    assert.equal(after.length, 2);
    assert.deepEqual(after.map(({ book_part_id, ...r }) => r), before);
    assert.ok(after.every((r) => r.book_part_id === null), 'legacy rows are not rewritten');
    await pg.close();
  });

  it('aborts with an explicit message and changes nothing when a book has duplicate whole-book syllabi', async () => {
    const pg = await legacyDb();
    const { single } = await seedBooks(pg);
    await pg.query(`INSERT INTO syllabi (book_id) VALUES ($1), ($1)`, [single]);

    await assert.rejects(run0011(pg), /Migration 0011 aborted: duplicate whole-book syllabi.*no data was changed/s);

    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM syllabi`)).rows[0]['n' as never], 2);
    const col = await pg.query(`SELECT 1 FROM information_schema.columns WHERE table_name='syllabi' AND column_name='book_part_id'`);
    assert.equal(col.rows.length, 0, 'schema is not altered when the preflight fails');
    await pg.close();
  });

  it('after migrating, the database enforces the new constraints', async () => {
    const pg = await legacyDb();
    const { multi, single, part, segment } = await seedBooks(pg);
    await run0011(pg);
    await pg.query(`INSERT INTO syllabi (book_id, book_part_id) VALUES ($1,$2)`, [multi, part]);
    await assert.rejects(pg.query(`INSERT INTO syllabi (book_id, book_part_id) VALUES ($1,$2)`, [multi, part]), /unique/);
    await pg.query(`INSERT INTO syllabi (book_id) VALUES ($1)`, [single]);
    await assert.rejects(pg.query(`INSERT INTO syllabi (book_id) VALUES ($1)`, [single]), /unique/);
    await assert.rejects(
      pg.query(`INSERT INTO syllabi (book_id, book_part_id, book_segment_id) VALUES ($1,$2,$3)`, [multi, part, segment]),
      /syllabi_single_scope_check|check/,
    );
    await pg.close();
  });
});
