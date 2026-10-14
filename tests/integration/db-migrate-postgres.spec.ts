/**
 * Real-PostgreSQL integration test for db:migrate.
 *
 * SAFE BY CONSTRUCTION
 *  - Runs ONLY when EDUTECH_TEST_PG_ADMIN_URL is set (a dedicated variable for a DISPOSABLE server,
 *    e.g. the PostgreSQL service in CI). DATABASE_URL is read only to compare it with the admin URL
 *    (the test refuses to run if the two are identical); it is never used to open a connection.
 *  - The admin URL must point at a loopback host and is never printed.
 *  - Every scenario runs in a freshly created, uniquely named database that is dropped in `after`.
 *  - Without the variable the whole file is skipped.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { ADVISORY_LOCK_KEY, fingerprintHash, introspectSchema } from '../../scripts/lib/baseline';
import {
  MigrateRefusedError,
  planMigrate,
  postgresSessionOpener,
  runMigrations,
} from '../../scripts/lib/migrate-runner';
import { withPostgresReader } from '../../scripts/lib/migration-status';

const ADMIN_URL = process.env.EDUTECH_TEST_PG_ADMIN_URL?.trim();
const migrationsDir = path.resolve(__dirname, '../../apps/api/drizzle');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const repo = readMigrationFiles({ migrationsFolder: migrationsDir });
const TOTAL = repo.length;

function assertSafeAdminUrl(raw: string): URL {
  const u = new URL(raw);
  assert.ok(/^postgres(ql)?:$/.test(u.protocol), 'EDUTECH_TEST_PG_ADMIN_URL must be a postgres URL');
  assert.ok(LOOPBACK.has(u.hostname), 'EDUTECH_TEST_PG_ADMIN_URL must point at a loopback host (disposable server)');
  assert.notEqual(raw, process.env.DATABASE_URL?.trim(), 'refusing to run: the admin URL equals DATABASE_URL');
  assert.notEqual(process.env.NODE_ENV?.toLowerCase().trim(), 'production', 'refusing to run in production');
  return u;
}
function urlForDb(admin: URL, db: string): string {
  const u = new URL(admin.toString());
  u.pathname = `/${db}`;
  return u.toString();
}

const skipReason = ADMIN_URL
  ? undefined
  : 'EDUTECH_TEST_PG_ADMIN_URL is not set: real-PostgreSQL migrate integration test skipped (never falls back to DATABASE_URL)';

describe('db:migrate on a real PostgreSQL server (disposable databases only)', { skip: skipReason }, () => {
  let admin: URL;
  let adminSql: postgres.Sql | undefined;
  const created: string[] = [];
  const open: postgres.Sql[] = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-migrate-it-'));
  let counter = 0;

  const connect = (url: string) => {
    const c = postgres(url, { max: 1, onnotice: () => {} });
    open.push(c);
    return c;
  };
  async function newDatabase(name: string): Promise<string> {
    const dbName = `edutech_migrate_it_${name}_${randomBytes(4).toString('hex')}`;
    assert.match(dbName, /^[a-z0-9_]+$/);
    await (adminSql as postgres.Sql).unsafe(`CREATE DATABASE ${dbName}`);
    created.push(dbName);
    return urlForDb(admin, dbName);
  }
  function truncatedCopy(n: number): string {
    const d = path.join(scratch, `trunc-${n}-${counter++}`);
    fs.cpSync(migrationsDir, d, { recursive: true });
    const jp = path.join(d, 'meta', '_journal.json');
    const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
    const dropped = j.entries.slice(n);
    j.entries = j.entries.slice(0, n);
    fs.writeFileSync(jp, JSON.stringify(j, null, 2));
    for (const e of dropped) {
      fs.rmSync(path.join(d, `${e.tag}.sql`), { force: true });
      fs.rmSync(path.join(d, 'meta', `${String(e.idx).padStart(4, '0')}_snapshot.json`), { force: true });
    }
    return d;
  }
  function brokenCopy(idx: number): string {
    const d = path.join(scratch, `broken-${idx}-${counter++}`);
    fs.cpSync(migrationsDir, d, { recursive: true });
    const tag = JSON.parse(fs.readFileSync(path.join(d, 'meta', '_journal.json'), 'utf8')).entries[idx].tag;
    fs.writeFileSync(path.join(d, `${tag}.sql`), 'CREATE TABLE "zz_partial" ("id" integer);--> statement-breakpoint\nSELECT 1/0;');
    return d;
  }
  const history = async (url: string) => {
    const c = connect(url);
    const [t] = await c`select to_regclass('drizzle.__drizzle_migrations') is not null as p`;
    if (!t.p) return { table: false, rows: [] as { hash: string; created_at: string }[] };
    const rows = await c`select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id`;
    return { table: true, rows: Array.from(rows) as unknown as { hash: string; created_at: string }[] };
  };
  const publicTables = async (url: string) =>
    Array.from(
      await connect(url)`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
    ).map((r) => String(r.table_name));
  const fingerprint = async (url: string) => fingerprintHash(await withPostgresReader(url, (r) => introspectSchema(r)));
  const doMigrate = (url: string, lockTimeoutMs?: number, dir = migrationsDir) =>
    runMigrations(postgresSessionOpener(url, { lockTimeoutMs }), dir, { confirm: true });

  before(async () => {
    admin = assertSafeAdminUrl(ADMIN_URL as string);
    adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
    const [v] = await adminSql`show server_version`;
    console.log(`  real PostgreSQL server_version=${v.server_version} (connection details not logged)`);
  });

  after(async () => {
    for (const c of open) await c.end({ timeout: 2 }).catch(() => {});
    fs.rmSync(scratch, { recursive: true, force: true });
    if (!adminSql) return;
    const failures: string[] = [];
    for (const db of created) {
      try {
        await adminSql.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
      } catch (e) {
        failures.push(`${db}: ${(e as Error).message}`);
      }
    }
    await adminSql.end({ timeout: 2 }).catch(() => {});
    if (failures.length) throw new Error(`could not drop temporary database(s): ${failures.join('; ')}`);
  });

  it('dry run is read-only; confirmed run applies all migrations with repository hashes; second run is a no-op', async () => {
    const url = await newDatabase('empty');
    const p = await withPostgresReader(url, (r) => planMigrate(r, migrationsDir));
    assert.equal(p.ok, true);
    assert.equal(p.pending.length, TOTAL);
    assert.deepEqual(await history(url), { table: false, rows: [] });
    assert.deepEqual(await publicTables(url), []);

    const r = await doMigrate(url);
    assert.equal(r.applied.length, TOTAL);
    const h = await history(url);
    assert.deepEqual(h.rows.map((x) => x.hash), repo.map((m) => m.hash));
    assert.deepEqual(h.rows.map((x) => Number(x.created_at)), repo.map((m) => m.folderMillis));

    // Same schema as the installed migrator produces directly (independent reference database).
    const ref = await newDatabase('ref');
    const rc = postgres(ref, { max: 1, onnotice: () => {} });
    open.push(rc);
    await migrate(drizzle(rc), { migrationsFolder: migrationsDir });
    assert.equal(await fingerprint(url), await fingerprint(ref));

    const again = await doMigrate(url);
    assert.equal(again.noop, true);
    assert.equal((await history(url)).rows.length, TOTAL);
  });

  it('without confirmation nothing is written', async () => {
    const url = await newDatabase('noconfirm');
    await assert.rejects(
      runMigrations(postgresSessionOpener(url), migrationsDir, { confirm: false }),
      MigrateRefusedError,
    );
    assert.deepEqual(await history(url), { table: false, rows: [] });
    assert.deepEqual(await publicTables(url), []);
  });

  it('partially migrated database: only pending migrations are applied, data and prior history preserved', async () => {
    const url = await newDatabase('partial');
    const c = connect(url);
    await migrate(drizzle(c), { migrationsFolder: truncatedCopy(8) });
    await c.unsafe(`insert into roles (name) values ('SUPERVISOR'), ('TEACHER')`);
    const before = (await history(url)).rows;
    assert.equal(before.length, 8);
    const r = await doMigrate(url);
    assert.equal(r.applied.length, TOTAL - 8);
    const after = (await history(url)).rows;
    assert.deepEqual(after.slice(0, 8), before);
    assert.equal(after.length, TOTAL);
    assert.deepEqual(Array.from(await c`select name from roles order by name`).map((x) => x.name), ['SUPERVISOR', 'TEACHER']);
  });

  it('two concurrent runners on separate connections apply the migrations exactly once', async () => {
    const url = await newDatabase('race');
    const results = await Promise.all([doMigrate(url, 60000), doMigrate(url, 60000), doMigrate(url, 60000)]);
    assert.equal(results.reduce((n, r) => n + r.applied.length, 0), TOTAL);
    assert.equal(results.filter((r) => !r.noop).length, 1);
    const h = await history(url);
    assert.equal(h.rows.length, TOTAL);
    assert.equal(new Set(h.rows.map((x) => x.hash)).size, TOTAL);
  });

  it('a failing migration leaves no partial history or application tables (empty database)', async () => {
    const url = await newDatabase('failempty');
    await assert.rejects(doMigrate(url, undefined, brokenCopy(3)));
    assert.equal((await history(url)).rows.length, 0);
    assert.deepEqual(await publicTables(url), []);
  });

  it('a failing migration keeps prior history on a partially migrated database', async () => {
    const url = await newDatabase('failpartial');
    await migrate(drizzle(connect(url)), { migrationsFolder: truncatedCopy(8) });
    const before = await history(url);
    const tablesBefore = await publicTables(url);
    await assert.rejects(doMigrate(url, undefined, brokenCopy(9)));
    assert.deepEqual(await history(url), before);
    assert.deepEqual(await publicTables(url), tablesBefore);
    // The advisory lock was released: a correct run now succeeds.
    assert.equal((await doMigrate(url)).applied.length, TOTAL - 8);
  });

  it('refuses an untracked existing schema and an unknown applied hash, changing nothing', async () => {
    const legacy = await newDatabase('legacy');
    const c = connect(legacy);
    for (const m of repo) for (const s of m.sql) await c.unsafe(s);
    const tables = await publicTables(legacy);
    await assert.rejects(doMigrate(legacy), (e: unknown) => e instanceof MigrateRefusedError && /baseline/.test((e as Error).message));
    assert.deepEqual(await publicTables(legacy), tables);
    assert.deepEqual(await history(legacy), { table: false, rows: [] });

    const foreign = await newDatabase('foreign');
    const fc = connect(foreign);
    await migrate(drizzle(fc), { migrationsFolder: truncatedCopy(5) });
    await fc.unsafe(`update drizzle.__drizzle_migrations set hash = 'deadbeef' where id = 2`);
    const before = await history(foreign);
    await assert.rejects(doMigrate(foreign), MigrateRefusedError);
    assert.deepEqual(await history(foreign), before);
  });

  it('a lock held by another connection makes the runner give up with nothing applied', async () => {
    const url = await newDatabase('locked');
    const holder = connect(url);
    await holder`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
    try {
      await assert.rejects(
        doMigrate(url, 500),
        (e: unknown) => e instanceof MigrateRefusedError && /migration lock/.test((e as Error).message),
      );
    } finally {
      await holder`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
    assert.deepEqual(await history(url), { table: false, rows: [] });
    assert.deepEqual(await publicTables(url), []);
    assert.equal((await doMigrate(url)).applied.length, TOTAL);
  });
});
