/**
 * PGlite bootstrap safety. Only in-memory databases and fresh temp directories are used;
 * never `.pglite-storage` and never a configured DATABASE_URL.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  MEMORY_DATA_DIR,
  openPGliteDatabase,
  readPGliteOptionsFromEnv,
  type PGliteBootstrapOptions,
} from '../../apps/api/src/infrastructure/database/pglite-bootstrap';
import { DatabaseConfigError } from '../../apps/api/src/infrastructure/database/driver-selection';

const migrationsDir = path.resolve(__dirname, '../../apps/api/drizzle');
const opts = (o: Partial<PGliteBootstrapOptions> = {}): PGliteBootstrapOptions => ({
  dataDir: MEMORY_DATA_DIR,
  autoMigrate: false,
  seedDemo: false,
  migrationsDir,
  ...o,
});

const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('readPGliteOptionsFromEnv', () => {
  it('defaults: .pglite-storage under cwd, nothing auto-applied or seeded', () => {
    const o = readPGliteOptionsFromEnv({}, '/work');
    assert.equal(o.dataDir, path.resolve('/work', '.pglite-storage'));
    assert.equal(o.autoMigrate, false);
    assert.equal(o.seedDemo, false);
    assert.equal(o.migrationsDir, path.resolve('/work', 'apps/api/drizzle'));
  });

  it('honours explicit flags and data dir', () => {
    const o = readPGliteOptionsFromEnv(
      { PGLITE_AUTO_MIGRATE: 'true', PGLITE_SEED_DEMO: 'true', PGLITE_DATA_DIR: 'memory' },
      '/work',
    );
    assert.deepEqual([o.autoMigrate, o.seedDemo, o.dataDir], [true, true, MEMORY_DATA_DIR]);
  });

  it('rejects malformed flags', () => {
    assert.throws(() => readPGliteOptionsFromEnv({ PGLITE_AUTO_MIGRATE: 'yes' }), DatabaseConfigError);
  });
});

describe('openPGliteDatabase', () => {
  it('empty database + no opt-in: fails clearly and applies nothing', async () => {
    await assert.rejects(openPGliteDatabase(opts()), /no schema[\s\S]*Nothing was applied or reset/);
  });

  it('autoMigrate creates the schema but does not seed', async () => {
    const { db, pg } = await openPGliteDatabase(opts({ autoMigrate: true }));
    try {
      const rows = await pg.query<{ n: number }>('select count(*)::int as n from accounts');
      assert.equal(rows.rows[0].n, 0);
      assert.ok(db);
    } finally {
      await pg.close();
    }
  });

  it('seeding happens only when requested', async () => {
    const { pg } = await openPGliteDatabase(opts({ autoMigrate: true, seedDemo: true }));
    try {
      const rows = await pg.query<{ n: number }>('select count(*)::int as n from accounts');
      assert.equal(rows.rows[0].n, 2);
    } finally {
      await pg.close();
    }
  });

  it('a failing schema check never deletes or resets existing storage', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-pglite-test-')), 'data');
    tmpDirs.push(path.dirname(dir));

    const seedPg = new PGlite(dir);
    await seedPg.waitReady;
    await seedPg.exec(`create table keepme (v text); insert into keepme values ('precious');`);
    await seedPg.close();

    // No "accounts" table -> the readiness check fails. The old code reset storage here.
    await assert.rejects(openPGliteDatabase(opts({ dataDir: dir })), /no schema/);
    assert.ok(fs.existsSync(dir), 'storage directory must still exist');

    const again = new PGlite(dir);
    await again.waitReady;
    const rows = await again.query<{ v: string }>('select v from keepme');
    assert.deepEqual(rows.rows, [{ v: 'precious' }]);
    await again.close();
  });

  it('autoMigrate with a missing migrations directory fails instead of continuing', async () => {
    await assert.rejects(
      openPGliteDatabase(opts({ autoMigrate: true, migrationsDir: path.join(os.tmpdir(), 'does-not-exist-edutech') })),
      /migrations directory not found/,
    );
  });
});
