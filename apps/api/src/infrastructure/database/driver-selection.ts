/**
 * Explicit database driver selection.
 *
 * Pure function of the environment: it never connects to anything and never
 * looks at whether a connection succeeds. The driver chosen here is the driver
 * used; a failed PostgreSQL connection must never change it.
 *
 * Supported configuration (see docs/migrations.md):
 *   DATABASE_DRIVER=postgres + DATABASE_URL=postgres(ql)://...   (explicit, preferred)
 *   DATABASE_DRIVER=pglite                                       (embedded, non-production only)
 * Legacy inference (kept for compatibility, reported as a warning):
 *   DATABASE_URL=postgres(ql)://...   -> postgres
 *   DATABASE_URL=pglite | USE_PGLITE=true -> pglite
 *   nothing configured, non-production   -> pglite
 */
export type DatabaseDriver = 'postgres' | 'pglite';

export type DriverSource =
  | 'DATABASE_DRIVER'
  | 'DATABASE_URL'
  | 'USE_PGLITE'
  | 'implicit-default';

export interface DriverSelection {
  driver: DatabaseDriver;
  source: DriverSource;
  /** Present only for the postgres driver. */
  connectionString?: string;
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

export function resolveDatabaseDriver(env: EnvLike): DriverSelection {
  const production = isProductionEnv(env);
  const warnings: string[] = [];

  const rawDriver = env.DATABASE_DRIVER?.trim().toLowerCase();
  if (rawDriver && rawDriver !== 'postgres' && rawDriver !== 'pglite') {
    throw new DatabaseConfigError(
      `DATABASE_DRIVER must be "postgres" or "pglite" (got "${env.DATABASE_DRIVER}")`,
    );
  }

  const url = env.DATABASE_URL?.trim() || undefined;
  const urlIsPglite = url?.toLowerCase() === 'pglite';
  const usePgliteFlag = parseBooleanFlag('USE_PGLITE', env.USE_PGLITE);

  const refusePgliteInProduction = () => {
    if (production) {
      throw new DatabaseConfigError(
        'PGlite is not allowed in production. Set DATABASE_DRIVER=postgres and a PostgreSQL DATABASE_URL.',
      );
    }
  };
  const postgres = (source: DriverSource): DriverSelection => ({
    driver: 'postgres',
    source,
    connectionString: url,
    warnings,
  });
  const pglite = (source: DriverSource): DriverSelection => {
    refusePgliteInProduction();
    return { driver: 'pglite', source, warnings };
  };

  if (rawDriver === 'postgres') {
    if (!url || !isPostgresUrl(url)) {
      throw new DatabaseConfigError(
        'DATABASE_DRIVER=postgres requires DATABASE_URL to be a postgres:// or postgresql:// URL.',
      );
    }
    if (usePgliteFlag) {
      throw new DatabaseConfigError('DATABASE_DRIVER=postgres conflicts with USE_PGLITE=true.');
    }
    return postgres('DATABASE_DRIVER');
  }

  if (rawDriver === 'pglite') {
    if (url && !urlIsPglite) {
      throw new DatabaseConfigError(
        'DATABASE_DRIVER=pglite conflicts with a DATABASE_URL pointing at another database. Unset DATABASE_URL (or set it to "pglite").',
      );
    }
    return pglite('DATABASE_DRIVER');
  }

  // --- legacy inference (no DATABASE_DRIVER) ---------------------------------
  if (urlIsPglite || usePgliteFlag) {
    warnings.push('Selecting PGlite via DATABASE_URL=pglite / USE_PGLITE is deprecated; set DATABASE_DRIVER=pglite.');
    if (usePgliteFlag && url && !urlIsPglite) {
      warnings.push('USE_PGLITE=true overrides the configured DATABASE_URL; the PostgreSQL URL is ignored.');
    }
    return pglite(usePgliteFlag ? 'USE_PGLITE' : 'DATABASE_URL');
  }
  if (url) {
    if (!isPostgresUrl(url)) {
      throw new DatabaseConfigError(
        'DATABASE_URL must be a postgres:// or postgresql:// URL (or "pglite" for the embedded engine).',
      );
    }
    warnings.push('Driver inferred from DATABASE_URL; set DATABASE_DRIVER=postgres to make it explicit.');
    return postgres('DATABASE_URL');
  }
  if (production) {
    throw new DatabaseConfigError(
      'No database configured in production. Set DATABASE_DRIVER=postgres and DATABASE_URL.',
    );
  }
  warnings.push('No database configured; using the embedded PGlite engine. Set DATABASE_DRIVER explicitly.');
  return pglite('implicit-default');
}
