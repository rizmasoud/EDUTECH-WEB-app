import { Provider, Logger } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { maskConnectionString, resolveDatabaseDriver } from './driver-selection';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
export type DrizzleDb = PostgresJsDatabase<typeof schema> | any;

let postgresClient: postgres.Sql | null = null;

const TRANSIENT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  '57P03', // cannot_connect_now: the server is starting up
]);

/** Errors that mean "not up yet" (worth retrying). Authentication/config errors are never retried. */
export function isTransientConnectError(err: any): boolean {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const nested: any[] = Array.isArray(err.errors) ? err.errors : [];
  if (nested.length > 0 && nested.every((e) => TRANSIENT_CODES.has(e?.code))) return true;
  return /ECONNREFUSED|starting up/i.test(String(err.message ?? ''));
}

/** How long the API waits for PostgreSQL at startup. Default 30s; 0 disables waiting. */
export function connectRetrySeconds(env: Record<string, string | undefined>): number {
  const raw = env.DATABASE_CONNECT_RETRY_SECONDS?.trim();
  if (!raw) return 30;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 300) : 30;
}

export async function closeDatabaseConnection(): Promise<void> {
  const logger = new Logger('DrizzleProvider');
  if (postgresClient) {
    logger.log('Closing PostgreSQL database connection pool...');
    try {
      await postgresClient.end({ timeout: 5 });
    } catch (err: any) {
      logger.warn(`Error while closing PostgreSQL connection pool: ${err.message}`);
    } finally {
      postgresClient = null;
    }
  }
}

export const drizzleProvider: Provider = {
  provide: DRIZZLE_DB,
  useFactory: async (): Promise<DrizzleDb> => {
    if ((global as any).__TEST_DRIZZLE_DB__) {
      return (global as any).__TEST_DRIZZLE_DB__;
    }

    const logger = new Logger('DrizzleProvider');
    // Throws DatabaseConfigError for invalid/conflicting configuration.
    const selection = resolveDatabaseDriver(process.env);
    for (const w of selection.warnings) logger.warn(w);

    const connectionString = selection.connectionString as string;
    logger.log(`Configuring PostgreSQL connection pool with target: ${maskConnectionString(connectionString)}`);

    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 3,
      onnotice: () => {},
    });

    const retrySeconds = connectRetrySeconds(process.env);
    const deadline = Date.now() + retrySeconds * 1000;
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        await client`SELECT 1`;
        break;
      } catch (err: any) {
        if (isTransientConnectError(err) && Date.now() < deadline) {
          if (attempt === 1) {
            logger.warn(
              `PostgreSQL is not accepting connections yet; retrying for up to ${retrySeconds}s ` +
                `(start it with "docker compose up -d --wait postgres").`,
            );
          }
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        try {
          await client.end({ timeout: 1 });
        } catch {
          /* ignore */
        }
        const masked = maskConnectionString(err?.message ? String(err.message) : String(err));
        // PostgreSQL is the only supported engine: there is no fallback.
        logger.error(
          `PostgreSQL connection failed: ${masked}. Check that PostgreSQL is running ` +
            `("docker compose up -d --wait postgres") and that DATABASE_URL in .env is correct.`,
        );
        throw new Error(`PostgreSQL connection failed: ${masked}`);
      }
    }
    postgresClient = client;

    // Non-fatal hint: an empty database has no tables until the migrations are applied.
    try {
      const rows = await client`select to_regclass('public.accounts') is not null as present`;
      if (!rows[0]?.present) {
        logger.warn('The database has no schema yet (table "accounts" is missing). Run: pnpm db:migrate --confirm-migrate');
      }
    } catch {
      /* the hint must never block startup */
    }
    return drizzle(client, { schema });
  },
};
