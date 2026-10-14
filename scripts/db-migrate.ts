/**
 * Apply PENDING repository migrations to a PostgreSQL database, explicitly.
 *
 *   pnpm db:migrate                      # DRY RUN (default, read-only): lists what would be applied
 *   pnpm db:migrate --confirm-migrate    # applies pending migrations via the installed Drizzle migrator
 *   add --json for machine-readable output
 *
 * Target: DATABASE_DRIVER=postgres and a postgres DATABASE_URL, both set in the environment.
 * The driver is never inferred from DATABASE_URL and there is no PGlite fallback.
 *
 * Refuses (exit 1) on invalid repository metadata, unknown applied hashes, inconsistent history,
 * or a database with tables but no history (use `pnpm db:baseline` first). Never baselines or
 * repairs anything. Never run as part of application startup. See docs/migrations.md.
 *
 * Exit codes: 0 ok / nothing to do, 1 refused (incl. lock timeout, failed post-check), 2 usage/configuration/connection error or a migration that failed to execute (rolled back as documented).
 */
import {
  DatabaseConfigError,
  maskConnectionString,
  resolveDatabaseDriver,
} from '../apps/api/src/infrastructure/database/driver-selection';
import {
  MigrateRefusedError,
  planMigrate,
  postgresSessionOpener,
  runMigrations,
  type MigratePlan,
} from './lib/migrate-runner';
import { withPostgresReader } from './lib/migration-status';
import { defaultDrizzleDir, findRepoRoot } from './db-check';

interface Args {
  json: boolean;
  confirm: boolean;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { json: false, confirm: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a === '--confirm-migrate') out.confirm = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

export function render(plan: MigratePlan, target: string, mode: 'dry-run' | 'applied', applied: string[] = []): string {
  const lines = [`Migrate ${mode === 'dry-run' ? 'DRY RUN (read-only)' : 'RESULT'} - target: ${target}`];
  if (plan.status) {
    lines.push(`  database state: ${plan.status.state}, applied: ${plan.status.appliedCount}, pending: ${plan.status.pendingCount}`);
  }
  if (!plan.ok) {
    lines.push('Refused:');
    for (const r of plan.refusals) lines.push(`  - ${r}`);
    lines.push('Result: REFUSED. Nothing was changed.');
  } else if (mode === 'dry-run') {
    if (plan.pending.length === 0) lines.push('Result: nothing to apply. Nothing was changed.');
    else {
      lines.push(`  would apply ${plan.pending.length} migration(s):`);
      for (const m of plan.pending) lines.push(`    ${m.tag}  (created_at=${m.when})`);
      lines.push('Result: migration is allowed. Nothing was changed. Re-run with --confirm-migrate to apply.');
    }
  } else if (applied.length === 0) {
    lines.push('Result: nothing to apply. Nothing was changed.');
  } else {
    lines.push(`  applied ${applied.length} migration(s):`);
    for (const t of applied) lines.push(`    ${t}`);
    lines.push('Result: migrations applied and verified.');
  }
  return lines.join('\n');
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  try {
    const selection = resolveDatabaseDriver(process.env);
    if (selection.source !== 'DATABASE_DRIVER' || selection.driver !== 'postgres') {
      console.error(
        'db:migrate needs an explicit PostgreSQL target: set DATABASE_DRIVER=postgres and a postgres DATABASE_URL. ' +
          'The driver is not inferred from DATABASE_URL and PGlite is never used.',
      );
      return 2;
    }
    const url = selection.connectionString as string;
    const target = `PostgreSQL ${maskConnectionString(url)}`;
    const migrationsDir = defaultDrizzleDir(findRepoRoot());

    if (!args.confirm) {
      const plan = await withPostgresReader(url, (r) => planMigrate(r, migrationsDir));
      console.log(args.json ? JSON.stringify(plan, null, 2) : render(plan, target, 'dry-run'));
      return plan.ok ? 0 : 1;
    }
    const result = await runMigrations(postgresSessionOpener(url), migrationsDir, { confirm: true });
    console.log(
      args.json
        ? JSON.stringify(result, null, 2)
        : render(result.plan, target, 'applied', result.applied),
    );
    return 0;
  } catch (e) {
    if (e instanceof MigrateRefusedError) {
      console.error(maskConnectionString(e.message));
      return 1;
    }
    const msg = maskConnectionString((e as Error).message ?? String(e));
    if (e instanceof DatabaseConfigError) {
      console.error(`Configuration error: ${msg}`);
      return 2;
    }
    console.error(`Migration failed or database unreachable: ${msg}`);
    return 2;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
