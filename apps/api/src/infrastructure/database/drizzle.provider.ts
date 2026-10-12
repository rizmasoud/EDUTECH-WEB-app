import { Provider, Logger } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { getPGliteDatabase } from './pglite-bootstrap';
import { maskConnectionString, resolveDatabaseDriver } from './driver-selection';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
export type DrizzleDb = PostgresJsDatabase<typeof schema> | any;

let postgresClient: postgres.Sql | null = null;

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

    if (selection.driver === 'pglite') {
      logger.log(`Using embedded PGlite database engine (selected via ${selection.source})`);
      return getPGliteDatabase();
    }

    const connectionString = selection.connectionString as string;
    logger.log(`Configuring PostgreSQL connection pool with target: ${maskConnectionString(connectionString)}`);

    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 3,
      onnotice: () => {},
    });

    try {
      await client`SELECT 1`;
    } catch (err: any) {
      try {
        await client.end({ timeout: 1 });
      } catch {
        /* ignore */
      }
      const masked = maskConnectionString(err?.message ? String(err.message) : String(err));
      // Deliberately no fallback: the selected driver is PostgreSQL.
      logger.error(`PostgreSQL connection failed: ${masked}. Not falling back to PGlite.`);
      throw new Error(`PostgreSQL connection failed: ${masked}`);
    }
    postgresClient = client;
    return drizzle(client, { schema });
  },
};
