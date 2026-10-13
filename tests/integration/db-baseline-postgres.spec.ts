/**
 * Real-PostgreSQL integration test for db:baseline.
 *
 * SAFE BY CONSTRUCTION
 *  - Runs ONLY when EDUTECH_TEST_PG_ADMIN_URL is set (a dedicated variable for a DISPOSABLE server,
 *    e.g. the PostgreSQL service in CI). DATABASE_URL is never read or used; if the two are identical
 *    the test refuses to run.
 *  - The admin URL must point at a loopback host and is never printed.
 *  - Every scenario runs in a freshly created, uniquely named database that is dropped in `finally`.
 *    No pre-existing database on the server is connected to for anything but CREATE/DROP DATABASE.
 *  - Without the variable the whole file is skipped.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  applyBaseline,
  BaselineRefusedError,
  fingerprintHash,
  introspectSchema,
  planBaseline,
  withPostgresBaselineExecutor,
  type BaselineExecutor,
} from '../../scripts/lib/baseline';
import { inspectMigrations, withPostgresReader } from '../../scripts/lib/migration-status';

const ADMIN_URL = process.env.EDUTECH_TEST_PG_ADMIN_URL?.trim();
const migrationsDir = path.resolve(__dirname, '../../apps/api/drizzle');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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
  : 'EDUTECH_TEST_PG_ADMIN_URL is not set: real-PostgreSQL baseline integration test skipped (never falls back to DATABASE_URL)';

describe('db:baseline on a real PostgreSQL server (disposable databases only)', { skip: skipReason }, () => {
  let admin: URL;
  let adminSql: postgres.Sql;
  const created: string[] = [];
  const open: postgres.Sql[] = [];

  const connect = (url: string) => {
    const c = postgres(url, { max: 1, onnotice: () => {} });
    open.push(c);
    return c;
  };

  async function newDatabase(name: string): Promise<string> {
    const dbName = `edutech_baseline_it_${name}_${randomBytes(4).toString('hex')}`;
    assert.match(dbName, /^[a-z0-9_]+$/);
    await adminSql.unsafe(`CREATE DATABASE ${dbName}`);
    created.push(dbName);
    return urlForDb(admin, dbName);
  }

  /** Legacy-style database: repository SQL replayed statement by statement, NO Drizzle history. */
  async function legacyDatabase(name: string, count: number): Promise<string> {
    const url = await newDatabase(name);
    const c = connect(url);
    for (const m of readMigrationFiles({ migrationsFolder: migrationsDir }).slice(0, count)) {
      for (const stmt of m.sql) await c.unsafe(stmt);
    }
    if (count >= 1) await c.unsafe(`insert into roles (name) values ('SUPERVISOR'), ('TEACHER')`);
    return url;
  }

  const appFingerprint = async (url: string) =>
    fingerprintHash(await withPostgresReader(url, (r) => introspectSchema(r)));

  async function appData(url: string): Promise<string> {
    const c = connect(url);
    const tables = await c`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`;
    const parts: string[] = [];
    for (const t of tables) {
      const [row] = await c.unsafe(`select count(*)::int as n, md5(coalesce(string_agg(x::text, ',' order by x::text), '')) as h from "${t.table_name}" x`);
      parts.push(`${t.table_name}:${row.n}:${row.h}`);
    }
    return parts.join('|');
  }

  const history = async (url: string) => {
    const c = connect(url);
    const [t] = await c`select to_regclass('drizzle.__drizzle_migrations') is not null as p`;
    if (!t.p) return { table: false, rows: [] as { hash: string; created_at: string }[] };
    const rows = await c`select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id`;
    return { table: true, rows: Array.from(rows) as unknown as { hash: string; created_at: string }[] };
  };

  before(async () => {
    admin = assertSafeAdminUrl(ADMIN_URL as string);
    adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
    const [v] = await adminSql`show server_version`;
    console.log(`  real PostgreSQL server_version=${v.server_version} (connection details not logged)`);
  });

  after(async () => {
    for (const c of open) await c.end({ timeout: 2 }).catch(() => {});
    try {
      for (const db of created) await adminSql.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    } finally {
      await adminSql.end({ timeout: 2 });
    }
  });

  it('is a real PostgreSQL server (not PGlite)', async () => {
    const [v] = await adminSql`select version() as v`;
    assert.ok(!/pglite/i.test(String(v.v)));
    assert.match(String(v.v), /^PostgreSQL \d+/);
  });

  it('dry run accepts a legacy-style schema (PGlite-derived expectation == real server catalog) and changes nothing', async () => {
    const url = await legacyDatabase('dry', 11);
    const fpBefore = await appFingerprint(url);
    const dataBefore = await appData(url);

    const fp = await withPostgresReader(url, (r) => introspectSchema(r));
    assert.ok(
      !Object.entries(fp).some(([k, v]) => k.startsWith('constraint|') && v.startsWith('n|')),
      'NOT NULL (contype n) rows must not be fingerprinted',
    );

    const plan = await withPostgresReader(url, (r) => planBaseline(r, migrationsDir));
    assert.deepEqual(plan.refusals, []);
    assert.equal(plan.ok, true);
    assert.equal(plan.chosenCount, 11);
    assert.equal(plan.status?.state, 'untracked-existing-schema');

    assert.equal(await appFingerprint(url), fpBefore);
    assert.equal(await appData(url), dataBefore);
    assert.deepEqual(await history(url), { table: false, rows: [] }, 'dry run must not create the schema/table');
    const [s] = await connect(url)`select count(*)::int as n from pg_namespace where nspname = 'drizzle'`;
    assert.equal(s.n, 0);
  });

  it('the dry-run reader is a server-enforced READ ONLY transaction', async () => {
    const url = await legacyDatabase('ro', 11);
    const mode = await withPostgresReader(url, async (r) => (await r.select('show transaction_read_only'))[0]);
    assert.deepEqual(mode, { transaction_read_only: 'on' });
  });

  it('a structurally wrong tracking table is refused before any insert; schema and data unchanged', async () => {
    const url = await legacyDatabase('shape', 11);
    const c = connect(url);
    await c.unsafe('create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at text)');
    const fpBefore = await appFingerprint(url);
    const dataBefore = await appData(url);
    await assert.rejects(
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
      (e: unknown) => e instanceof BaselineRefusedError && /created_at has type text/.test((e as Error).message),
    );
    assert.deepEqual((await history(url)).rows, []);
    assert.equal(await appFingerprint(url), fpBefore);
    assert.equal(await appData(url), dataBefore);
  });

  it('refuses to write without explicit confirmation', async () => {
    const url = await legacyDatabase('noconfirm', 11);
    await assert.rejects(
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: false as unknown as true })),
      BaselineRefusedError,
    );
    assert.deepEqual(await history(url), { table: false, rows: [] });
  });

  it('an interruption mid-write rolls back: no schema, no table, no rows', async () => {
    const url = await legacyDatabase('crash', 11);
    let inserts = 0;
    await assert.rejects(
      withPostgresBaselineExecutor(url, (base) => {
        const flaky: BaselineExecutor = {
          transaction: (fn) =>
            base.transaction((tx) =>
              fn({
                select: tx.select.bind(tx),
                async execute(sql, params) {
                  if (/^insert into "drizzle"/.test(sql) && ++inserts === 4) throw new Error('simulated crash');
                  return tx.execute(sql, params);
                },
              }),
            ),
        };
        return applyBaseline(flaky, migrationsDir, { confirm: true });
      }),
      /simulated crash/,
    );
    assert.equal(inserts, 4);
    assert.deepEqual(await history(url), { table: false, rows: [] });
    const [s] = await connect(url)`select count(*)::int as n from pg_namespace where nspname = 'drizzle'`;
    assert.equal(s.n, 0, 'CREATE SCHEMA must have been rolled back too');
  });

  it('concurrent confirmed attempts on separate connections: exactly one writes, history is exact and not duplicated', async () => {
    const url = await legacyDatabase('race', 11);
    const fpBefore = await appFingerprint(url);
    const dataBefore = await appData(url);
    const expected = readMigrationFiles({ migrationsFolder: migrationsDir });

    const results = await Promise.allSettled([
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.status)));
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof BaselineRefusedError, String(rejected.reason));

    const h = await history(url);
    assert.equal(h.rows.length, 11);
    assert.deepEqual(h.rows.map((r) => r.hash), expected.map((m) => m.hash));
    assert.deepEqual(h.rows.map((r) => Number(r.created_at)), expected.map((m) => m.folderMillis));
    assert.equal(await appFingerprint(url), fpBefore, 'application schema unchanged');
    assert.equal(await appData(url), dataBefore, 'application data unchanged');

    // a later run is refused and adds nothing
    await assert.rejects(
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
      BaselineRefusedError,
    );
    assert.equal((await history(url)).rows.length, 11);

    // status agrees, and the REAL Drizzle migrator treats the baseline as complete history
    const status = await withPostgresReader(url, (r) => inspectMigrations(r, migrationsDir));
    assert.equal(status.state, 'tracked');
    assert.equal(status.appliedCount, 11);
    assert.equal(status.pendingCount, 0);
    assert.deepEqual(status.problems, []);
    const c = connect(url);
    await migrate(drizzle(c), { migrationsFolder: migrationsDir });
    assert.equal((await history(url)).rows.length, 11, 'real migrator must apply nothing');
    assert.equal(await appFingerprint(url), fpBefore);
    assert.equal(await appData(url), dataBefore);
  });

  it('partially migrated legacy database: baselined at its real state, real migrator applies only the rest', async () => {
    const url = await legacyDatabase('partial', 6);
    const plan = await withPostgresReader(url, (r) => planBaseline(r, migrationsDir));
    assert.equal(plan.ok, true, plan.refusals.join(';'));
    assert.equal(plan.chosenCount, 6);
    assert.equal(plan.remainingPending.length, 5);

    await withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true }));
    assert.equal((await history(url)).rows.length, 6);

    await migrate(drizzle(connect(url)), { migrationsFolder: migrationsDir });
    assert.equal((await history(url)).rows.length, 11);

    // end state equals a legacy database that had every migration replayed
    const full = await legacyDatabase('full', 11);
    assert.equal(await appFingerprint(url), await appFingerprint(full));
  });

  it('an incompatible schema is refused on a real server and nothing is written', async () => {
    const url = await legacyDatabase('bad', 11);
    await connect(url).unsafe('alter table classes alter column capacity drop not null');
    await assert.rejects(
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
      BaselineRefusedError,
    );
    assert.deepEqual(await history(url), { table: false, rows: [] });
  });

  it('an empty database is refused', async () => {
    const url = await newDatabase('empty');
    await assert.rejects(
      withPostgresBaselineExecutor(url, (ex) => applyBaseline(ex, migrationsDir, { confirm: true })),
      BaselineRefusedError,
    );
    assert.deepEqual(await history(url), { table: false, rows: [] });
  });
});
