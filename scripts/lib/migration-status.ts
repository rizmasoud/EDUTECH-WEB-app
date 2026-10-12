/**
 * Read-only migration status inspection.
 *
 * Reports which repository migrations are applied / pending in a database
 * WITHOUT applying anything. Safety:
 *  - Only fixed SELECT statements are issued, each checked by `assertReadOnlySql`.
 *  - The reader runs inside a `READ ONLY` transaction (enforced by the server),
 *    which is always rolled back.
 *  - Nothing here creates the tracking table, runs DDL, or writes rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { PGlite } from '@electric-sql/pglite';

export interface SqlReader {
  select(sql: string): Promise<Record<string, unknown>[]>;
}

const READ_ONLY_RE = /^\s*(select|show)\b/i;

/** Allow only a single SELECT/SHOW statement. */
export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/;\s*$/, '');
  if (!READ_ONLY_RE.test(trimmed) || trimmed.includes(';')) {
    throw new Error(`Refusing to run non-read-only SQL in migration status: ${sql.slice(0, 60)}`);
  }
}

export type DatabaseState = 'empty' | 'tracked' | 'untracked-existing-schema';

export interface MigrationStatusItem {
  idx: number;
  tag: string;
  when: number;
  hash: string;
  status: 'applied' | 'pending';
}

export interface MigrationStatusReport {
  state: DatabaseState;
  trackingTablePresent: boolean;
  publicTableCount: number;
  appliedRows: number;
  lastAppliedCreatedAt: number | null;
  migrations: MigrationStatusItem[];
  appliedCount: number;
  pendingCount: number;
  /** Rows recorded in the database whose hash matches no repository migration. */
  unknownAppliedHashes: string[];
  /** Tags the installed Drizzle migrator would run next (its created_at skip rule). */
  migratorWouldApply: string[];
  problems: string[];
  /** True only when `drizzle migrate` can be expected to behave correctly. */
  safeToMigrate: boolean;
}

export async function inspectMigrations(
  reader: SqlReader,
  migrationsFolder: string,
): Promise<MigrationStatusReport> {
  const repo = readMigrationFiles({ migrationsFolder });
  const entries: { tag: string; idx: number }[] = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ).entries;

  const tableCountRows = await reader.select(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const publicTableCount = Number(tableCountRows[0]?.n ?? 0);

  const presentRows = await reader.select(
    `select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
  );
  const trackingTablePresent = Boolean(presentRows[0]?.present);

  const applied = trackingTablePresent
    ? await reader.select(`select id, hash, created_at from drizzle.__drizzle_migrations order by id`)
    : [];
  const appliedHashes = new Set(applied.map((r) => String(r.hash)));
  const createdAts = applied.map((r) => Number(r.created_at));
  const lastAppliedCreatedAt = createdAts.length ? Math.max(...createdAts) : null;

  const repoHashes = new Set(repo.map((m) => m.hash));
  const unknownAppliedHashes = [...appliedHashes].filter((h) => !repoHashes.has(h));

  const migrations: MigrationStatusItem[] = repo.map((m, i) => ({
    idx: entries[i].idx,
    tag: entries[i].tag,
    when: m.folderMillis,
    hash: m.hash,
    status: appliedHashes.has(m.hash) ? 'applied' : 'pending',
  }));

  // Mirrors the installed migrator: it only compares against the latest created_at.
  const wouldApply = migrations.filter(
    (m) => lastAppliedCreatedAt === null || lastAppliedCreatedAt < m.when,
  );

  const state: DatabaseState =
    applied.length > 0 ? 'tracked' : publicTableCount > 0 ? 'untracked-existing-schema' : 'empty';

  const problems: string[] = [];
  if (state === 'untracked-existing-schema') {
    problems.push(
      'The database has tables but no Drizzle migration history. Running the migrator would try to re-create them. ' +
        'A reviewed baseline is required first (not provided by this command).',
    );
  }
  if (unknownAppliedHashes.length > 0) {
    problems.push(
      `${unknownAppliedHashes.length} applied migration hash(es) match no repository migration (edited or foreign migration history).`,
    );
  }
  if (state === 'tracked') {
    const pendingTags = new Set(migrations.filter((m) => m.status === 'pending').map((m) => m.tag));
    const wouldTags = new Set(wouldApply.map((m) => m.tag));
    for (const t of pendingTags) {
      if (!wouldTags.has(t)) {
        problems.push(`${t} is pending but the Drizzle migrator would SKIP it (timestamp not newer than the last applied).`);
      }
    }
    for (const t of wouldTags) {
      if (!pendingTags.has(t)) {
        problems.push(`${t} is already applied but the Drizzle migrator would run it AGAIN.`);
      }
    }
  }

  return {
    state,
    trackingTablePresent,
    publicTableCount,
    appliedRows: applied.length,
    lastAppliedCreatedAt,
    migrations,
    appliedCount: migrations.filter((m) => m.status === 'applied').length,
    pendingCount: migrations.filter((m) => m.status === 'pending').length,
    unknownAppliedHashes,
    migratorWouldApply: wouldApply.map((m) => m.tag),
    problems,
    safeToMigrate: problems.length === 0,
  };
}

/** Run `fn` with a reader bound to a READ ONLY transaction on a PGlite instance; always rolled back. */
export async function withPGliteReader<T>(pg: PGlite, fn: (r: SqlReader) => Promise<T>): Promise<T> {
  await pg.exec('BEGIN TRANSACTION READ ONLY');
  try {
    return await fn({
      async select(sql) {
        assertReadOnlySql(sql);
        return (await pg.query<Record<string, unknown>>(sql)).rows;
      },
    });
  } finally {
    await pg.exec('ROLLBACK');
  }
}

/** Run `fn` with a reader bound to a READ ONLY transaction on a PostgreSQL connection; always rolled back. */
export async function withPostgresReader<T>(
  url: string,
  fn: (r: SqlReader) => Promise<T>,
): Promise<T> {
  const { default: postgres } = await import('postgres');
  const client = postgres(url, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
    connection: { default_transaction_read_only: true },
  });
  try {
    class Rollback extends Error {}
    let result!: T;
    try {
      await client.begin('read only', async (tx) => {
        result = await fn({
          async select(sql) {
            assertReadOnlySql(sql);
            return (await tx.unsafe(sql)) as unknown as Record<string, unknown>[];
          },
        });
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return result;
  } finally {
    await client.end({ timeout: 2 });
  }
}
