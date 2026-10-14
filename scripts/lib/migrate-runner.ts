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

/**
 * Offline check (no database): returns refusal reasons when the repository's migration metadata is
 * invalid. Used BEFORE any connection is opened or any lock is taken.
 */
export function metadataRefusals(migrationsDir: string): string[] {
  const meta = validateMetadata(migrationsDir);
  return meta.problems.length ? [`Repository migration metadata is invalid: ${meta.problems.join('; ')}`] : [];
}

/** Read-only: can the pending migrations be applied safely, and which are they? */
export async function planMigrate(reader: SqlReader, migrationsDir: string): Promise<MigratePlan> {
  const metaRefusals = metadataRefusals(migrationsDir);
  if (metaRefusals.length) return refused(metaRefusals);

  // Validate the tracking table's structure BEFORE any query that assumes its columns exist
  // (inspectMigrations reads id/hash/created_at). A malformed table is refused, never repaired.
  const present = await reader.select(`select to_regclass('drizzle.__drizzle_migrations') is not null as present`);
  if (Boolean(present[0]?.present)) {
    const shape = await trackingTableShapeProblems(reader, { requireEmpty: false });
    if (shape.length) {
      return refused([
        `Malformed migration history: drizzle.__drizzle_migrations is not what the Drizzle migrator expects (${shape.join('; ')}). ` +
          'It is not repaired automatically; inspect and fix it manually, or restore from a backup.',
      ]);
    }
  }

  const status = await inspectMigrations(reader, migrationsDir);
  const refusals: string[] = [];

  if (status.state === 'untracked-existing-schema') {
    refusals.push(
      'The database has tables but no Drizzle migration history. Applying migrations would try to re-create them. ' +
        'Review and record a baseline first (pnpm db:baseline); the runner never baselines automatically.',
    );
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
  // Offline validation first: invalid metadata never opens a connection or takes the lock.
  const metaRefusals = metadataRefusals(migrationsDir);
  if (metaRefusals.length) {
    throw new MigrateRefusedError(`Migration refused: ${metaRefusals.join(' ')}`, {
      ok: false,
      refusals: metaRefusals,
      pending: [],
    });
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
  /** Receives non-fatal cleanup diagnostics (e.g. a failed advisory unlock). Defaults to ignoring them. */
  onWarning?: (message: string) => void;
}

/** The minimal client surface the locked session needs (postgres.js satisfies it). */
export interface LockableClient {
  unsafe(sql: string): Promise<unknown>;
  end(options?: { timeout?: number }): Promise<unknown>;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Holds the shared advisory lock on `client` (one connection) while `fn` runs, then releases it.
 * Cleanup never replaces the outcome of `fn`:
 *  - an unlock failure is reported through `onWarning` and, when `fn` failed, also attached to that
 *    original error as `unlockError`; the original error is the one that propagates;
 *  - the client is ALWAYS closed afterwards, which ends the session and releases any lock still held.
 */
export async function runInLockedSession<T>(
  client: LockableClient,
  buildSession: (client: LockableClient) => MigrateSession,
  fn: (session: MigrateSession) => Promise<T>,
  options: PostgresSessionOptions = {},
): Promise<T> {
  const lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? 30000));
  const warn = options.onWarning ?? (() => {});
  let locked = false;
  let failure: { error: unknown } | undefined;
  let value: T | undefined;
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
    value = await fn(buildSession(client));
  } catch (e) {
    failure = { error: e };
  }

  let unlockError: unknown;
  if (locked) {
    try {
      await client.unsafe(`select pg_advisory_unlock(${Number(ADVISORY_LOCK_KEY)})`);
    } catch (e) {
      unlockError = e;
    }
  }
  try {
    await client.end({ timeout: 2 });
  } catch (e) {
    warn(`Closing the database connection failed: ${errText(e)}`);
  }

  if (unlockError !== undefined) {
    warn(
      `Advisory unlock failed (${errText(unlockError)}); the lock is released when the connection closes.` +
        (failure ? ` The original error is reported: ${errText(failure.error)}` : ''),
    );
    if (failure && typeof failure.error === 'object' && failure.error !== null) {
      try {
        (failure.error as { unlockError?: unknown }).unlockError = unlockError;
      } catch {
        /* frozen error object: the warning above still carries the diagnostics */
      }
    }
  }
  if (failure) throw failure.error;
  return value as T;
}

/**
 * Real PostgreSQL. ONE dedicated connection (max: 1) holds a session-level advisory lock for the
 * whole run, so every statement, including the migrator's own transaction, executes under it.
 * The lock key is shared with `db:baseline`, so the two tools exclude each other.
 */
export function postgresSessionOpener(url: string, options: PostgresSessionOptions = {}): MigrateSessionOpener {
  return async (fn) => {
    const { default: postgres } = await import('postgres');
    const client = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
    return runInLockedSession(
      client as unknown as LockableClient,
      () => ({
        reader: {
          async select(sql) {
            assertReadOnlySql(sql);
            return (await client.unsafe(sql)) as unknown as Record<string, unknown>[];
          },
        },
        migrate: (dir) => migratePostgres(drizzlePostgres(client), { migrationsFolder: dir }),
      }),
      fn,
      options,
    );
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
