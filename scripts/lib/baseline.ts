/**
 * Baseline planning and (explicitly confirmed) baseline recording.
 *
 * A baseline is a CLAIM that an existing database already contains the schema of
 * the first N repository migrations. Evidence for the claim = the database's catalog
 * must be IDENTICAL to the catalog produced by replaying those N migrations in a
 * fresh in-memory PGlite (the repository's SQL is the only source of truth; no
 * snapshot is fabricated). Anything else -> refuse (fail closed).
 *
 *  - planBaseline(): strictly read-only (SELECTs through a SqlReader).
 *  - applyBaseline(): the ONLY writer. Requires `confirm: true`, runs in ONE
 *    transaction, takes an advisory lock, re-validates inside the transaction, and
 *    writes only drizzle.__drizzle_migrations (schema `drizzle`). It never touches
 *    application tables or data.
 *
 * Data is not verified: schema equivalence cannot prove data migrations ran.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { validateMetadata } from '../db-check';
import {
  assertReadOnlySql,
  inspectMigrations,
  type MigrationStatusReport,
  type SqlReader,
} from './migration-status';

/** Flat canonical catalog: key -> canonical value. */
export type Fingerprint = Record<string, string>;

const INTROSPECTION: { kind: string; sql: string; key: string[]; value: string[] }[] = [
  {
    kind: 'relation',
    sql: `select c.relname as name, c.relkind::text as kind
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f')`,
    key: ['name'],
    value: ['kind'],
  },
  {
    kind: 'column',
    sql: `select c.relname as rel, a.attname as col,
                 format_type(a.atttypid, a.atttypmod) as type,
                 a.attnotnull::text as notnull,
                 coalesce(pg_get_expr(d.adbin, d.adrelid), '') as def,
                 a.attidentity::text as identity, a.attgenerated::text as generated
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
            and a.attnum > 0 and not a.attisdropped`,
    key: ['rel', 'col'],
    value: ['type', 'notnull', 'def', 'identity', 'generated'],
  },
  {
    // PostgreSQL 18 stores NOT NULL as pg_constraint rows (contype 'n', generated names), 16/17 do not.
    // Nullability is compared once, version-independently, through pg_attribute.attnotnull in the
    // column query. Every other constraint kind (p, f, u, c, x, t) is still compared.
    kind: 'constraint',
    sql: `select c.relname as rel, k.conname as name, k.contype::text as type,
                 pg_get_constraintdef(k.oid) as def
          from pg_constraint k join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and k.contype <> 'n'`,
    key: ['rel', 'name'],
    value: ['type', 'def'],
  },
  {
    kind: 'index',
    sql: `select tablename as rel, indexname as name, indexdef as def
          from pg_indexes where schemaname = 'public'`,
    key: ['rel', 'name'],
    value: ['def'],
  },
  {
    kind: 'enum',
    sql: `select t.typname as name, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' group by t.typname`,
    key: ['name'],
    value: ['labels'],
  },
  {
    kind: 'trigger',
    sql: `select c.relname as rel, g.tgname as name, pg_get_triggerdef(g.oid) as def
          from pg_trigger g join pg_class c on c.oid = g.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and not g.tgisinternal`,
    key: ['rel', 'name'],
    value: ['def'],
  },
  {
    kind: 'function',
    sql: `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'`,
    key: ['name', 'args'],
    value: ['args'],
  },
];

export async function introspectSchema(reader: SqlReader): Promise<Fingerprint> {
  const out: Fingerprint = {};
  for (const q of INTROSPECTION) {
    const rows = await reader.select(q.sql);
    for (const r of rows) {
      const key = `${q.kind}|${q.key.map((k) => String(r[k])).join('|')}`;
      out[key] = q.value.map((v) => String(r[v] ?? '')).join('|');
    }
  }
  return out;
}

export function fingerprintHash(fp: Fingerprint): string {
  const canon = Object.keys(fp)
    .sort()
    .map((k) => `${k}=${fp[k]}`)
    .join('\n');
  return createHash('sha256').update(canon).digest('hex');
}

export interface Discrepancy {
  kind: 'missing-in-database' | 'unexpected-in-database' | 'different';
  key: string;
  expected?: string;
  actual?: string;
}

export function diffFingerprints(expected: Fingerprint, actual: Fingerprint): Discrepancy[] {
  const out: Discrepancy[] = [];
  for (const k of Object.keys(expected).sort()) {
    if (!(k in actual)) out.push({ kind: 'missing-in-database', key: k, expected: expected[k] });
    else if (actual[k] !== expected[k]) out.push({ kind: 'different', key: k, expected: expected[k], actual: actual[k] });
  }
  for (const k of Object.keys(actual).sort()) {
    if (!(k in expected)) out.push({ kind: 'unexpected-in-database', key: k, actual: actual[k] });
  }
  return out;
}

export interface ExpectedPrefix {
  /** Number of migrations applied (1..N). */
  count: number;
  tag: string;
  hash: string;
  when: number;
  schemaHash: string;
  fingerprint: Fingerprint;
}

/** Replay repository migrations one by one in a fresh in-memory PGlite and fingerprint after each. */
export async function buildExpectedPrefixes(migrationsDir: string): Promise<ExpectedPrefix[]> {
  const migrations = readMigrationFiles({ migrationsFolder: migrationsDir });
  const tags: string[] = (
    JSON.parse(fs.readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    }
  ).entries.map((e) => e.tag);
  const pg = new PGlite(); // in-memory, disposable
  try {
    await pg.waitReady;
    const reader: SqlReader = { select: async (sql) => (await pg.query<Record<string, unknown>>(sql)).rows };
    const out: ExpectedPrefix[] = [];
    for (let i = 0; i < migrations.length; i++) {
      for (const stmt of migrations[i].sql) await pg.exec(stmt);
      const fingerprint = await introspectSchema(reader);
      out.push({
        count: i + 1,
        tag: tags[i],
        hash: migrations[i].hash,
        when: migrations[i].folderMillis,
        schemaHash: fingerprintHash(fingerprint),
        fingerprint,
      });
    }
    return out;
  } finally {
    await pg.close();
  }
}

export interface BaselinePlan {
  ok: boolean;
  /** Reasons the baseline is refused (empty when ok). */
  refusals: string[];
  status: MigrationStatusReport | null;
  /** Prefix counts whose replayed schema is identical to the database. */
  matchingCounts: number[];
  /** Chosen number of migrations to record (0 when refused). */
  chosenCount: number;
  toRecord: { tag: string; hash: string; when: number }[];
  remainingPending: string[];
  databaseSchemaHash: string | null;
  /** Differences against the closest candidate when nothing matches. */
  discrepancies: Discrepancy[];
  closestCandidate: string | null;
}

export interface PlanOptions {
  /** Required when several prefixes produce an identical schema; must be one of them. */
  targetTag?: string;
}

const MAX_REPORTED_DISCREPANCIES = 50;

function refused(base: Partial<BaselinePlan>, ...refusals: string[]): BaselinePlan {
  return {
    ok: false,
    refusals: [...(base.refusals ?? []), ...refusals],
    status: base.status ?? null,
    matchingCounts: base.matchingCounts ?? [],
    chosenCount: 0,
    toRecord: [],
    remainingPending: [],
    databaseSchemaHash: base.databaseSchemaHash ?? null,
    discrepancies: base.discrepancies ?? [],
    closestCandidate: base.closestCandidate ?? null,
  };
}

/** Strictly read-only. */
export async function planBaseline(
  reader: SqlReader,
  migrationsDir: string,
  options: PlanOptions = {},
): Promise<BaselinePlan> {
  // 1. Repository migration metadata must be valid (never "repaired" here).
  const meta = validateMetadata(migrationsDir);
  if (meta.problems.length) {
    return refused({}, `Repository migration metadata is invalid: ${meta.problems.join('; ')}`);
  }

  // 2. Database state must be "tables but no history".
  const status = await inspectMigrations(reader, migrationsDir);
  if (status.state === 'empty') {
    return refused({ status }, 'The database is empty: there is nothing to baseline (apply migrations instead).');
  }
  if (status.state === 'tracked') {
    return refused(
      { status },
      'The database already has Drizzle migration history; baseline refuses to touch existing history.',
    );
  }
  if (status.unknownAppliedHashes.length) {
    return refused({ status }, 'Unknown applied migration hashes are present.');
  }

  // 3. Schema evidence.
  const prefixes = await buildExpectedPrefixes(migrationsDir);
  const actual = await introspectSchema(reader);
  const databaseSchemaHash = fingerprintHash(actual);
  const matching = prefixes.filter((p) => p.schemaHash === databaseSchemaHash);

  if (matching.length === 0) {
    // Report discrepancies against the closest candidate (fewest differences).
    let best: { p: ExpectedPrefix; d: Discrepancy[] } | null = null;
    for (const p of prefixes) {
      const d = diffFingerprints(p.fingerprint, actual);
      if (!best || d.length < best.d.length) best = { p, d };
    }
    return refused(
      {
        status,
        databaseSchemaHash,
        discrepancies: (best?.d ?? []).slice(0, MAX_REPORTED_DISCREPANCIES),
        closestCandidate: best?.p.tag ?? null,
      },
      `The database schema is not identical to the schema after any repository migration prefix (closest: ${best?.p.tag}, ${best?.d.length} difference(s)).`,
    );
  }

  let chosen: ExpectedPrefix;
  if (matching.length > 1) {
    const names = matching.map((m) => m.tag);
    if (!options.targetTag) {
      return refused(
        { status, databaseSchemaHash, matchingCounts: matching.map((m) => m.count) },
        `Ambiguous: the schema is identical after several migrations (${names.join(', ')}). Re-run with --target <tag> to choose explicitly.`,
      );
    }
    const found = matching.find((m) => m.tag === options.targetTag);
    if (!found) {
      return refused(
        { status, databaseSchemaHash, matchingCounts: matching.map((m) => m.count) },
        `--target ${options.targetTag} is not one of the matching migrations (${names.join(', ')}).`,
      );
    }
    chosen = found;
  } else {
    chosen = matching[0];
    if (options.targetTag && options.targetTag !== chosen.tag) {
      return refused(
        { status, databaseSchemaHash, matchingCounts: [chosen.count] },
        `--target ${options.targetTag} does not match the database schema (it matches ${chosen.tag}).`,
      );
    }
  }

  return {
    ok: true,
    refusals: [],
    status,
    matchingCounts: matching.map((m) => m.count),
    chosenCount: chosen.count,
    toRecord: prefixes.slice(0, chosen.count).map(({ tag, hash, when }) => ({ tag, hash, when })),
    remainingPending: prefixes.slice(chosen.count).map((p) => p.tag),
    databaseSchemaHash,
    discrepancies: [],
    closestCandidate: chosen.tag,
  };
}

// ---------------------------------------------------------------------------
// Confirmed write
// ---------------------------------------------------------------------------

export interface TxSql extends SqlReader {
  /** Fixed internal statements only (never user input). */
  execute(sql: string, params?: unknown[]): Promise<void>;
}

export interface BaselineExecutor {
  /** Run fn in ONE transaction: commit if it resolves, roll back if it throws. */
  transaction<T>(fn: (tx: TxSql) => Promise<T>): Promise<T>;
}

export class BaselineRefusedError extends Error {
  constructor(
    message: string,
    readonly plan?: BaselinePlan,
  ) {
    super(message);
    this.name = 'BaselineRefusedError';
  }
}

/**
 * Structural check of an EXISTING drizzle.__drizzle_migrations table against what the installed
 * Drizzle migrator creates: `id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint`.
 * Returns human-readable problems (empty = compatible). Read-only.
 */
export async function trackingTableShapeProblems(reader: SqlReader): Promise<string[]> {
  const problems: string[] = [];
  const rel = await reader.select(
    `select c.relkind::text as kind, c.relispartition::text as ispart, c.relhassubclass::text as hassub
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations'`,
  );
  if (rel.length !== 1 || rel[0].kind !== 'r' || rel[0].ispart !== 'false' || rel[0].hassub !== 'false') {
    problems.push('it is not a plain (non-partitioned, non-inherited) table');
  }

  const cols = await reader.select(
    `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull::text as notnull,
            coalesce(pg_get_expr(d.adbin, d.adrelid), '') as def, a.attidentity::text as identity,
            a.attgenerated::text as generated
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations'
        and a.attnum > 0 and not a.attisdropped
      order by a.attname`,
  );
  const byName = new Map(cols.map((c) => [String(c.name), c]));
  const names = [...byName.keys()].sort().join(',');
  if (names !== 'created_at,hash,id') problems.push(`columns are (${names}), expected (created_at,hash,id)`);
  const id = byName.get('id');
  const hash = byName.get('hash');
  const created = byName.get('created_at');
  if (id) {
    if (id.type !== 'integer') problems.push(`id has type ${id.type}, expected integer`);
    if (id.notnull !== 'true') problems.push('id must be NOT NULL');
    if (!/^nextval\('("?drizzle"?\.)?"?__drizzle_migrations_id_seq"?'::regclass\)$/.test(String(id.def))) {
      problems.push(`id default is "${id.def}", expected the serial sequence of this table`);
    }
    if (id.identity !== '' || id.generated !== '') problems.push('id must not be identity/generated');
  }
  if (hash) {
    if (hash.type !== 'text') problems.push(`hash has type ${hash.type}, expected text`);
    if (hash.notnull !== 'true') problems.push('hash must be NOT NULL');
    if (hash.def !== '' || hash.generated !== '') problems.push('hash must have no default/generation');
  }
  if (created) {
    if (created.type !== 'bigint') problems.push(`created_at has type ${created.type}, expected bigint`);
    if (created.def !== '' || created.generated !== '') problems.push('created_at must have no default/generation');
  }

  const pk = await reader.select(
    `select pg_get_constraintdef(k.oid) as def
       from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations' and k.contype = 'p'`,
  );
  if (pk.length !== 1 || String(pk[0].def) !== 'PRIMARY KEY (id)') problems.push('PRIMARY KEY (id) is missing');

  const trig = await reader.select(
    `select count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'drizzle' and c.relname = '__drizzle_migrations' and not g.tgisinternal`,
  );
  if (Number(trig[0]?.n ?? 0) !== 0) problems.push('it has user triggers');

  const rows = await reader.select('select count(*)::int as n from "drizzle"."__drizzle_migrations"');
  if (Number(rows[0]?.n ?? 0) !== 0) problems.push('it already contains rows');
  return problems;
}

/** Constant key so two baseline attempts can never run concurrently. */
const ADVISORY_LOCK_KEY = 7364201;

export interface ApplyOptions extends PlanOptions {
  /** Must be exactly `true`. */
  confirm: boolean;
}

export async function applyBaseline(
  executor: BaselineExecutor,
  migrationsDir: string,
  options: ApplyOptions,
): Promise<BaselinePlan> {
  if (options.confirm !== true) {
    throw new BaselineRefusedError('Refusing to write: explicit confirmation (--confirm-baseline) is required.');
  }
  return executor.transaction(async (tx) => {
    // Serialise baseline attempts; the lock is released automatically at commit/rollback.
    await tx.execute('select pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

    // Re-validate INSIDE the transaction, after the lock.
    const plan = await planBaseline(tx, migrationsDir, options);
    if (!plan.ok) throw new BaselineRefusedError(`Baseline refused: ${plan.refusals.join(' ')}`, plan);

    // An existing (empty) tracking table is acceptable only if its structure is exactly what the
    // installed Drizzle migrator creates. Validated BEFORE anything is inserted.
    const present = await tx.select(`select to_regclass('drizzle.__drizzle_migrations') is not null as present`);
    if (present[0]?.present) {
      const problems = await trackingTableShapeProblems(tx);
      if (problems.length) {
        throw new BaselineRefusedError(
          `Existing drizzle.__drizzle_migrations is not the expected table: ${problems.join('; ')}.`,
          plan,
        );
      }
    } else {
      // Same DDL as the installed Drizzle migrator, but WITHOUT "IF NOT EXISTS": a
      // concurrent creator makes this fail and roll back instead of being merged silently.
      await tx.execute('CREATE SCHEMA IF NOT EXISTS "drizzle"');
      await tx.execute(
        'CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
      );
    }

    for (const m of plan.toRecord) {
      // Exactly what the installed migrator records: sha256(file) and journal `when`.
      await tx.execute('insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values($1, $2)', [
        m.hash,
        m.when,
      ]);
    }

    // Verify the result with the same status logic, still inside the transaction.
    const after = await inspectMigrations(tx, migrationsDir);
    const expectedPending = plan.remainingPending;
    const pendingNow = after.migrations.filter((m) => m.status === 'pending').map((m) => m.tag);
    const okAfter =
      after.state === 'tracked' &&
      after.appliedCount === plan.chosenCount &&
      JSON.stringify(pendingNow) === JSON.stringify(expectedPending) &&
      JSON.stringify(after.migratorWouldApply) === JSON.stringify(expectedPending) &&
      after.problems.length === 0;
    if (!okAfter) {
      throw new BaselineRefusedError(
        `Post-write verification failed (state=${after.state}, applied=${after.appliedCount}); rolling back. ${after.problems.join(' ')}`,
        plan,
      );
    }
    return plan;
  });
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export function pgliteExecutor(pg: PGlite): BaselineExecutor {
  return {
    transaction: (fn) =>
      pg.transaction(async (t) =>
        fn({
          async select(sql) {
            assertReadOnlySql(sql);
            return (await t.query<Record<string, unknown>>(sql)).rows;
          },
          async execute(sql, params) {
            await t.query(sql, params as any[]);
          },
        }),
      ),
  };
}

export async function withPostgresBaselineExecutor<T>(
  url: string,
  fn: (executor: BaselineExecutor) => Promise<T>,
): Promise<T> {
  const { default: postgres } = await import('postgres');
  const client = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    return await fn({
      transaction: (inner) =>
        client.begin(async (tx) =>
          inner({
            async select(sql) {
                assertReadOnlySql(sql);
              return (await tx.unsafe(sql)) as unknown as Record<string, unknown>[];
            },
            async execute(sql, params) {
              await tx.unsafe(sql, params as any[]);
            },
          }),
        ) as Promise<any>,
    });
  } finally {
    await client.end({ timeout: 2 });
  }
}
