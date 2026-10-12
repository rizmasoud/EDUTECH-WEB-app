/**
 * Offline Drizzle migration-metadata checker.
 *
 * Validates `apps/api/drizzle` (SQL files + `meta/_journal.json` + snapshots)
 * WITHOUT connecting to any database. Safe to run anywhere:
 *
 *   pnpm db:check
 *
 * Two layers:
 *  1. `validateMetadata`   - pure file-level validation (journal, SQL, snapshots,
 *                            and the installed Drizzle migrator's own reader).
 *  2. `runDrizzleKitChecks` - runs the installed drizzle-kit `check` and `generate`
 *                            inside an isolated scratch copy in the OS temp dir.
 *                            `generate` must report "nothing to migrate".
 *
 * This script never imports the app's database provider, never reads
 * DATABASE_URL, and never runs `migrate`, `push` or `drop`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Historical gap: migrations 0006-0009 were hand-written and never had a
 * snapshot generated. The repair intentionally does NOT fabricate them
 * (see docs/migrations.md). Any other missing snapshot is an error.
 */
export const KNOWN_MISSING_SNAPSHOT_IDX: readonly number[] = [6, 7, 8, 9];

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface MetadataSummary {
  journalEntries: number;
  sqlFiles: number;
  snapshots: number;
  latestSnapshotIdx: number | null;
  discoveredByMigrator: number;
}

export interface MetadataResult {
  problems: string[];
  summary: MetadataSummary;
}

export interface ValidateOptions {
  nowMs?: number;
  allowedMissingSnapshots?: readonly number[];
}

export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find repo root (pnpm-workspace.yaml) from ${start}`);
    }
    dir = parent;
  }
}

export function defaultDrizzleDir(repoRoot: string): string {
  return path.join(repoRoot, 'apps', 'api', 'drizzle');
}

function readJson(file: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const TAG_RE = /^(\d{4})_[a-z0-9_]+$/;
const SNAPSHOT_RE = /^(\d{4})_snapshot\.json$/;

export function validateMetadata(
  drizzleDir: string,
  opts: ValidateOptions = {},
): MetadataResult {
  const problems: string[] = [];
  const nowMs = opts.nowMs ?? Date.now();
  const allowedMissing = new Set(opts.allowedMissingSnapshots ?? KNOWN_MISSING_SNAPSHOT_IDX);
  const summary: MetadataSummary = {
    journalEntries: 0,
    sqlFiles: 0,
    snapshots: 0,
    latestSnapshotIdx: null,
    discoveredByMigrator: 0,
  };

  const metaDir = path.join(drizzleDir, 'meta');
  const journalPath = path.join(metaDir, '_journal.json');
  if (!fs.existsSync(journalPath)) {
    problems.push(`Missing journal: ${journalPath}`);
    return { problems, summary };
  }
  const j = readJson(journalPath);
  if (!j.ok) {
    problems.push(`Journal is not valid JSON: ${j.error}`);
    return { problems, summary };
  }
  const journal = j.value;
  if (!journal || !Array.isArray(journal.entries)) {
    problems.push('Journal has no "entries" array');
    return { problems, summary };
  }
  const entries: JournalEntry[] = journal.entries;
  summary.journalEntries = entries.length;

  if (typeof journal.version !== 'string') problems.push('Journal "version" must be a string');
  if (journal.dialect !== 'postgresql') {
    problems.push(`Journal dialect must be "postgresql" (got ${JSON.stringify(journal.dialect)})`);
  }

  // --- per-entry checks -------------------------------------------------
  const seenTags = new Set<string>();
  entries.forEach((e, position) => {
    const label = `entry[${position}]`;
    if (e.idx !== position) {
      problems.push(`${label}: idx ${e.idx} is not contiguous (expected ${position})`);
    }
    if (typeof e.tag !== 'string' || !TAG_RE.test(e.tag)) {
      problems.push(`${label}: tag ${JSON.stringify(e.tag)} is invalid (expected NNNN_name)`);
    } else {
      if (Number(e.tag.slice(0, 4)) !== position) {
        problems.push(`${label}: tag prefix ${e.tag.slice(0, 4)} does not match position ${position}`);
      }
      if (seenTags.has(e.tag)) problems.push(`${label}: duplicate tag ${e.tag}`);
      seenTags.add(e.tag);
      if (!fs.existsSync(path.join(drizzleDir, `${e.tag}.sql`))) {
        problems.push(`${label}: SQL file ${e.tag}.sql does not exist`);
      }
    }
    if (!Number.isSafeInteger(e.when) || e.when <= 0) {
      problems.push(`${label}: "when" must be a positive safe integer (got ${String(e.when)})`);
    } else {
      if (e.when > nowMs) problems.push(`${label}: "when" ${e.when} is in the future`);
      if (position > 0) {
        const prev = entries[position - 1];
        if (Number.isSafeInteger(prev?.when) && e.when <= prev.when) {
          problems.push(
            `${label}: "when" ${e.when} is not strictly greater than previous ${prev.when}`,
          );
        }
      }
    }
    if (typeof e.breakpoints !== 'boolean') {
      problems.push(`${label}: "breakpoints" must be boolean`);
    }
  });

  // --- every .sql file appears exactly once ------------------------------
  const sqlFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  summary.sqlFiles = sqlFiles.length;
  for (const f of sqlFiles) {
    const tag = f.slice(0, -4);
    const count = entries.filter((e) => e.tag === tag).length;
    if (count === 0) problems.push(`SQL file ${f} is not referenced by the journal`);
    else if (count > 1) problems.push(`SQL file ${f} is referenced ${count} times by the journal`);
  }

  // --- installed Drizzle migrator's own reader ---------------------------
  if (problems.length === 0) {
    try {
      const migrations = readMigrationFiles({ migrationsFolder: drizzleDir });
      summary.discoveredByMigrator = migrations.length;
      if (migrations.length !== entries.length) {
        problems.push(
          `Drizzle migrator discovered ${migrations.length} migrations, journal has ${entries.length}`,
        );
      }
      migrations.forEach((m, i) => {
        const entry = entries[i];
        if (!entry) return;
        if (m.folderMillis !== entry.when) {
          problems.push(`migrator[${i}]: folderMillis ${m.folderMillis} != journal when ${entry.when}`);
        }
        const sqlBytes = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`));
        const hash = createHash('sha256').update(sqlBytes.toString()).digest('hex');
        if (m.hash !== hash) problems.push(`migrator[${i}]: hash mismatch for ${entry.tag}`);
      });
      problems.push(...simulatePending(entries, migrations.map((m) => m.folderMillis)));
    } catch (e) {
      problems.push(`Drizzle migrator could not read migrations: ${(e as Error).message}`);
    }
  }

  // --- snapshots ---------------------------------------------------------
  const snapFiles = fs.existsSync(metaDir)
    ? fs.readdirSync(metaDir).filter((f) => f !== '_journal.json' && f.endsWith('.json')).sort()
    : [];
  const snapshots: { idx: number; id: string; prevId: string; file: string }[] = [];
  for (const f of snapFiles) {
    const m = SNAPSHOT_RE.exec(f);
    if (!m) {
      problems.push(`Unexpected file in meta/: ${f}`);
      continue;
    }
    const idx = Number(m[1]);
    const s = readJson(path.join(metaDir, f));
    if (!s.ok) {
      problems.push(`Snapshot ${f} is not valid JSON: ${s.error}`);
      continue;
    }
    const v = s.value;
    if (v.version !== journal.version) {
      problems.push(`Snapshot ${f}: version ${v.version} != journal version ${journal.version}`);
    }
    if (v.dialect !== journal.dialect) {
      problems.push(`Snapshot ${f}: dialect ${v.dialect} != journal dialect ${journal.dialect}`);
    }
    if (typeof v.id !== 'string' || typeof v.prevId !== 'string') {
      problems.push(`Snapshot ${f}: missing id/prevId`);
      continue;
    }
    snapshots.push({ idx, id: v.id, prevId: v.prevId, file: f });
  }
  summary.snapshots = snapshots.length;
  summary.latestSnapshotIdx = snapshots.length ? snapshots[snapshots.length - 1].idx : null;

  const ids = new Set<string>();
  for (const s of snapshots) {
    if (ids.has(s.id)) problems.push(`Snapshot ${s.file}: duplicate id ${s.id}`);
    ids.add(s.id);
    if (s.idx >= entries.length) {
      problems.push(`Snapshot ${s.file}: no journal entry with idx ${s.idx}`);
    }
  }
  const haveIdx = new Set(snapshots.map((s) => s.idx));
  entries.forEach((_, i) => {
    if (!haveIdx.has(i) && !allowedMissing.has(i)) {
      problems.push(`Missing snapshot for journal idx ${i} (not in the documented allow-list)`);
    }
  });
  if (entries.length > 0 && summary.latestSnapshotIdx !== entries.length - 1) {
    problems.push(
      `Latest snapshot idx (${summary.latestSnapshotIdx}) must equal last journal idx (${entries.length - 1})`,
    );
  }
  snapshots.forEach((s, i) => {
    const expectedPrev = i === 0 ? ZERO_UUID : snapshots[i - 1].id;
    if (s.prevId !== expectedPrev) {
      problems.push(`Snapshot ${s.file}: prevId ${s.prevId} != expected ${expectedPrev}`);
    }
  });

  return { problems, summary };
}

/**
 * Mirrors the installed pg migrator's skip rule:
 *   run migration m iff  !lastApplied || lastApplied.created_at < m.folderMillis
 * For every possible DB state (nothing applied, or first k applied) exactly the
 * remaining migrations must be pending, in order, and none skipped.
 */
function simulatePending(entries: JournalEntry[], folderMillis: number[]): string[] {
  const problems: string[] = [];
  const pendingFor = (last: number | null) =>
    folderMillis.map((ms, i) => ({ ms, i })).filter((m) => last === null || last < m.ms).map((m) => m.i);

  const fresh = pendingFor(null);
  if (fresh.length !== entries.length || fresh.some((v, i) => v !== i)) {
    problems.push('Pending simulation: a fresh database would not apply every migration in order');
  }
  for (let k = 0; k < entries.length; k++) {
    const expected = entries.map((_, i) => i).slice(k + 1);
    const got = pendingFor(folderMillis[k]);
    if (got.length !== expected.length || got.some((v, i) => v !== expected[i])) {
      problems.push(
        `Pending simulation: with migration ${k} applied, expected [${expected}] pending but got [${got}]`,
      );
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// drizzle-kit check + generate in an isolated scratch copy
// ---------------------------------------------------------------------------

export interface KitCheckResult {
  problems: string[];
  kitVersion: string | null;
  checkOutput: string;
  generateOutput: string;
}

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', CI: '1' };
  delete env.DATABASE_URL;
  delete env.USE_PGLITE;
  return env;
}

export function runDrizzleKitChecks(repoRoot: string, drizzleDir: string): KitCheckResult {
  const result: KitCheckResult = { problems: [], kitVersion: null, checkOutput: '', generateOutput: '' };
  const apiDir = path.join(repoRoot, 'apps', 'api');
  const schemaSrc = path.join(apiDir, 'src', 'infrastructure', 'database', 'schema');
  const kitBin = path.join(repoRoot, 'node_modules', 'drizzle-kit', 'bin.cjs');
  if (!fs.existsSync(kitBin)) {
    result.problems.push('drizzle-kit is not installed (node_modules/drizzle-kit/bin.cjs missing)');
    return result;
  }
  try {
    result.kitVersion = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'node_modules', 'drizzle-kit', 'package.json'), 'utf8'),
    ).version;
  } catch {
    /* version is informational only */
  }

  // The real config must keep the settings the scratch config mirrors.
  const realConfigPath = path.join(apiDir, 'drizzle.config.ts');
  const realConfig = fs.readFileSync(realConfigPath, 'utf8');
  for (const needle of [
    "schema: './src/infrastructure/database/schema/index.ts'",
    "out: './drizzle'",
    "dialect: 'postgresql'",
    'strict: true',
  ]) {
    if (!realConfig.includes(needle)) {
      result.problems.push(`apps/api/drizzle.config.ts no longer contains \`${needle}\`; update db-check`);
    }
  }
  if (result.problems.length) return result;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-dbcheck-'));
  const link = path.join(tmp, 'node_modules');
  try {
    fs.cpSync(drizzleDir, path.join(tmp, 'drizzle'), { recursive: true });
    fs.cpSync(schemaSrc, path.join(tmp, 'src', 'infrastructure', 'database', 'schema'), {
      recursive: true,
    });
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), link, 'dir');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'dbcheck-scratch', private: true }));
    // No dbCredentials on purpose: check/generate never need a database.
    fs.writeFileSync(
      path.join(tmp, 'drizzle.config.json'),
      JSON.stringify({
        schema: './src/infrastructure/database/schema/index.ts',
        out: './drizzle',
        dialect: 'postgresql',
        verbose: true,
        strict: true,
      }),
    );

    const before = hashTree(path.join(tmp, 'drizzle'));
    const run = (cmd: string) =>
      spawnSync(process.execPath, [kitBin, cmd, '--config', 'drizzle.config.json'], {
        cwd: tmp,
        env: cleanEnv(),
        encoding: 'utf8',
        timeout: 120_000,
      });

    const check = run('check');
    result.checkOutput = `${check.stdout ?? ''}${check.stderr ?? ''}`;
    if (check.status !== 0 || !/Everything's fine/.test(result.checkOutput)) {
      result.problems.push(`drizzle-kit check failed (exit ${check.status}): ${result.checkOutput.trim()}`);
    }

    const gen = run('generate');
    result.generateOutput = `${gen.stdout ?? ''}${gen.stderr ?? ''}`;
    if (gen.status !== 0 || !/No schema changes, nothing to migrate/.test(result.generateOutput)) {
      result.problems.push(
        `drizzle-kit generate would produce a migration or failed (exit ${gen.status}): ${result.generateOutput.trim()}`,
      );
    }
    const after = hashTree(path.join(tmp, 'drizzle'));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      result.problems.push('drizzle-kit generate changed files in the scratch copy (duplicate/new migration)');
    }
  } finally {
    // Remove the symlink first so recursive removal can never follow it.
    fs.rmSync(link, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): number {
  const repoRoot = findRepoRoot();
  const drizzleDir = defaultDrizzleDir(repoRoot);
  console.log('db:check - offline migration metadata check (no database is contacted)');

  const meta = validateMetadata(drizzleDir);
  console.log(
    `  journal entries: ${meta.summary.journalEntries}, sql files: ${meta.summary.sqlFiles}, ` +
      `snapshots: ${meta.summary.snapshots}, latest snapshot idx: ${meta.summary.latestSnapshotIdx}, ` +
      `discovered by Drizzle migrator: ${meta.summary.discoveredByMigrator}`,
  );

  const problems = [...meta.problems];
  if (meta.problems.length === 0) {
    const kit = runDrizzleKitChecks(repoRoot, drizzleDir);
    console.log(`  drizzle-kit ${kit.kitVersion ?? '?'} check: ${kit.checkOutput.trim().split('\n').pop()}`);
    console.log(`  drizzle-kit ${kit.kitVersion ?? '?'} generate: ${kit.generateOutput.trim().split('\n').pop()}`);
    problems.push(...kit.problems);
  } else {
    console.log('  skipping drizzle-kit checks because metadata validation failed');
  }

  if (problems.length) {
    console.error('\nFAIL');
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log('\nPASS');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}
