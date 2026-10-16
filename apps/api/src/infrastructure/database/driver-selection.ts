/**
 * Database selection: PostgreSQL is the only supported runtime database.
 *
 * Pure function of the environment: it never connects to anything. There is no fallback
 * engine; missing or unusable configuration fails with an actionable error.
 *
 * Required configuration (see .env.example and docs/migrations.md):
 *   DATABASE_URL=postgres(ql)://...      (required)
 *   DATABASE_DRIVER=postgres             (recommended; required by db:migrate / db:baseline)
 * PGlite (DATABASE_DRIVER=pglite, DATABASE_URL=pglite, USE_PGLITE=true) is rejected. It remains
 * only as an in-memory engine inside tests and the baseline tooling.
 */
export type DatabaseDriver = 'postgres';

export type DriverSource = 'DATABASE_DRIVER' | 'DATABASE_URL';

export interface DriverSelection {
  driver: DatabaseDriver;
  source: DriverSource;
  connectionString: string;
  warnings: string[];
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

type EnvLike = Record<string, string | undefined>;

const POSTGRES_URL_RE = /^postgres(ql)?:\/\//i;

export function isProductionEnv(env: EnvLike): boolean {
  return env.NODE_ENV?.toLowerCase().trim() === 'production';
}

export function isPostgresUrl(value: string): boolean {
  return POSTGRES_URL_RE.test(value);
}

/** Hide the password part of a connection string (or an error message containing one). */
export function maskConnectionString(value: string): string {
  return value.replace(/:\/\/([^:@/\s]+):([^@\s]+)@/g, '://$1:***@').replace(/:([^@/\s:]+)@/g, ':***@');
}

/** Strict boolean flag: only "true"/"false" (case-insensitive) or unset are accepted. */
export function parseBooleanFlag(name: string, value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new DatabaseConfigError(`${name} must be "true" or "false" (got "${value}")`);
}

const PGLITE_UNSUPPORTED =
  'PGlite is no longer a supported runtime database. Use PostgreSQL: copy .env.example to .env, ' +
  'run "docker compose up -d --wait postgres" (or point DATABASE_URL at your own server), ' +
  'then "pnpm db:migrate --confirm-migrate".';

export function resolveDatabaseDriver(env: EnvLike): DriverSelection {
  const warnings: string[] = [];

  const rawDriver = env.DATABASE_DRIVER?.trim().toLowerCase();
  const url = env.DATABASE_URL?.trim() || undefined;

  if (rawDriver === 'pglite' || url?.toLowerCase() === 'pglite' || parseBooleanFlag('USE_PGLITE', env.USE_PGLITE)) {
    throw new DatabaseConfigError(PGLITE_UNSUPPORTED);
  }
  if (rawDriver && rawDriver !== 'postgres') {
    throw new DatabaseConfigError(`DATABASE_DRIVER must be "postgres" (got "${env.DATABASE_DRIVER}")`);
  }
  if (!url) {
    throw new DatabaseConfigError(
      'DATABASE_URL is not set. PostgreSQL is required: copy .env.example to .env (it defines DATABASE_DRIVER=postgres ' +
        'and a local DATABASE_URL), start the database with "docker compose up -d --wait postgres", ' +
        'or export DATABASE_URL for your own PostgreSQL server.',
    );
  }
  if (!isPostgresUrl(url)) {
    throw new DatabaseConfigError('DATABASE_URL must be a postgres:// or postgresql:// URL.');
  }
  if (rawDriver === 'postgres') {
    return { driver: 'postgres', source: 'DATABASE_DRIVER', connectionString: url, warnings };
  }
  warnings.push('DATABASE_DRIVER is not set; using PostgreSQL from DATABASE_URL. Set DATABASE_DRIVER=postgres to make it explicit.');
  return { driver: 'postgres', source: 'DATABASE_URL', connectionString: url, warnings };
}
