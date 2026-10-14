/**
 * Explicit, controlled application of PENDING repository migrations.
 *
 *  - planMigrate(): strictly read-only (SELECTs through a SqlReader). Decides whether the
 *    installed Drizzle migrator can be trusted to apply the pending migrations and lists them.
 *  - runMigrations(): the ONLY writer. Requires `confirm: true`, runs inside an exclusive
 *    session (database-level advisory lock), re-validates after taking the lock, delegates the
 *    actual work to the INSTALLED Drizzle migrator (repository SQL + journal, nothing invented),
 *    then verifies the outcome with the same status logic.
 *
 * It never baselines, never repairs history, never edits repository files and is never called
 * from application startup. Unsafe or ambiguous states are refused (fail closed).
 */
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import type { PGlite } from '@electric-sql/pglite';
import { validateMetadata } from '../db-check';
import { ADVISORY_LOCK_KEY, trackingTableShapeProblems } from './baseline';
import {
  assertReadOnlySql,
  inspectMigrations,
  type MigrationStatusReport,
  type SqlReader,
} from './migration-status';

export interface PendingMigration {
  tag: string;
  hash: string;
  when: number;
}

export interface MigratePlan {
  ok: boolean;
  /** Reasons the runner refuses to apply anything (empty when ok). */
  refusals: string[];
  status?: MigrationStatusReport;
  /** Migrations the runner would apply, in journal order. */
  pending: PendingMigration[];
}

export class MigrateRefusedError extends Error {
  constructor(
    message: string,
    public readonly plan?: MigratePlan,
  ) {
    super(message);
    this.name = 'MigrateRefusedError';
  }
}

function refused(refusals: string[], status?: MigrationStatusReport): MigratePlan {
  return { ok: false, refusals, status, pending: [] };
}

/** Read-only: can the pending migrations be applied safely, and which are they? */
export async function planMigrate(reader: SqlReader, migrationsDir: string): Promise<MigratePlan> {
  const meta = validateMetadata(migrationsDir);
  if (meta.problems.length) {
    return refused([`Repository migration metadata is invalid: ${meta.problems.join('; ')}`]);
  }

  const status = await inspectMigrations(reader, migrationsDir);
  const refusals: string[] = [];

  if (status.state === 'untracked-existing-schema') {
    refusals.push(
      'The database has tables but no Drizzle migration history. Applying migrations would try to re-create them. ' +
        'Review and record a baseline first (pnpm db:baseline); the runner never baselines automatically.',
    );
  }

  if (status.trackingTablePresent) {
    const shape = await trackingTableShapeProblems(reader, { requireEmpty: false });
    if (shape.length) {
      refusals.push(`drizzle.__drizzle_migrations is not what the Drizzle migrator expects: ${shape.join('; ')}.`);
    }
  }

  if (status.unknownAppliedHashes.length > 0) {
    refusals.push(
      `${status.unknownAppliedHashes.length} applied migration hash(es) match no repository migration ` +
        '(edited or foreign history). History is never auto-repaired.',
    );
  }
  for (const p of status.problems) {
    // The untracked-schema and unknown-hash problems are reported above in runner wording.
    if (/no Drizzle migration history|match no repository migration/.test(p)) continue;
    refusals.push(p);
  }

  if (status.appliedRows !== status.appliedCount + status.unknownAppliedHashes.length) {
    refusals.push('drizzle.__drizzle_migrations contains duplicate rows for the same migration.');
  }

  const firstPending = status.migrations.findIndex((m) => m.status === 'pending');
  if (firstPending >= 0 && status.migrations.slice(firstPending).some((m) => m.status === 'applied')) {
    refusals.push(
      'Applied migrations are not a prefix of the repository journal (a later migration is recorded while an earlier one is not).',
    );
  }

  const pendingTags = status.migrations.filter((m) => m.status === 'pending').map((m) => m.tag);
  if (JSON.stringify(pendingTags) !== JSON.stringify(status.migratorWouldApply)) {
    const msg =
      'The migrations the Drizzle migrator would run do not match the pending migrations ' +
      `(pending: ${pendingTags.join(', ') || 'none'}; migrator would run: ${status.migratorWouldApply.join(', ') || 'none'}).`;
    if (!refusals.includes(msg)) refusals.push(msg);
  }

  if (refusals.length) return refused(refusals, status);
  return {
    ok: true,
    refusals: [],
    status,
    pending: status.migrations
      .filter((m) => m.status === 'pending')
      .map((m) => ({ tag: m.tag, hash: m.hash, when: m.when })),
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** An exclusive session: reads, plus the installed Drizzle migrator. */
export interface MigrateSession {
  reader: SqlReader;
  migrate(migrationsDir: string): Promise<void>;
}

export type MigrateSessionOpener = <T>(fn: (session: MigrateSession) => Promise<T>) => Promise<T>;

export interface MigrateOptions {
  /** Must be exactly `true`. */
  confirm: boolean;
}

export interface MigrateResult {
  plan: MigratePlan;
  /** Tags applied by this invocation (empty = nothing to do). */
  applied: string[];
  noop: boolean;
}

export async function runMigrations(
  open: MigrateSessionOpener,
  migrationsDir: string,
  options: MigrateOptions,
): Promise<MigrateResult> {
  if (options.confirm !== true) {
    throw new MigrateRefusedError('Refusing to migrate: explicit confirmation (--confirm-migrate) is required.');
  }
  return open(async (session) => {
    // The session already holds the exclusive lock: re-validate with fresh state.
    const plan = await planMigrate(session.reader, migrationsDir);
    if (!plan.ok) throw new MigrateRefusedError(`Migration refused: ${plan.refusals.join(' ')}`, plan);
    if (plan.pending.length === 0) return { plan, applied: [], noop: true };

    await session.migrate(migrationsDir);

    const after = await planMigrate(session.reader, migrationsDir);
    if (!after.ok || after.pending.length !== 0 || after.status?.state !== 'tracked') {
      throw new MigrateRefusedError(
        'Post-migration verification failed: ' +
          (after.ok ? `${after.pending.length} migration(s) still pending` : after.refusals.join(' ')) +
          ' The migrator may have committed; inspect with pnpm db:status.',
        after,
      );
    }
    return { plan, applied: plan.pending.map((m) => m.tag), noop: false };
  });
}

// ---------------------------------------------------------------------------
// Session openers
// ---------------------------------------------------------------------------

export interface PostgresSessionOptions {
  /** How long to wait for the exclusive lock before giving up (default 30000 ms). */
  lockTimeoutMs?: number;
}

/**
 * Real PostgreSQL. ONE dedicated connection (max: 1) holds a session-level advisory lock for the
 * whole run, so every statement, including the migrator's own transaction, executes under it.
 * The lock key is shared with `db:baseline`, so the two tools exclude each other.
 */
export function postgresSessionOpener(url: string, options: PostgresSessionOptions = {}): MigrateSessionOpener {
  const lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? 30000));
  return async (fn) => {
    const { default: postgres } = await import('postgres');
    const client = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
    let locked = false;
    try {
      await client.unsafe(`select set_config('lock_timeout', '${lockTimeoutMs}ms', false)`);
      try {
        await client.unsafe(`select pg_advisory_lock(${Number(ADVISORY_LOCK_KEY)})`);
      } catch (e) {
        if ((e as { code?: string }).code === '55P03') {
          throw new MigrateRefusedError(
            `Could not acquire the migration lock within ${lockTimeoutMs} ms: another migrate or baseline run is active. Nothing was applied.`,
          );
        }
        throw e;
      }
      locked = true;
      await client.unsafe(`select set_config('lock_timeout', '0', false)`);
      return await fn({
        reader: {
          async select(sql) {
            assertReadOnlySql(sql);
            return (await client.unsafe(sql)) as unknown as Record<string, unknown>[];
          },
        },
        migrate: (dir) => migratePostgres(drizzlePostgres(client), { migrationsFolder: dir }),
      });
    } finally {
      try {
        if (locked) await client.unsafe(`select pg_advisory_unlock(${Number(ADVISORY_LOCK_KEY)})`);
      } finally {
        await client.end({ timeout: 2 });
      }
    }
  };
}

const pgliteChains = new WeakMap<PGlite, Promise<unknown>>();

/**
 * In-memory/directory PGlite (used by unit tests). PGlite has a single connection, so exclusivity
 * is an in-process queue per instance; it does NOT demonstrate cross-process locking.
 */
export function pgliteSessionOpener(pg: PGlite): MigrateSessionOpener {
  return async (fn) => {
    const previous = pgliteChains.get(pg) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    pgliteChains.set(pg, previous.then(() => mine));
    await previous;
    try {
      return await fn({
        reader: {
          async select(sql) {
            assertReadOnlySql(sql);
            return (await pg.query<Record<string, unknown>>(sql)).rows;
          },
        },
        migrate: (dir) => migratePglite(drizzlePglite(pg), { migrationsFolder: dir }),
      });
    } finally {
      release();
    }
  };
}
