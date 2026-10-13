/**
 * Read-only migration status.
 *
 *   pnpm db:status                      # PostgreSQL from DATABASE_DRIVER/DATABASE_URL
 *   pnpm db:status --pglite-dir <dir>   # an existing PGlite directory you name explicitly
 *   pnpm db:status --json
 *
 * Never applies, baselines, creates or deletes anything. If the database cannot
 * be reached it reports the error (exit 2); it never falls back to another driver.
 * The environment is read as-is (no .env loading): export the variables you want.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  DatabaseConfigError,
  maskConnectionString,
  resolveDatabaseDriver,
} from '../apps/api/src/infrastructure/database/driver-selection';
import {
  inspectMigrations,
  withPGliteReader,
  withPostgresReader,
  type MigrationStatusReport,
} from './lib/migration-status';
import { defaultDrizzleDir, findRepoRoot } from './db-check';

function parseArgs(argv: string[]) {
  const out: { json: boolean; pgliteDir?: string } = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--pglite-dir') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--pglite-dir needs a path');
      out.pgliteDir = v;
    }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (out.pgliteDir !== undefined && !out.pgliteDir) throw new Error('--pglite-dir needs a path');
  return out;
}

function render(report: MigrationStatusReport, target: string): string {
  const lines = [
    `Migration status (read-only) - target: ${target}`,
    `  state: ${report.state}; applied: ${report.appliedCount}, pending: ${report.pendingCount}`,
  ];
  for (const m of report.migrations) lines.push(`  [${m.status === 'applied' ? 'x' : ' '}] ${m.tag}`);
  lines.push(`  migrator would apply next: ${report.migratorWouldApply.join(', ') || '(none)'}`);
  if (report.problems.length) {
    lines.push('Problems:');
    for (const p of report.problems) lines.push(`  - ${p}`);
  }
  lines.push(report.safeToMigrate ? 'Result: OK (nothing was changed).' : 'Result: NOT SAFE TO MIGRATE (nothing was changed).');
  return lines.join('\n');
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const migrationsDir = defaultDrizzleDir(findRepoRoot());
  try {
    let report: MigrationStatusReport;
    let target: string;
    if (args.pgliteDir) {
      const dir = path.resolve(args.pgliteDir);
      if (!fs.existsSync(dir)) {
        console.error(`PGlite directory does not exist: ${dir} (it will not be created).`);
        return 2;
      }
      target = `PGlite ${dir} (opening a PGlite directory can touch its files; work on a copy if unsure)`;
      const pg = new PGlite(dir);
      try {
        await pg.waitReady;
        report = await withPGliteReader(pg, (r) => inspectMigrations(r, migrationsDir));
      } finally {
        await pg.close();
      }
    } else {
      const selection = resolveDatabaseDriver(process.env);
      if (selection.driver !== 'postgres') {
        console.error('Selected driver is PGlite; pass --pglite-dir <dir> to inspect a specific PGlite directory.');
        return 2;
      }
      const url = selection.connectionString as string;
      target = `PostgreSQL ${maskConnectionString(url)}`;
      report = await withPostgresReader(url, (r) => inspectMigrations(r, migrationsDir));
    }
    console.log(args.json ? JSON.stringify(report, null, 2) : render(report, target));
    return report.safeToMigrate ? 0 : 1;
  } catch (e) {
    const msg = maskConnectionString((e as Error).message ?? String(e));
    console.error(`${e instanceof DatabaseConfigError ? 'Configuration error' : 'Could not inspect database'}: ${msg}`);
    return 2;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
