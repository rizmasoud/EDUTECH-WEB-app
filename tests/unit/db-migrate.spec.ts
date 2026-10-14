/**
 * Migration runner tests. Every database is a fresh in-memory PGlite instance; nothing here
 * opens `.pglite-storage` or any configured database. (Cross-process locking is covered by the
 * real-PostgreSQL integration test; PGlite is a single connection.)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  MigrateRefusedError,
  pgliteSessionOpener,
  planMigrate,
  postgresSessionOpener,
  runInLockedSession,
  runMigrations,
  type LockableClient,
  type MigrateSession,
  type MigrateSessionOpener,
} from '../../scripts/lib/migrate-runner';
import { withPGliteReader } from '../../scripts/lib/migration-status';
import { parseArgs } from '../../scripts/db-migrate';

const repoRoot = path.resolve(__dirname, '../..');
const realDir = path.join(repoRoot, 'apps/api/drizzle');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-migrate-test-'));
const TOTAL = readMigrationFiles({ migrationsFolder: realDir }).length;

function treeStamp(dir: string): string {
  if (!fs.existsSync(dir)) return 'absent';
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(`${path.relative(dir, p)}:${st.size}:${st.mtimeMs}`);
    }
  };
  walk(dir);
  return out.join('\n');
}
function contentHash(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else h.update(path.relative(dir, p)).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

const storageDir = path.join(repoRoot, '.pglite-storage');
let storageBefore: string;
let repoDirBefore: string;
before(() => {
  storageBefore = treeStamp(storageDir);
  repoDirBefore = contentHash(realDir);
});
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** Copy of the repository migrations, journal truncated to the first `n` entries (valid metadata). */
function truncatedCopy(n: number): string {
  const d = path.join(scratch, `trunc-${n}-${counter++}`);
  fs.cpSync(realDir, d, { recursive: true });
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
/** Full copy where migration `idx` has its SQL replaced by `sql`. */
function brokenCopy(idx: number, sql: string): string {
  const d = path.join(scratch, `broken-${idx}-${counter++}`);
  fs.cpSync(realDir, d, { recursive: true });
  const tag = JSON.parse(fs.readFileSync(path.join(d, 'meta', '_journal.json'), 'utf8')).entries[idx].tag;
  fs.writeFileSync(path.join(d, `${tag}.sql`), sql);
  return d;
}
const BAD_SQL = 'CREATE TABLE "zz_partial" ("id" integer);--> statement-breakpoint\nSELECT 1/0;';

async function rawReplay(pg: PGlite, count: number): Promise<void> {
  for (const m of readMigrationFiles({ migrationsFolder: realDir }).slice(0, count)) for (const s of m.sql) await pg.exec(s);
}
async function viaMigrator(pg: PGlite, dir: string): Promise<void> {
  await migrate(drizzle(pg), { migrationsFolder: dir });
}
const plan = (pg: PGlite, dir = realDir) => withPGliteReader(pg, (r) => planMigrate(r, dir));
const run = (pg: PGlite, dir = realDir, confirm = true) =>
  runMigrations(pgliteSessionOpener(pg), dir, { confirm });

async function dbState(pg: PGlite) {
  const tables = (
    await pg.query<{ n: string }>(
      `select table_schema || '.' || table_name as n from information_schema.tables where table_schema in ('public','drizzle') order by 1`,
    )
  ).rows.map((r) => r.n);
  const schemas = (await pg.query<{ n: string }>(`select nspname as n from pg_namespace where nspname = 'drizzle'`)).rows.length;
  const hasHist = tables.includes('drizzle.__drizzle_migrations');
  const rows = hasHist
    ? (await pg.query<{ hash: string; created_at: string }>('select hash, created_at::text from drizzle.__drizzle_migrations order by id')).rows
    : [];
  return { tables, schemas, rows };
}

describe('planMigrate (read-only)', () => {
  it('on an empty database lists every migration, in journal order, with repository hashes', async () => {
    const pg = new PGlite();
    const p = await plan(pg);
    assert.equal(p.ok, true);
    const repo = readMigrationFiles({ migrationsFolder: realDir });
    assert.deepEqual(p.pending.map((m) => m.hash), repo.map((m) => m.hash));
    assert.deepEqual(p.pending.map((m) => m.when), repo.map((m) => m.folderMillis));
    assert.equal(p.pending.length, TOTAL);
    assert.deepEqual(await dbState(pg), { tables: [], schemas: 0, rows: [] }, 'planning wrote nothing');
    await pg.close();
  });

  it('identifies exactly the pending migrations on a partially migrated database', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(7));
    const p = await plan(pg);
    assert.equal(p.ok, true);
    const tags = readMigrationFiles({ migrationsFolder: realDir }).length;
    assert.equal(p.pending.length, tags - 7);
    assert.equal(p.status?.appliedCount, 7);
    assert.deepEqual(p.pending.map((m) => m.tag), p.status?.migrations.slice(7).map((m) => m.tag));
    await pg.close();
  });

  it('respects existing history: fully migrated means nothing pending', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, realDir);
    const p = await plan(pg);
    assert.equal(p.ok, true);
    assert.equal(p.pending.length, 0);
    await pg.close();
  });
});

describe('runMigrations: confirmation', () => {
  it('without confirmation nothing is written (no schema, no tables, no history)', async () => {
    const pg = new PGlite();
    for (const confirm of [false, undefined, 'true', 1] as unknown[]) {
      await assert.rejects(
        runMigrations(pgliteSessionOpener(pg), realDir, { confirm } as never),
        (e: unknown) => e instanceof MigrateRefusedError && /confirmation/.test((e as Error).message),
      );
    }
    assert.deepEqual(await dbState(pg), { tables: [], schemas: 0, rows: [] });
    await pg.close();
  });

  it('with confirmation applies everything and records exactly the repository hashes and timestamps', async () => {
    const pg = new PGlite();
    const r = await run(pg);
    assert.equal(r.noop, false);
    assert.equal(r.applied.length, TOTAL);
    const repo = readMigrationFiles({ migrationsFolder: realDir });
    const s = await dbState(pg);
    assert.deepEqual(s.rows.map((x) => x.hash), repo.map((m) => m.hash));
    assert.deepEqual(s.rows.map((x) => Number(x.created_at)), repo.map((m) => m.folderMillis));
    assert.equal((await plan(pg)).pending.length, 0);
    await pg.close();
  });

  it('applies only the pending migrations on a partially migrated database and keeps application data', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(8));
    await pg.exec(`insert into roles (name) values ('SUPERVISOR'), ('TEACHER')`);
    const before = (await dbState(pg)).rows;
    assert.equal(before.length, 8);
    const r = await run(pg);
    assert.equal(r.applied.length, TOTAL - 8);
    const after = (await dbState(pg)).rows;
    assert.deepEqual(after.slice(0, 8), before, 'existing history rows are untouched');
    assert.equal(after.length, TOTAL);
    const roles = (await pg.query<{ name: string }>('select name from roles order by name')).rows.map((x) => x.name);
    assert.deepEqual(roles, ['SUPERVISOR', 'TEACHER']);
    await pg.close();
  });

  it('is a no-op when already up to date (history unchanged)', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, realDir);
    const before = await dbState(pg);
    const r = await run(pg);
    assert.equal(r.noop, true);
    assert.deepEqual(r.applied, []);
    assert.deepEqual(await dbState(pg), before);
    await pg.close();
  });
});

describe('runMigrations: refusals (nothing is changed)', () => {
  it('invalid repository metadata is refused for plan and apply', async () => {
    const d = truncatedCopy(TOTAL);
    const jp = path.join(d, 'meta', '_journal.json');
    const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
    j.entries[3].tag = '0003_does_not_exist';
    fs.writeFileSync(jp, JSON.stringify(j));
    const pg = new PGlite();
    const p = await plan(pg, d);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /metadata is invalid/);
    await assert.rejects(run(pg, d), MigrateRefusedError);
    assert.deepEqual(await dbState(pg), { tables: [], schemas: 0, rows: [] });
    await pg.close();
  });

  it('a database with tables but no history is refused and points at db:baseline', async () => {
    const pg = new PGlite();
    await rawReplay(pg, TOTAL);
    const before = await dbState(pg);
    await assert.rejects(run(pg), (e: unknown) => e instanceof MigrateRefusedError && /baseline/.test((e as Error).message));
    assert.deepEqual(await dbState(pg), before);
    await pg.close();
  });

  it('an applied hash unknown to the repository is refused', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(5));
    await pg.exec(`update drizzle.__drizzle_migrations set hash = 'deadbeef' where id = 3`);
    const before = await dbState(pg);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /match no repository migration/);
    await assert.rejects(run(pg), MigrateRefusedError);
    assert.deepEqual(await dbState(pg), before);
    await pg.close();
  });

  it('a history whose latest created_at is newer than a pending migration (migrator would skip it) is refused', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(5));
    await pg.exec(`update drizzle.__drizzle_migrations set created_at = created_at + 10000000000000 where id = 5`);
    const before = await dbState(pg);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /SKIP|do not match/);
    await assert.rejects(run(pg), MigrateRefusedError);
    assert.deepEqual(await dbState(pg), before);
    await pg.close();
  });

  it('applied migrations that are not a prefix of the journal are refused', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(6));
    const before = await dbState(pg);
    await pg.exec(`delete from drizzle.__drizzle_migrations where id = 2`);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /not a prefix|do not match/);
    await assert.rejects(run(pg), MigrateRefusedError);
    assert.equal((await dbState(pg)).rows.length, before.rows.length - 1, 'nothing re-added');
    await pg.close();
  });

  it('duplicate history rows are refused', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(4));
    await pg.exec(`insert into drizzle.__drizzle_migrations (hash, created_at) select hash, created_at from drizzle.__drizzle_migrations where id = 1`);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /duplicate/);
    await pg.close();
  });

  it('a tracking table with the wrong shape is refused', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(4));
    await pg.exec(`alter table drizzle.__drizzle_migrations add column extra text`);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /not what the Drizzle migrator expects/);
    await assert.rejects(run(pg), MigrateRefusedError);
    await pg.close();
  });
});

describe('runMigrations: failure and concurrency', () => {
  it('a failing migration on an empty database leaves no application tables and no history rows', async () => {
    const pg = new PGlite();
    await assert.rejects(run(pg, brokenCopy(3, BAD_SQL)));
    const s = await dbState(pg);
    assert.equal(s.rows.length, 0);
    assert.deepEqual(s.tables.filter((t) => t.startsWith('public.')), []);
    await pg.close();
  });

  it('a failing migration on a partially migrated database keeps prior history and applies none of the batch', async () => {
    const pg = new PGlite();
    await viaMigrator(pg, truncatedCopy(8));
    const before = await dbState(pg);
    await assert.rejects(run(pg, brokenCopy(9, BAD_SQL)));
    const after = await dbState(pg);
    assert.deepEqual(after, before);
    assert.ok(!after.tables.includes('public.zz_partial'));
    // The database is still usable: the real migrations apply afterwards.
    const r = await run(pg);
    assert.equal(r.applied.length, TOTAL - 8);
    await pg.close();
  });

  it('concurrent attempts cannot both apply the same migrations', async () => {
    const pg = new PGlite();
    const results = await Promise.all([run(pg), run(pg), run(pg)]);
    assert.equal(results.reduce((n, r) => n + r.applied.length, 0), TOTAL);
    assert.equal(results.filter((r) => !r.noop).length, 1);
    const s = await dbState(pg);
    assert.equal(s.rows.length, TOTAL);
    assert.equal(new Set(s.rows.map((r) => r.hash)).size, TOTAL);
    await pg.close();
  });
});

describe('malformed tracking table (refused before its columns are queried)', () => {
  it('a tracking table missing created_at is refused as malformed history, not a connection failure', async () => {
    const pg = new PGlite();
    await pg.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null)`);
    await pg.exec(`insert into drizzle.__drizzle_migrations (hash) values ('abc')`);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /Malformed migration history/);
    assert.match(p.refusals.join(' '), /columns are \(hash,id\)/);
    await assert.rejects(
      run(pg),
      (e: unknown) => e instanceof MigrateRefusedError && /Malformed migration history/.test((e as Error).message),
    );
    // Nothing repaired, recreated or modified.
    const cols = (await pg.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema='drizzle' and table_name='__drizzle_migrations' order by 1`)).rows.map((r) => r.c);
    assert.deepEqual(cols, ['hash', 'id']);
    assert.equal((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, 1);
    const pub = (await pg.query<{ n: string }>(`select table_name as n from information_schema.tables where table_schema = 'public'`)).rows;
    assert.deepEqual(pub, []);
    await pg.close();
  });

  it('a tracking table missing hash and created_at is refused the same way', async () => {
    const pg = new PGlite();
    await pg.exec(`create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key)`);
    const p = await plan(pg);
    assert.equal(p.ok, false);
    assert.match(p.refusals.join(' '), /Malformed migration history/);
    await assert.rejects(run(pg), MigrateRefusedError);
    await pg.close();
  });
});

describe('repository metadata is validated before any connection or lock', () => {
  function invalidMetadataDir(): string {
    const d = truncatedCopy(TOTAL);
    const jp = path.join(d, 'meta', '_journal.json');
    const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
    j.entries[2].tag = '0002_does_not_exist';
    fs.writeFileSync(jp, JSON.stringify(j));
    return d;
  }

  it('runMigrations rejects before the session opener is even called', async () => {
    let opened = 0;
    const open: MigrateSessionOpener = async () => {
      opened++;
      throw new Error('must not be opened');
    };
    await assert.rejects(
      runMigrations(open, invalidMetadataDir(), { confirm: true }),
      (e: unknown) => e instanceof MigrateRefusedError && /metadata is invalid/.test((e as Error).message),
    );
    assert.equal(opened, 0);
  });

  it('the PostgreSQL opener never dials: an unreachable URL still yields the metadata refusal', async () => {
    // 127.0.0.1:1 would give ECONNREFUSED if a connection (and thus a lock) were attempted.
    await assert.rejects(
      runMigrations(postgresSessionOpener('postgresql://u:p@127.0.0.1:1/x'), invalidMetadataDir(), { confirm: true }),
      (e: unknown) => e instanceof MigrateRefusedError && /metadata is invalid/.test((e as Error).message),
    );
  });

  it('confirmation is still checked first', async () => {
    await assert.rejects(
      runMigrations(postgresSessionOpener('postgresql://u:p@127.0.0.1:1/x'), invalidMetadataDir(), { confirm: false }),
      (e: unknown) => e instanceof MigrateRefusedError && /confirmation/.test((e as Error).message),
    );
  });
});

describe('runInLockedSession: cleanup never masks the original outcome', () => {
  function fakeClient(opts: { failUnlock?: boolean; failEnd?: boolean; failLock?: unknown } = {}) {
    const calls: string[] = [];
    const client: LockableClient = {
      async unsafe(sql) {
        if (/set_config\('lock_timeout', '0'/.test(sql)) calls.push('reset-timeout');
        else if (/set_config/.test(sql)) calls.push('set-timeout');
        else if (/pg_advisory_lock/.test(sql)) {
          calls.push('lock');
          if (opts.failLock) throw opts.failLock;
        } else if (/pg_advisory_unlock/.test(sql)) {
          calls.push('unlock');
          if (opts.failUnlock) throw new Error('unlock boom');
        }
        return [];
      },
      async end() {
        calls.push('end');
        if (opts.failEnd) throw new Error('end boom');
      },
    };
    return { client, calls };
  }
  const session = (): MigrateSession => ({ reader: { select: async () => [] }, migrate: async () => {} });

  it('success: lock, run, unlock, close - in that order', async () => {
    const { client, calls } = fakeClient();
    const warnings: string[] = [];
    const v = await runInLockedSession(client, session, async () => 42, { onWarning: (m) => warnings.push(m) });
    assert.equal(v, 42);
    assert.deepEqual(calls, ['set-timeout', 'lock', 'reset-timeout', 'unlock', 'end']);
    assert.deepEqual(warnings, []);
  });

  it('a migration error is preserved when unlock also fails; both diagnostics are kept; client still closed', async () => {
    const { client, calls } = fakeClient({ failUnlock: true });
    const warnings: string[] = [];
    const original = new Error('migration exploded');
    await assert.rejects(
      runInLockedSession(client, session, async () => { throw original; }, { onWarning: (m) => warnings.push(m) }),
      (e: unknown) => e === original && (e as { unlockError?: Error }).unlockError?.message === 'unlock boom',
    );
    assert.ok(calls.includes('unlock') && calls[calls.length - 1] === 'end');
    assert.match(warnings.join('\n'), /Advisory unlock failed \(unlock boom\).*migration exploded/);
  });

  it('a verification refusal (MigrateRefusedError) keeps its type when unlock fails', async () => {
    const { client } = fakeClient({ failUnlock: true });
    const original = new MigrateRefusedError('Post-migration verification failed: x');
    await assert.rejects(
      runInLockedSession(client, session, async () => { throw original; }),
      (e: unknown) => e === original && e instanceof MigrateRefusedError,
    );
  });

  it('a close failure does not mask the original error either', async () => {
    const { client, calls } = fakeClient({ failUnlock: true, failEnd: true });
    const warnings: string[] = [];
    const original = new Error('first failure');
    await assert.rejects(
      runInLockedSession(client, session, async () => { throw original; }, { onWarning: (m) => warnings.push(m) }),
      (e: unknown) => e === original,
    );
    assert.equal(calls[calls.length - 1], 'end');
    assert.match(warnings.join('\n'), /Closing the database connection failed: end boom/);
  });

  it('an unlock failure after a successful run is a warning, not a failure (the close releases the lock)', async () => {
    const { client, calls } = fakeClient({ failUnlock: true });
    const warnings: string[] = [];
    const v = await runInLockedSession(client, session, async () => 'done', { onWarning: (m) => warnings.push(m) });
    assert.equal(v, 'done');
    assert.equal(calls[calls.length - 1], 'end');
    assert.match(warnings.join('\n'), /Advisory unlock failed \(unlock boom\)/);
  });

  it('a frozen original error still propagates (diagnostics go to the warning)', async () => {
    const { client } = fakeClient({ failUnlock: true });
    const warnings: string[] = [];
    const original = Object.freeze(new Error('frozen failure'));
    await assert.rejects(
      runInLockedSession(client, session, async () => { throw original; }, { onWarning: (m) => warnings.push(m) }),
      (e: unknown) => e === original,
    );
    assert.match(warnings.join('\n'), /unlock boom/);
  });

  it('lock timeout: refused, nothing to unlock, client closed', async () => {
    const { client, calls } = fakeClient({ failLock: Object.assign(new Error('timeout'), { code: '55P03' }) });
    await assert.rejects(
      runInLockedSession(client, session, async () => 1, { lockTimeoutMs: 10 }),
      (e: unknown) => e instanceof MigrateRefusedError && /migration lock/.test((e as Error).message),
    );
    assert.ok(!calls.includes('unlock'));
    assert.equal(calls[calls.length - 1], 'end');
  });
});

describe('safety properties', () => {
  it('parseArgs accepts only --confirm-migrate and --json', () => {
    assert.deepEqual(parseArgs([]), { json: false, confirm: false });
    assert.deepEqual(parseArgs(['--json', '--confirm-migrate']), { json: true, confirm: true });
    assert.throws(() => parseArgs(['--pglite-dir', 'x']), /Unknown argument/);
    assert.throws(() => parseArgs(['--confirm-baseline']), /Unknown argument/);
  });

  it('the CLI exits 2 without an explicit PostgreSQL driver (no inference from DATABASE_URL, no PGlite fallback)', () => {
    const cli = (env: Record<string, string>, extra: string[] = []) =>
      spawnSync('pnpm', ['exec', 'tsx', '--tsconfig', 'apps/api/tsconfig.json', 'scripts/db-migrate.ts', ...extra], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env } as unknown as NodeJS.ProcessEnv,
      });
    for (const [env, extra] of [
      [{}, ['--confirm-migrate']],
      [{ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' }, ['--confirm-migrate']],
      [{ DATABASE_DRIVER: 'pglite' }, ['--confirm-migrate']],
      [{ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' }, []],
    ] as [Record<string, string>, string[]][]) {
      const r = cli(env, extra);
      assert.equal(r.status, 2, JSON.stringify(env));
      assert.match(r.stderr, /explicit PostgreSQL target|onfiguration/);
    }
    const bad = cli({}, ['--nope']);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Unknown argument/);
  });

  it('repository migrations and .pglite-storage are untouched by this test file', () => {
    assert.equal(contentHash(realDir), repoDirBefore);
    assert.equal(treeStamp(storageDir), storageBefore);
    const r = spawnSync('git', ['status', '--porcelain', '--', 'apps/api/drizzle', '.pglite-storage'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '');
  });
});
