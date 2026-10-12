/**
 * Offline tests for Drizzle migration metadata.
 * No database of any kind is opened: only files are read, and negative cases
 * run against copies in the OS temp dir.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  defaultDrizzleDir,
  findRepoRoot,
  runDrizzleKitChecks,
  validateMetadata,
} from '../../scripts/db-check';

const repoRoot = findRepoRoot(__dirname);
const realDir = defaultDrizzleDir(repoRoot);
const EXPECTED_TAGS = [
  '0000_glossy_moira_mactaggert',
  '0001_yellow_anthem',
  '0002_white_maverick',
  '0003_quiet_deathstrike',
  '0004_white_spitfire',
  '0005_cynical_shiva',
  '0006_class_sessions_unique',
  '0007_teacher_attendance_unique',
  '0008_payrolls_unique',
  '0009_class_color',
  '0010_class_name',
];

let scratchRoot: string;
before(() => {
  scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-migmeta-test-'));
});
after(() => {
  fs.rmSync(scratchRoot, { recursive: true, force: true });
});

let counter = 0;
function copyDir(): string {
  const dir = path.join(scratchRoot, `copy-${counter++}`);
  fs.cpSync(realDir, dir, { recursive: true });
  return dir;
}
function readJournal(dir: string) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8'));
}
function writeJournal(dir: string, j: unknown) {
  fs.writeFileSync(path.join(dir, 'meta', '_journal.json'), JSON.stringify(j, null, 2));
}
const hasProblem = (problems: string[], re: RegExp) => problems.some((p) => re.test(p));

describe('migration metadata (real repository files)', () => {
  it('passes every offline metadata check', () => {
    const { problems, summary } = validateMetadata(realDir);
    assert.deepEqual(problems, []);
    assert.equal(summary.journalEntries, 11);
    assert.equal(summary.sqlFiles, 11);
    assert.equal(summary.discoveredByMigrator, 11);
    assert.equal(summary.latestSnapshotIdx, 10);
  });

  it('journal lists all SQL files in order with the repaired idx5 tag', () => {
    const tags = readJournal(realDir).entries.map((e: { tag: string }) => e.tag);
    assert.deepEqual(tags, EXPECTED_TAGS);
    const sql = fs.readdirSync(realDir).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(sql, EXPECTED_TAGS.map((t) => `${t}.sql`));
  });

  it('installed Drizzle migrator discovers all 11 migrations in order', () => {
    const migrations = readMigrationFiles({ migrationsFolder: realDir });
    assert.equal(migrations.length, 11);
    const whens = readJournal(realDir).entries.map((e: { when: number }) => e.when);
    assert.deepEqual(migrations.map((m) => m.folderMillis), whens);
    for (let i = 1; i < whens.length; i++) assert.ok(whens[i] > whens[i - 1]);
  });

  it('keeps the original timestamps of migrations 0000-0005', () => {
    const e = readJournal(realDir).entries;
    assert.equal(e[5].when, 1790805010340);
    for (let i = 0; i <= 5; i++) assert.equal(e[i].idx, i);
  });

  it('latest snapshot chains from snapshot 0005 and covers the final schema', () => {
    const s5 = JSON.parse(fs.readFileSync(path.join(realDir, 'meta', '0005_snapshot.json'), 'utf8'));
    const s10 = JSON.parse(fs.readFileSync(path.join(realDir, 'meta', '0010_snapshot.json'), 'utf8'));
    assert.equal(s10.prevId, s5.id);
    assert.ok(s10.tables['public.classes'].columns.name);
    assert.ok(s10.tables['public.classes'].columns.color);
  });

  it('drizzle-kit check + generate in an isolated scratch copy find nothing to do', () => {
    const r = runDrizzleKitChecks(repoRoot, realDir);
    assert.deepEqual(r.problems, []);
    assert.match(r.checkOutput, /Everything's fine/);
    assert.match(r.generateOutput, /No schema changes, nothing to migrate/);
  });
});

describe('migration metadata (negative fixtures in temp copies)', () => {
  it('detects a wrong tag (original idx5 bug)', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries[5].tag = '0005_fine_siren';
    writeJournal(d, j);
    const { problems } = validateMetadata(d);
    assert.ok(hasProblem(problems, /0005_fine_siren\.sql does not exist/));
    assert.ok(hasProblem(problems, /0005_cynical_shiva\.sql is not referenced/));
  });

  it('detects a SQL file missing from the journal', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries.pop();
    writeJournal(d, j);
    assert.ok(hasProblem(validateMetadata(d).problems, /0010_class_name\.sql is not referenced/));
  });

  it('detects a duplicated journal entry', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries.push({ ...j.entries[10], idx: 11, when: j.entries[10].when + 1 });
    writeJournal(d, j);
    const { problems } = validateMetadata(d);
    assert.ok(hasProblem(problems, /duplicate tag/));
    assert.ok(hasProblem(problems, /referenced 2 times/));
  });

  it('detects non-contiguous idx', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries[7].idx = 9;
    writeJournal(d, j);
    assert.ok(hasProblem(validateMetadata(d).problems, /not contiguous/));
  });

  it('detects equal and decreasing timestamps', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries[7].when = j.entries[6].when;
    j.entries[9].when = j.entries[8].when - 1;
    writeJournal(d, j);
    const { problems } = validateMetadata(d);
    assert.ok(hasProblem(problems, /entry\[7\].*not strictly greater/));
    assert.ok(hasProblem(problems, /entry\[9\].*not strictly greater/));
  });

  it('detects future timestamps', () => {
    const d = copyDir();
    const j = readJournal(d);
    j.entries[10].when = Date.now() + 10 * 365 * 24 * 3600 * 1000;
    writeJournal(d, j);
    assert.ok(hasProblem(validateMetadata(d).problems, /in the future/));
  });

  it('detects a missing SQL file', () => {
    const d = copyDir();
    fs.rmSync(path.join(d, '0003_quiet_deathstrike.sql'));
    assert.ok(hasProblem(validateMetadata(d).problems, /0003_quiet_deathstrike\.sql does not exist/));
  });

  it('detects an extra unreferenced SQL file', () => {
    const d = copyDir();
    fs.writeFileSync(path.join(d, '0011_extra.sql'), 'SELECT 1;');
    assert.ok(hasProblem(validateMetadata(d).problems, /0011_extra\.sql is not referenced/));
  });

  it('detects a stale latest snapshot', () => {
    const d = copyDir();
    fs.rmSync(path.join(d, 'meta', '0010_snapshot.json'));
    assert.ok(hasProblem(validateMetadata(d).problems, /Latest snapshot idx \(5\)/));
  });

  it('detects a broken snapshot chain', () => {
    const d = copyDir();
    const f = path.join(d, 'meta', '0010_snapshot.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.prevId = '11111111-1111-1111-1111-111111111111';
    fs.writeFileSync(f, JSON.stringify(s));
    assert.ok(hasProblem(validateMetadata(d).problems, /0010_snapshot\.json: prevId/));
  });

  it('detects an undocumented missing snapshot', () => {
    const d = copyDir();
    fs.rmSync(path.join(d, 'meta', '0003_snapshot.json'));
    assert.ok(hasProblem(validateMetadata(d).problems, /Missing snapshot for journal idx 3/));
  });

  it('detects a snapshot with the wrong dialect', () => {
    const d = copyDir();
    const f = path.join(d, 'meta', '0010_snapshot.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.dialect = 'mysql';
    fs.writeFileSync(f, JSON.stringify(s));
    assert.ok(hasProblem(validateMetadata(d).problems, /dialect mysql/));
  });

  it('drizzle-kit generate flags a stale snapshot as a would-be duplicate migration', () => {
    const d = copyDir();
    // Reproduce the original defect: journal/SQL are ahead of the latest snapshot.
    fs.rmSync(path.join(d, 'meta', '0010_snapshot.json'));
    const j = readJournal(d);
    const r = runDrizzleKitChecks(repoRoot, d);
    assert.ok(j.entries.length === 11);
    assert.ok(r.problems.length > 0, 'expected generate to report schema drift');
    assert.ok(hasProblem(r.problems, /generate/));
  });
});
