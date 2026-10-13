/**
 * Baseline tooling tests. Every database is a fresh in-memory PGlite instance; nothing
 * here opens `.pglite-storage` or any configured database.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  applyBaseline,
  BaselineRefusedError,
  buildExpectedPrefixes,
  fingerprintHash,
  introspectSchema,
  pgliteExecutor,
  planBaseline,
  type BaselineExecutor,
} from '../../scripts/lib/baseline';
import { withPGliteReader } from '../../scripts/lib/migration-status';
import { parseArgs } from '../../scripts/db-baseline';

const repoRoot = path.resolve(__dirname, '../..');
const realDir = path.join(repoRoot, 'apps/api/drizzle');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-baseline-test-'));

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
const storageDir = path.join(repoRoot, '.pglite-storage');
let storageBefore: string;
before(() => {
  storageBefore = treeStamp(storageDir);
});
after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** Legacy-style initialisation: raw SQL, no Drizzle history. */
async function rawReplay(pg: PGlite, count: number, dir = realDir): Promise<void> {
  const ms = readMigrationFiles({ migrationsFolder: dir });
  for (const m of ms.slice(0, count)) for (const s of m.sql) await pg.exec(s);
}

const plan = (pg: PGlite, dir = realDir, opts = {}) => withPGliteReader(pg, (r) => planBaseline(r, dir, opts));

async function historyState(pg: PGlite) {
  const schemas = (await pg.query<{ n: string }>(`select nspname as n from pg_namespace where nspname = 'drizzle'`)).rows.length;
  const tbl = (await pg.query<{ p: boolean }>(`select to_regclass('drizzle.__drizzle_migrations') is not null as p`)).rows[0].p;
  const rows = tbl ? (await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n : 0;
  return { schemas, tbl, rows };
}

function copyMigrations(name: string): string {
  const d = path.join(scratch, name);
  fs.cpSync(realDir, d, { recursive: true });
  return d;
}

describe('expected schema derivation', () => {
  it('replays repository SQL into one distinct fingerprint per migration prefix', async () => {
    const prefixes = await buildExpectedPrefixes(realDir);
    assert.equal(prefixes.length, 11);
    const hashes = new Set(prefixes.map((p) => p.schemaHash));
    assert.equal(hashes.size, 11, 'every migration changes the schema, so each prefix is distinguishable');
    assert.deepEqual(prefixes.map((p) => p.count), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('dry run (planBaseline)', () => {
  it('compatible untracked schema: allowed, and the database is not changed at all', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const schemaBefore = fingerprintHash(await withPGliteReader(pg, introspectSchema));
      const p = await plan(pg);
      assert.equal(p.ok, true, p.refusals.join('; '));
      assert.equal(p.status?.state, 'untracked-existing-schema');
      assert.equal(p.chosenCount, 11);
      assert.equal(p.toRecord.length, 11);
      assert.deepEqual(p.remainingPending, []);
      assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 });
      assert.equal(fingerprintHash(await withPGliteReader(pg, introspectSchema)), schemaBefore);
    } finally {
      await pg.close();
    }
  });

  it('records exactly the migrator hashes and timestamps in the plan', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const p = await plan(pg);
      const ms = readMigrationFiles({ migrationsFolder: realDir });
      assert.deepEqual(p.toRecord.map((r) => [r.hash, r.when]), ms.map((m) => [m.hash, m.folderMillis]));
    } finally {
      await pg.close();
    }
  });

  it('detects a partially migrated legacy schema and leaves later migrations pending', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 6);
      const p = await plan(pg);
      assert.equal(p.ok, true, p.refusals.join('; '));
      assert.equal(p.chosenCount, 6);
      assert.equal(p.remainingPending.length, 5);
      assert.equal(p.remainingPending[0], '0006_class_sessions_unique');
    } finally {
      await pg.close();
    }
  });

  it('rejects an incompatible schema and reports the discrepancies', async () => {
    const cases: [string, string, RegExp][] = [
      ['missing column', 'alter table classes drop column color', /unexpected-in-database.*column\|classes\|name/], // closest candidate is the state before 0010
      ['extra column', 'alter table classes add column extra_col text', /unexpected-in-database.*column\|classes\|extra_col/],
      ['changed type', 'alter table classes alter column color type text', /different.*column\|classes\|color/],
      ['extra table', 'create table stray (id int)', /unexpected-in-database.*relation\|stray/],
      ['missing index', 'drop index classes_status_idx', /missing-in-database.*index\|classes\|classes_status_idx/],
      ['missing constraint', 'alter table classes drop constraint classes_capacity_check', /missing-in-database.*constraint\|classes\|classes_capacity_check/],
    ];
    for (const [name, ddl, re] of cases) {
      const pg = new PGlite();
      try {
        await rawReplay(pg, 11);
        await pg.exec(ddl);
        const p = await plan(pg);
        assert.equal(p.ok, false, name);
        assert.ok(p.discrepancies.length > 0, name);
        assert.ok(p.discrepancies.some((d) => re.test(`${d.kind} ${d.key}`)), `${name}: ${JSON.stringify(p.discrepancies)}`);
        assert.equal(p.chosenCount, 0);
        assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 }, name);
      } finally {
        await pg.close();
      }
    }
  });

  it('a schema that equals an EARLIER migration state is baselined at that state, not at the latest', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec('alter table classes drop column name'); // exactly the state before 0010
      const p = await plan(pg);
      assert.equal(p.ok, true, p.refusals.join('; '));
      assert.equal(p.chosenCount, 10);
      assert.deepEqual(p.remainingPending, ['0010_class_name']);
    } finally {
      await pg.close();
    }
  });

  it('rejects an empty database', async () => {
    const pg = new PGlite();
    try {
      const p = await plan(pg);
      assert.equal(p.ok, false);
      assert.match(p.refusals.join(' '), /empty/);
    } finally {
      await pg.close();
    }
  });

  it('rejects a database that already has migration history', async () => {
    const pg = new PGlite();
    try {
      await migrate(drizzle(pg), { migrationsFolder: realDir });
      const p = await plan(pg);
      assert.equal(p.ok, false);
      assert.match(p.refusals.join(' '), /already has Drizzle migration history/);
    } finally {
      await pg.close();
    }
  });

  it('rejects inconsistent repository metadata (never repairs it)', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const d = copyMigrations('bad-journal');
      const jp = path.join(d, 'meta', '_journal.json');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      j.entries[5].tag = '0005_fine_siren';
      fs.writeFileSync(jp, JSON.stringify(j));
      const before = fs.readFileSync(jp, 'utf8');
      const p = await plan(pg, d);
      assert.equal(p.ok, false);
      assert.match(p.refusals.join(' '), /metadata is invalid/);
      assert.equal(fs.readFileSync(jp, 'utf8'), before, 'metadata must not be modified');
    } finally {
      await pg.close();
    }
  });

  it('rejects when repository SQL no longer describes the database (edited migration)', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const d = copyMigrations('edited-sql');
      fs.appendFileSync(path.join(d, '0010_class_name.sql'), '\n--> statement-breakpoint\nALTER TABLE "classes" ADD COLUMN "zzz" text;');
      const p = await plan(pg, d);
      assert.equal(p.ok, false);
      assert.match(p.refusals.join(' '), /not identical/);
    } finally {
      await pg.close();
    }
  });
});

describe('ambiguity needs an explicit --target', () => {
  /** Repository copy with a schema-neutral 0011 migration, so prefixes 11 and 12 are identical. */
  function ambiguousDir(): string {
    const d = copyMigrations('ambiguous');
    fs.writeFileSync(path.join(d, '0011_data_only.sql'), 'SELECT 1;');
    const jp = path.join(d, 'meta', '_journal.json');
    const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
    j.entries.push({ idx: 11, version: '7', when: j.entries[10].when + 1000, tag: '0011_data_only', breakpoints: true });
    fs.writeFileSync(jp, JSON.stringify(j));
    const s10 = JSON.parse(fs.readFileSync(path.join(d, 'meta', '0010_snapshot.json'), 'utf8'));
    fs.writeFileSync(
      path.join(d, 'meta', '0011_snapshot.json'),
      JSON.stringify({ ...s10, id: '11111111-2222-3333-4444-555555555555', prevId: s10.id }),
    );
    return d;
  }

  it('refuses without --target and accepts only a matching one', async () => {
    const d = ambiguousDir();
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const none = await plan(pg, d);
      assert.equal(none.ok, false);
      assert.match(none.refusals.join(' '), /Ambiguous/);

      const t10 = await plan(pg, d, { targetTag: '0010_class_name' });
      assert.equal(t10.ok, true, t10.refusals.join('; '));
      assert.equal(t10.chosenCount, 11);
      assert.deepEqual(t10.remainingPending, ['0011_data_only']);

      const t11 = await plan(pg, d, { targetTag: '0011_data_only' });
      assert.equal(t11.chosenCount, 12);

      const bogus = await plan(pg, d, { targetTag: '0005_cynical_shiva' });
      assert.equal(bogus.ok, false);
      assert.match(bogus.refusals.join(' '), /not one of the matching/);
    } finally {
      await pg.close();
    }
  });

  it('a --target that contradicts an unambiguous match is refused', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const p = await plan(pg, realDir, { targetTag: '0003_quiet_deathstrike' });
      assert.equal(p.ok, false);
      assert.match(p.refusals.join(' '), /does not match the database schema/);
    } finally {
      await pg.close();
    }
  });
});

describe('confirmed baseline (isolated in-memory databases only)', () => {
  it('refuses to write without explicit confirmation and changes nothing', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      for (const confirm of [false, undefined, 'true', 1] as any[]) {
        await assert.rejects(
          applyBaseline(pgliteExecutor(pg), realDir, { confirm }),
          (e: unknown) => e instanceof BaselineRefusedError && /confirmation/.test((e as Error).message),
        );
      }
      assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 });
    } finally {
      await pg.close();
    }
  });

  it('records exact hashes/timestamps; the real Drizzle migrator then applies only the remainder', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 6);
      const appBefore = fingerprintHash(await withPGliteReader(pg, introspectSchema));
      const p = await applyBaseline(pgliteExecutor(pg), realDir, { confirm: true });
      assert.equal(p.chosenCount, 6);

      const rows = (await pg.query<{ hash: string; created_at: string }>('select hash, created_at from drizzle.__drizzle_migrations order by id')).rows;
      const ms = readMigrationFiles({ migrationsFolder: realDir });
      assert.deepEqual(rows.map((r) => [r.hash, Number(r.created_at)]), ms.slice(0, 6).map((m) => [m.hash, m.folderMillis]));
      assert.equal(fingerprintHash(await withPGliteReader(pg, introspectSchema)), appBefore, 'application schema untouched');

      // End-to-end proof with the installed migrator: only 0006..0010 run, result equals the full schema.
      await migrate(drizzle(pg), { migrationsFolder: realDir });
      const full = (await buildExpectedPrefixes(realDir)).at(-1)!;
      assert.equal(fingerprintHash(await withPGliteReader(pg, introspectSchema)), full.schemaHash);
      assert.equal((await historyState(pg)).rows, 11);
    } finally {
      await pg.close();
    }
  });

  it('does not touch application data', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec(`insert into roles (name) values ('SUPERVISOR')`);
      const before = (await pg.query('select * from roles')).rows;
      await applyBaseline(pgliteExecutor(pg), realDir, { confirm: true });
      assert.deepEqual((await pg.query('select * from roles')).rows, before);
    } finally {
      await pg.close();
    }
  });

  it('a second run is refused (existing history) and adds nothing', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await applyBaseline(pgliteExecutor(pg), realDir, { confirm: true });
      await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }), /already has Drizzle migration history/);
      assert.equal((await historyState(pg)).rows, 11);
    } finally {
      await pg.close();
    }
  });

  it('concurrent attempts: exactly one succeeds, history is not duplicated', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const ex = pgliteExecutor(pg);
      const results = await Promise.allSettled([
        applyBaseline(ex, realDir, { confirm: true }),
        applyBaseline(ex, realDir, { confirm: true }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      assert.equal((await historyState(pg)).rows, 11);
    } finally {
      await pg.close();
    }
  });

  it('an interruption mid-write leaves no tracking table and no partial history', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const base = pgliteExecutor(pg);
      let inserts = 0;
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
      await assert.rejects(applyBaseline(flaky, realDir, { confirm: true }), /simulated crash/);
      assert.equal(inserts, 4);
      assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 });
      // and the database can still be baselined cleanly afterwards
      await applyBaseline(base, realDir, { confirm: true });
      assert.equal((await historyState(pg)).rows, 11);
    } finally {
      await pg.close();
    }
  });

  it('refuses a confirmed write on an incompatible schema and writes nothing', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec('alter table classes drop column color');
      await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }), BaselineRefusedError);
      assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 });
    } finally {
      await pg.close();
    }
  });

  it('refuses a confirmed write on an empty database', async () => {
    const pg = new PGlite();
    try {
      await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }), /empty/);
      assert.deepEqual(await historyState(pg), { schemas: 0, tbl: false, rows: 0 });
    } finally {
      await pg.close();
    }
  });

  it('refuses when an existing empty tracking table has an unexpected shape', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec('create schema drizzle; create table drizzle.__drizzle_migrations (foo int)');
      await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }));
      assert.equal((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, 0);
    } finally {
      await pg.close();
    }
  });
});

describe('CLI guards and isolation', () => {
  it('parseArgs: confirmation is opt-in and unknown arguments are rejected', () => {
    assert.equal(parseArgs([]).confirm, false);
    assert.equal(parseArgs(['--confirm-baseline']).confirm, true);
    assert.throws(() => parseArgs(['--yes']), /Unknown argument/);
    assert.throws(() => parseArgs(['--pglite-dir']), /needs a path/);
  });

  it('without an explicit target the CLI exits 2 and never connects (legacy DATABASE_URL is not enough)', () => {
    const run = (env: Record<string, string>) =>
      spawnSync('pnpm', ['exec', 'tsx', '--tsconfig', 'apps/api/tsconfig.json', 'scripts/db-baseline.ts'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env } as unknown as NodeJS.ProcessEnv,
      });
    const a = run({});
    assert.equal(a.status, 2);
    assert.match(a.stderr, /explicit target/);
    const b = run({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' });
    assert.equal(b.status, 2);
    assert.match(b.stderr, /explicit target/);
    const c = spawnSync('pnpm', ['exec', 'tsx', '--tsconfig', 'apps/api/tsconfig.json', 'scripts/db-baseline.ts', '--pglite-dir', path.join(scratch, 'nope'), '--confirm-baseline'], {
      cwd: repoRoot, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } as unknown as NodeJS.ProcessEnv,
    });
    assert.equal(c.status, 2);
    assert.match(c.stderr, /does not exist/);
    assert.equal(fs.existsSync(path.join(scratch, 'nope')), false, 'directory must not be created');
  });

  it('the repository .pglite-storage was not opened or modified by this test file', () => {
    assert.equal(treeStamp(storageDir), storageBefore);
  });

  it('committed migration files and metadata are unchanged (git clean for drizzle dir)', () => {
    const r = spawnSync('git', ['status', '--porcelain', '--', 'apps/api/drizzle', '.pglite-storage'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '');
  });
});

describe('fingerprint: NOT NULL is version-independent, other constraints stay compared', () => {
  it('never contains PostgreSQL-18-style NOT NULL constraint rows, but still compares nullability', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const fp = await withPGliteReader(pg, (r) => introspectSchema(r));
      const types = new Set(
        Object.entries(fp)
          .filter(([k]) => k.startsWith('constraint|'))
          .map(([, v]) => v.split('|')[0]),
      );
      assert.ok(!types.has('n'), 'contype n must not be fingerprinted');
      for (const t of ['p', 'f', 'u', 'c']) assert.ok(types.has(t), `constraint type ${t} must still be fingerprinted`);
      // nullability is carried by the column entries
      assert.ok(Object.entries(fp).some(([k, v]) => k.startsWith('column|accounts|') && v.split('|')[1] === 'true'));
    } finally {
      await pg.close();
    }
  });

  it('a database lacking the PG18 NOT NULL rows (as on PostgreSQL 16/17) fingerprints identically', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      const withN = await withPGliteReader(pg, (r) => introspectSchema(r));
      // Simulate PG16/17 by removing every row the version difference could add or remove.
      const without = Object.fromEntries(Object.entries(withN).filter(([k, v]) => !(k.startsWith('constraint|') && v.startsWith('n|'))));
      assert.equal(fingerprintHash(without), fingerprintHash(withN));
    } finally {
      await pg.close();
    }
  });

  for (const [name, ddl] of [
    ['dropped NOT NULL', 'alter table classes alter column capacity drop not null'],
    ['dropped primary key', 'alter table class_sessions drop constraint class_sessions_pkey cascade'],
    ['dropped foreign key', 'alter table class_sessions drop constraint class_sessions_class_id_classes_id_fk'],
    ['dropped unique constraint', 'alter table class_sessions drop constraint class_sessions_class_schedule_date_unique'],
    ['extra exclusion constraint (contype x)', 'alter table classes add constraint probe_excl exclude using btree (capacity with =)'],
    ['weakened check constraint', 'alter table classes drop constraint classes_capacity_check; alter table classes add constraint classes_capacity_check check (capacity > 0)'],
  ] as const) {
    it(`still refuses: ${name}`, async () => {
      const pg = new PGlite();
      try {
        await rawReplay(pg, 11);
        await pg.exec(ddl);
        const p = await plan(pg);
        assert.equal(p.ok, false, name);
      } finally {
        await pg.close();
      }
    });
  }
});

describe('existing tracking table: structural validation before any insert', () => {
  const MIGRATOR_DDL = 'create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)';

  it('accepts a table identical to what the Drizzle migrator creates (and reuses it)', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec(MIGRATOR_DDL);
      // dry run and write agree: allowed, and the dry run leaves the empty table empty
      const dry = await plan(pg);
      assert.equal(dry.ok, true, dry.refusals.join(';'));
      assert.equal((await historyState(pg)).rows, 0);
      await applyBaseline(pgliteExecutor(pg), realDir, { confirm: true });
      assert.equal((await historyState(pg)).rows, 11);
    } finally {
      await pg.close();
    }
  });

  for (const [name, ddl, re] of [
    ['created_at text', 'create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at text)', /created_at has type text/],
    ['hash varchar', 'create table drizzle.__drizzle_migrations (id serial primary key, hash varchar(64) not null, created_at bigint)', /hash has type character varying/],
    ['hash nullable', 'create table drizzle.__drizzle_migrations (id serial primary key, hash text, created_at bigint)', /hash must be NOT NULL/],
    ['id bigint', 'create table drizzle.__drizzle_migrations (id bigserial primary key, hash text not null, created_at bigint)', /id has type bigint/],
    ['id without serial default', 'create table drizzle.__drizzle_migrations (id integer primary key, hash text not null, created_at bigint)', /id default/],
    ['no primary key', 'create table drizzle.__drizzle_migrations (id serial, hash text not null, created_at bigint)', /PRIMARY KEY/],
    ['extra column', 'create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint, extra int)', /columns are/],
    ['created_at with default', 'create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint default 0)', /created_at must have no default/],
    ['partitioned table', 'create table drizzle.__drizzle_migrations (id integer, hash text not null, created_at bigint) partition by range (id)', /plain/],
  ] as const) {
    it(`refuses before inserting: ${name}`, async () => {
      const pg = new PGlite();
      try {
        await rawReplay(pg, 11);
        await pg.exec(`create schema drizzle; ${ddl}`);
        const before = JSON.stringify((await introspectSchema_(pg)));
        // the DRY RUN must refuse too (same rules), without writing anything
        const dry = await plan(pg);
        assert.equal(dry.ok, false, `dry run must refuse: ${name}`);
        assert.match(dry.refusals.join(' '), re);
        assert.equal((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, 0);
        await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }), (e: unknown) => {
          assert.ok(e instanceof BaselineRefusedError);
          assert.match((e as Error).message, re);
          return true;
        });
        assert.equal((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, 0);
        assert.equal(JSON.stringify(await introspectSchema_(pg)), before, 'application schema unchanged');
      } finally {
        await pg.close();
      }
    });
  }

  it('refuses a table that already contains rows (existing history is never merged)', async () => {
    const pg = new PGlite();
    try {
      await rawReplay(pg, 11);
      await pg.exec(MIGRATOR_DDL);
      await pg.exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('abc', 1)`);
      assert.equal((await plan(pg)).ok, false, 'dry run refuses existing history');
      await assert.rejects(applyBaseline(pgliteExecutor(pg), realDir, { confirm: true }), BaselineRefusedError);
      assert.equal((await pg.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, 1);
    } finally {
      await pg.close();
    }
  });
});

const introspectSchema_ = (pg: PGlite) => withPGliteReader(pg, (r) => introspectSchema(r));
