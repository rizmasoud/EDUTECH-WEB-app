/**
 * Baseline an EXISTING database that has the application schema but no Drizzle history.
 *
 *   pnpm db:baseline [target options] [--target <tag>] [--json]            # DRY RUN (default, read-only)
 *   pnpm db:baseline [target options] --confirm-baseline [--target <tag>]  # writes drizzle.__drizzle_migrations
 *
 * Target options (one is required; nothing is chosen implicitly, no fallback driver):
 *   --pglite-dir <dir>        an existing PGlite directory you name explicitly
 *   (PostgreSQL)              DATABASE_DRIVER=postgres and a postgres DATABASE_URL set in the
 *                             environment; legacy inference is NOT accepted here
 *
 * Exit codes: 0 ok (dry run: baseline would be allowed), 1 refused, 2 usage/connection error.
 * Never run as part of application startup. See docs/migrations.md.
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
  applyBaseline,
  BaselineRefusedError,
  pgliteExecutor,
  planBaseline,
  withPostgresBaselineExecutor,
  type BaselinePlan,
} from './lib/baseline';
import { withPGliteReader, withPostgresReader } from './lib/migration-status';
import { defaultDrizzleDir, findRepoRoot } from './db-check';

interface Args {
  json: boolean;
  confirm: boolean;
  pgliteDir?: string;
  target?: string;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { json: false, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--confirm-baseline') out.confirm = true;
    else if (a === '--pglite-dir') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--pglite-dir needs a path');
      out.pgliteDir = v;
    }
    else if (a === '--target') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--target needs a migration tag');
      out.target = v;
    }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (out.pgliteDir !== undefined && !out.pgliteDir) throw new Error('--pglite-dir needs a path');
  if (out.target !== undefined && !out.target) throw new Error('--target needs a migration tag');
  return out;
}

export function render(plan: BaselinePlan, target: string, mode: 'dry-run' | 'written'): string {
  const lines = [`Baseline ${mode === 'dry-run' ? 'DRY RUN (read-only)' : 'WRITTEN'} - target: ${target}`];
  if (plan.status) lines.push(`  database state: ${plan.status.state}, public tables: ${plan.status.publicTableCount}`);
  if (plan.databaseSchemaHash) lines.push(`  database schema hash: ${plan.databaseSchemaHash.slice(0, 16)}`);
  if (plan.ok) {
    lines.push(`  schema is identical to the repository schema after: ${plan.closestCandidate}`);
    lines.push(`  would record ${plan.toRecord.length} migration(s):`);
    for (const m of plan.toRecord) lines.push(`    ${m.tag}  (created_at=${m.when})`);
    lines.push(`  remaining pending: ${plan.remainingPending.join(', ') || '(none)'}`);
    lines.push(
      mode === 'dry-run'
        ? 'Result: baseline is allowed. Nothing was changed. Re-run with --confirm-baseline to record it.'
        : 'Result: baseline recorded in drizzle.__drizzle_migrations. Application tables were not touched.',
    );
  } else {
    lines.push('Refused:');
    for (const r of plan.refusals) lines.push(`  - ${r}`);
    for (const d of plan.discrepancies.slice(0, 20)) {
      lines.push(`    ${d.kind}: ${d.key}${d.expected ? ` expected=${d.expected}` : ''}${d.actual ? ` actual=${d.actual}` : ''}`);
    }
    if (plan.discrepancies.length > 20) lines.push(`    ... ${plan.discrepancies.length - 20} more`);
    lines.push('Result: REFUSED. Nothing was changed.');
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
  const migrationsDir = defaultDrizzleDir(findRepoRoot());
  const planOptions = { targetTag: args.target };
  try {
    let plan: BaselinePlan;
    let target: string;
    if (args.pgliteDir) {
      const dir = path.resolve(args.pgliteDir);
      if (!fs.existsSync(dir)) {
        console.error(`PGlite directory does not exist: ${dir} (it will not be created).`);
        return 2;
      }
      target = `PGlite ${dir}`;
      const pg = new PGlite(dir);
      try {
        await pg.waitReady;
        plan = args.confirm
          ? await applyBaseline(pgliteExecutor(pg), migrationsDir, { ...planOptions, confirm: true })
          : await withPGliteReader(pg, (r) => planBaseline(r, migrationsDir, planOptions));
      } finally {
        await pg.close();
      }
    } else {
      const selection = resolveDatabaseDriver(process.env);
      if (selection.source !== 'DATABASE_DRIVER' || selection.driver !== 'postgres') {
        console.error(
          'Baseline needs an explicit target: set DATABASE_DRIVER=postgres (with a postgres DATABASE_URL) or pass --pglite-dir <dir>.',
        );
        return 2;
      }
      const url = selection.connectionString as string;
      target = `PostgreSQL ${maskConnectionString(url)}`;
      plan = args.confirm
        ? await withPostgresBaselineExecutor(url, (ex) =>
            applyBaseline(ex, migrationsDir, { ...planOptions, confirm: true }),
          )
        : await withPostgresReader(url, (r) => planBaseline(r, migrationsDir, planOptions));
    }
    console.log(args.json ? JSON.stringify(plan, null, 2) : render(plan, target, args.confirm ? 'written' : 'dry-run'));
    return plan.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof BaselineRefusedError) {
      console.error(maskConnectionString(e.message));
      if (e.plan && !args.json) console.error(render(e.plan, 'refused', 'dry-run'));
      return 1;
    }
    const msg = maskConnectionString((e as Error).message ?? String(e));
    console.error(`${e instanceof DatabaseConfigError ? 'Configuration error' : 'Could not baseline database'}: ${msg}`);
    return 2;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
