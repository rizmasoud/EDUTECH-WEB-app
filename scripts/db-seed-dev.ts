/**
 * Explicit, opt-in demo data for a DEVELOPMENT PostgreSQL database.
 *
 *   pnpm db:seed:dev                    # dry run: reports what it would do, writes nothing
 *   pnpm db:seed:dev --confirm-seed     # inserts demo roles/accounts/classes (known demo passwords)
 *
 * Safety: refuses NODE_ENV=production; only inserts, and only when the `accounts` table exists and is
 * EMPTY (so it never touches a database that already has users); never updates, deletes or truncates.
 * Target: DATABASE_DRIVER=postgres and a postgres DATABASE_URL (from the environment / .env).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../apps/api/src/infrastructure/database/schema';
import {
  DatabaseConfigError,
  isProductionEnv,
  maskConnectionString,
  resolveDatabaseDriver,
} from '../apps/api/src/infrastructure/database/driver-selection';
import { seedDemoData } from './lib/dev-seed';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--confirm-seed');
  if (unknown.length) {
    console.error(`Unknown argument: ${unknown[0]}`);
    return 2;
  }
  const confirm = args.includes('--confirm-seed');
  let sql: postgres.Sql | undefined;
  try {
    if (isProductionEnv(process.env)) {
      console.error('Refusing to seed demo data with NODE_ENV=production.');
      return 2;
    }
    const selection = resolveDatabaseDriver(process.env);
    sql = postgres(selection.connectionString, { max: 1, connect_timeout: 5, onnotice: () => {} });
    console.log(`Target: PostgreSQL ${maskConnectionString(selection.connectionString)}`);

    const [{ present }] = await sql`select to_regclass('public.accounts') is not null as present`;
    if (!present) {
      console.error('Table "accounts" is missing: apply the migrations first (pnpm db:migrate --confirm-migrate).');
      return 1;
    }
    const [{ n }] = await sql`select count(*)::int as n from accounts`;
    if (n > 0) {
      console.log(`The accounts table already has ${n} row(s): nothing to do (nothing was changed).`);
      return 0;
    }
    if (!confirm) {
      console.log('Dry run: the accounts table is empty. Re-run with --confirm-seed to insert the demo data.');
      return 0;
    }
    const db = drizzle(sql, { schema });
    await db.transaction(async (tx) => {
      await seedDemoData(tx);
    });
    console.log('Done. Demo logins: SUP-01 / SupervisorPass123! (development only).');
    return 0;
  } catch (e) {
    const msg = maskConnectionString((e as Error).message ?? String(e));
    console.error(`${e instanceof DatabaseConfigError ? 'Configuration error' : 'Seed failed'}: ${msg}`);
    return 2;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }
}

main().then((code) => process.exit(code));
