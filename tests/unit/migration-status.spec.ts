/**
 * Read-only migration status. Every database here is a fresh in-memory PGlite instance.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  assertReadOnlySql,
  inspectMigrations,
  withPGliteReader,
} from '../../scripts/lib/migration-status';

const realDir = path.resolve(__dirname, '../../apps/api/drizzle');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-migstatus-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** Copy of the migrations folder whose journal keeps only the first `count` entries. */
function truncatedDir(count: number): string {
  const dir = path.join(scratch, `trunc-${count}`);
  fs.cpSync(realDir, dir, { recursive: true });
  const jp = path.join(dir, 'meta', '_journal.json');
  const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  j.entries = j.entries.slice(0, count);
  fs.writeFileSync(jp, JSON.stringify(j));
  return dir;
}

const inspect = (pg: PGlite, dir = realDir) => withPGliteReader(pg, (r) => inspectMigrations(r, dir));

async function snapshotCounts(pg: PGlite): Promise<string> {
  const t = await pg.query<{ t: string }>(
    `select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public','drizzle') order by 1`,
  );
  const m = (await pg.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as p`)).rows[0] as { p: boolean };
  let rows = 0;
  if (m.p) rows = ((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0]).n;
  return JSON.stringify({ tables: t.rows.map((r) => r.t), trackedRows: rows });
}

describe('assertReadOnlySql', () => {
  it('accepts a single SELECT/SHOW', () => {
    assertReadOnlySql('select 1');
    assertReadOnlySql('  SELECT 1;  ');
    assertReadOnlySql('show transaction_read_only');
  });
  it('rejects writes, DDL and multi-statements', () => {
    for (const s of ['insert into t values (1)', 'drop table t', 'create table t(a int)', 'select 1; drop table t', 'with x as (delete from t returning 1) select 1', 'update t set a=1']) {
      assert.throws(() => assertReadOnlySql(s), /non-read-only/, s);
    }
  });
});

describe('inspectMigrations', () => {
  it('empty database: everything pending, nothing created by the inspection', async () => {
    const pg = new PGlite();
    try {
      const before = await snapshotCounts(pg);
      const r = await inspect(pg);
      assert.equal(r.state, 'empty');
      assert.equal(r.trackingTablePresent, false);
      assert.equal(r.appliedCount, 0);
      assert.equal(r.pendingCount, 11);
      assert.equal(r.migratorWouldApply.length, 11);
      assert.deepEqual(r.problems, []);
      assert.equal(r.safeToMigrate, true);
      assert.equal(await snapshotCounts(pg), before, 'inspection must not change the database');
    } finally {
      await pg.close();
    }
  });

  it('fully migrated (real Drizzle migrator, in-memory): all applied, none pending', async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg), { migrationsFolder: realDir });
      const before = await snapshotCounts(pg);
      const r = await inspect(pg);
      assert.equal(r.state, 'tracked');
      assert.equal(r.appliedCount, 11);
      assert.equal(r.pendingCount, 0);
      assert.deepEqual(r.migratorWouldApply, []);
      assert.deepEqual(r.problems, []);
      assert.equal(await snapshotCounts(pg), before);
    } finally {
      await pg.close();
    }
  });

  it('partially migrated: reports exactly the remaining migrations, in order', async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg), { migrationsFolder: truncatedDir(6) });
      const r = await inspect(pg);
      assert.equal(r.state, 'tracked');
      assert.equal(r.appliedCount, 6);
      assert.deepEqual(
        r.migrations.filter((m) => m.status === 'pending').map((m) => m.tag),
        [
          '0006_class_sessions_unique',
          '0007_teacher_attendance_unique',
          '0008_payrolls_unique',
          '0009_class_color',
          '0010_class_name',
        ],
      );
      assert.deepEqual(r.migratorWouldApply, r.migrations.filter((m) => m.status === 'pending').map((m) => m.tag));
      assert.equal(r.safeToMigrate, true);
    } finally {
      await pg.close();
    }
  });

  it('schema present but no Drizzle history (raw replay): flagged, not safe to migrate', async () => {
    const pg = new PGlite();
    try {
      const files = fs.readdirSync(realDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) await pg.exec(fs.readFileSync(path.join(realDir, f), 'utf8'));
      const r = await inspect(pg);
      assert.equal(r.state, 'untracked-existing-schema');
      assert.equal(r.trackingTablePresent, false);
      assert.ok(r.publicTableCount > 0);
      assert.equal(r.safeToMigrate, false);
      assert.ok(r.problems.some((p) => /baseline/.test(p)));
    } finally {
      await pg.close();
    }
  });

  it('unknown applied hash is reported', async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg), { migrationsFolder: realDir });
      await pg.exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('deadbeef', 1)`);
      const r = await inspect(pg);
      assert.deepEqual(r.unknownAppliedHashes, ['deadbeef']);
      assert.equal(r.safeToMigrate, false);
    } finally {
      await pg.close();
    }
  });

  it('detects a pending migration the Drizzle migrator would silently skip', async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg), { migrationsFolder: truncatedDir(6) });
      // Simulate the historical hazard: an applied row with a timestamp newer than later migrations.
      await pg.exec(`update drizzle.__drizzle_migrations set created_at = ${Date.now() + 1_000_000} where id = (select max(id) from drizzle.__drizzle_migrations)`);
      const r = await inspect(pg);
      assert.equal(r.pendingCount, 5);
      assert.deepEqual(r.migratorWouldApply, []);
      assert.equal(r.safeToMigrate, false);
      assert.ok(r.problems.some((p) => /would SKIP/.test(p)));
    } finally {
      await pg.close();
    }
  });
});

describe('withPGliteReader', () => {
  it('runs inside a READ ONLY transaction and rolls back', async () => {
    const pg = new PGlite();
    try {
      const seen = await withPGliteReader(pg, async (r) => (await r.select('show transaction_read_only'))[0]);
      assert.deepEqual(seen, { transaction_read_only: 'on' });
      // transaction is closed afterwards: a normal write works again
      await pg.exec('create table after_reader (a int)');
    } finally {
      await pg.close();
    }
  });

  it('refuses writes through the reader even if the SQL guard were bypassed by the server', async () => {
    const pg = new PGlite();
    try {
      await assert.rejects(withPGliteReader(pg, async (r) => r.select('create table nope (a int)')), /non-read-only/);
      await assert.rejects(
        (async () => {
          await pg.exec('BEGIN TRANSACTION READ ONLY');
          try {
            await pg.exec('create table nope2 (a int)');
          } finally {
            await pg.exec('ROLLBACK');
          }
        })(),
        /read-only transaction/,
      );
    } finally {
      await pg.close();
    }
  });
});
