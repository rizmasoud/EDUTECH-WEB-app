#!/usr/bin/env node
/**
 * Regression check for scripts/dev-api.mjs (the API development runner). Manual, not part of `pnpm test`.
 *
 *   node scripts/check-dev-runner.mjs [--signal=SIGTERM|SIGINT|SIGHUP] [--skip-edit]
 *
 * READ BEFORE RUNNING
 *  - Linux only (it reads `ps` output and relies on POSIX process groups). Needs the Node version declared in
 *    package.json "engines.node" (the runner it starts refuses to run on an older one).
 *  - It starts the real API, so DATABASE_URL (from the environment or the usual .env files) must point at a reachable
 *    DISPOSABLE or TEST PostgreSQL database. Never run it against a production or shared database. The check sends no
 *    request that reads or writes data (see step 2), but it does boot the API against whatever database is configured.
 *  - It TEMPORARILY EDITS A TRACKED SOURCE FILE: packages/shared/src/contracts/domain.schema.ts. Do not edit that file,
 *    switch branches or run git operations on it while the check runs. The file is restored byte for byte (verified by
 *    hash) on success, on failure, on a timeout and on SIGINT, SIGTERM or SIGHUP, and packages/shared/dist is then
 *    rebuilt so it cannot keep the temporary marker. SIGKILL or a crash cannot be intercepted: if that happens, run
 *    `git diff packages/shared/src/contracts/domain.schema.ts`, undo the "dev-runner check" message change, and run
 *    `pnpm --filter @edutech/shared build`.
 *  - It takes about a minute. The API port is CHECK_API_PORT (default 4010).
 *
 * WHAT IT CHECKS
 *  1. Starts the runner and waits for the API (GET /health): exactly one API start and one API process.
 *  2. Runtime-only change: changes the validation MESSAGE of LoginSchema (a string literal; its emitted type
 *     declaration block stays the same) and waits for the running API to answer POST /api/v1/auth/login with the new,
 *     random marker message. The endpoint is public and rejects the payload before touching the database. Asserts:
 *       - the LoginSchema type declaration is unchanged and does not contain the marker;
 *       - the runner logged exactly one restart for the edit (so the restart came from the runner);
 *       - the API serves the original message again after the file is restored, and the restore logged a second restart.
 *     After the last edit and a quiet period it asserts that:
 *       - the runner restarted the API exactly twice (edit and restore);
 *       - the API started at least twice (once per edit) and its start count then stays constant (no restart loop);
 *       - exactly one API process is running.
 *     The API may START more often than the runner restarts it. Extra starts were seen in some earlier runs; their cause
 *     is unknown. Nest's own watcher is observed to log a change detection for shared edits at about the same time as
 *     the runner's restart, but that is not established as the cause. Extra starts are reported as a NOTE, not failed.
 *  3. Sends the chosen signal to the runner and asserts that it exits, that no process of its tree is left, and that
 *     the API port is closed.
 *  4. Verifies that the source file is restored and that packages/shared/dist contains no trace of the marker.
 *
 * --skip-edit runs only steps 1 and 3.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const signalName = (args.find((a) => a.startsWith('--signal=')) ?? '--signal=SIGTERM').split('=')[1];
const skipEdit = args.includes('--skip-edit');
const port = process.env.CHECK_API_PORT ?? '4010';
const base = `http://127.0.0.1:${port}`;
const schemaFile = path.join(root, 'packages/shared/src/contracts/domain.schema.ts');
const distDir = path.join(root, 'packages/shared/dist');
const declFile = path.join(distDir, 'contracts/domain.schema.d.ts');
const jsFile = path.join(distDir, 'contracts/domain.schema.js');
const RESTART_LOG = '@edutech/shared runtime output changed; restarting the API';
const ORIGINAL_MESSAGE = 'Personnel code is required';
const PROBE_TIMEOUT_MS = 5_000; // upper bound for every single HTTP request of the check

if (!['SIGTERM', 'SIGINT', 'SIGHUP'].includes(signalName)) throw new Error(`Unsupported signal ${signalName}`);

// A closed terminal (SIGHUP) can make writes to stdout/stderr fail; that must not stop the cleanup.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const say = (text, log = console.log) => {
  try {
    log(text);
  } catch {
    // terminal gone
  }
};
const ok = (msg) => say(`PASS  ${msg}`);
const note = (msg) => say(`NOTE  ${msg}`);

let output = '';
const timeline = [];
let runner = null;
let runnerExit = null;
let originalSource = null; // Buffer of the file before the temporary edit
let markerUsed = null; // the temporary message, once it has been written to the source file
let distConfirmedOriginal = false; // true once the API has been seen serving the restored message
let restoreFailed = false;
let failed = false;

function fail(message) {
  failed = true;
  say(`FAIL  ${message}`, console.error);
}

function restoreSource() {
  if (originalSource === null) return;
  fs.writeFileSync(schemaFile, originalSource);
  if (sha(fs.readFileSync(schemaFile)) !== sha(originalSource)) throw new Error('Restoring the shared source failed');
  originalSource = null;
}

function distHasMarker(marker) {
  try {
    return fs
      .readdirSync(distDir, { recursive: true })
      .map((f) => path.join(distDir, String(f)))
      .some((f) => fs.statSync(f).isFile() && fs.readFileSync(f, 'utf8').includes(marker));
  } catch {
    return false;
  }
}

function rebuildShared() {
  const r = spawnSync('pnpm', ['--filter', '@edutech/shared', 'build'], { cwd: root, encoding: 'utf8', timeout: 180_000 });
  if (r.status !== 0) throw new Error(`Rebuilding @edutech/shared failed: ${String(r.stderr || r.stdout || r.error).slice(-500)}`);
}

async function stopRunner() {
  if (!runner || runner.exitCode !== null || runner.signalCode !== null) return;
  process.kill(runner.pid, 'SIGTERM');
  const exited = await Promise.race([runnerExit, sleep(30_000).then(() => null)]);
  if (exited === null) {
    process.kill(runner.pid, 'SIGKILL');
    fail('The runner did not stop within 30 s and was killed; its child processes may still be running');
  }
}

let cleanupPromise = null;
/** Idempotent: restore the source first, stop the runner, then make sure packages/shared/dist has no marker. */
function cleanup() {
  cleanupPromise ??= (async () => {
    try {
      restoreSource();
    } catch (error) {
      restoreFailed = true;
      fail(error.message);
    }
    try {
      await stopRunner();
    } catch (error) {
      fail(`Stopping the runner failed: ${error.message}`);
    }
    if (markerUsed && !restoreFailed) {
      try {
        // After an interrupted or failed check tsc may have been stopped mid-emit, so always rebuild unless the API was
        // already seen serving the restored message; and rebuild if any trace of the marker is found.
        if (!distConfirmedOriginal || distHasMarker(markerUsed)) {
          note('rebuilding @edutech/shared so packages/shared/dist matches the restored source');
          rebuildShared();
        }
        if (distHasMarker(markerUsed)) throw new Error('packages/shared/dist still contains the temporary marker');
        const js = fs.readFileSync(jsFile, 'utf8');
        if (!js.includes(ORIGINAL_MESSAGE)) throw new Error('packages/shared/dist lost the original LoginSchema message');
        ok('packages/shared/dist contains no trace of the temporary marker');
      } catch (error) {
        fail(error.message);
      }
    }
  })();
  return cleanupPromise;
}

function processes() {
  const out = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid=,stat=,args='], { encoding: 'utf8' }).stdout;
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], stat: m[4], args: m[5] }));
}

function descendants(rootPid) {
  const all = processes();
  const found = [];
  const queue = [rootPid];
  while (queue.length) {
    const parent = queue.shift();
    for (const p of all) if (p.ppid === parent && !found.some((f) => f.pid === p.pid)) (found.push(p), queue.push(p.pid));
  }
  return found;
}

const apiProcesses = () => descendants(runner.pid).filter((p) => /^node\b/.test(p.args) && /apps\/api\/src\/main/.test(p.args));
const apiStarts = () => (output.match(/Nest application successfully started/g) ?? []).length;

/** Polls `fn` until it returns something truthy. Neither a slow `fn` nor a slow request can outlive `timeoutMs`. */
async function waitFor(what, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(deadline - Date.now(), 0);
  while (remaining() > 0) {
    try {
      const result = await Promise.race([fn(), sleep(remaining()).then(() => null)]);
      if (result) return result;
    } catch {
      // not ready yet
    }
    await sleep(Math.min(500, remaining()));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Every HTTP request of the check goes through here, so none can hang past PROBE_TIMEOUT_MS. */
const http = (pathname, init) => fetch(`${base}${pathname}`, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });

async function loginMessage() {
  const res = await http('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personnelCode: '', password: 'x' }),
  });
  const text = await res.text();
  return res.status === 400 ? text : null;
}

/** The emitted type declaration of LoginSchema. (Only this block is compared: it is the declaration the edit must not change.) */
function loginDeclaration() {
  const text = fs.readFileSync(declFile, 'utf8');
  const start = text.indexOf('export declare const LoginSchema');
  if (start < 0) throw new Error('LoginSchema declaration not found');
  const end = text.indexOf('\nexport declare', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}
const runnerRestarts = () => output.split(RESTART_LOG).length - 1;

function describeDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    note(`API database: ${url.hostname}:${url.port || '5432'}${url.pathname} (from DATABASE_URL; must be a disposable or test database)`);
  } catch {
    note('DATABASE_URL is not set in the environment; the API will use its .env files (must be a disposable or test database)');
  }
}

async function main() {
  describeDatabase();
  runner = spawn('node', ['scripts/dev-api.mjs'], {
    cwd: root,
    env: { ...process.env, API_PORT: port, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const t0 = Date.now();
  for (const stream of [runner.stdout, runner.stderr]) {
    stream.on('data', (d) => {
      const text = d.toString();
      output += text;
      for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
        if (/successfully started|runtime output changed|Found \d+ errors|Starting compilation|File change detected/.test(line)) {
          timeline.push(`${String(Date.now() - t0).padStart(7)}ms  ${line.replace(/^.*?(LOG\]|\])\s*/, '').slice(0, 90)}`);
        }
      }
    });
  }
  runnerExit = new Promise((resolve) => runner.once('exit', (code, signal) => resolve({ code, signal })));

  await waitFor('the API to answer /health', async () => (await http('/health')).status === 200, 180_000);
  ok('runner built shared and the API answers /health');
  if (apiStarts() !== 1) throw new Error(`Expected 1 API start, saw ${apiStarts()}`);
  if (apiProcesses().length !== 1) throw new Error(`Expected 1 API process, saw ${apiProcesses().length}`);
  const baseline = await loginMessage();
  if (!baseline?.includes(ORIGINAL_MESSAGE)) throw new Error(`Unexpected baseline response: ${baseline}`);
  ok('baseline: exactly one API process; login validation serves the original message');

  if (!skipEdit) {
    const declBefore = loginDeclaration();
    originalSource = fs.readFileSync(schemaFile);
    const text = originalSource.toString('utf8');
    const needle = `'${ORIGINAL_MESSAGE}'`;
    if (text.split(needle).length !== 2) throw new Error('Expected the LoginSchema message exactly once');
    const marker = `Personnel code is required (dev-runner check ${crypto.randomBytes(4).toString('hex')})`;
    const startsBefore = apiStarts();
    markerUsed = marker;
    fs.writeFileSync(schemaFile, text.replace(needle, `'${marker}'`));

    await waitFor('the API to serve the edited message', async () => (await loginMessage())?.includes(marker), 120_000);
    ok('runtime-only edit: the running API restarted and serves the new message');
    if (loginDeclaration() !== declBefore || fs.readFileSync(declFile, 'utf8').includes(marker)) {
      throw new Error('The type declaration of LoginSchema changed; this was not a runtime-only edit');
    }
    if (runnerRestarts() !== 1) throw new Error(`Expected the runner to log 1 restart, saw ${runnerRestarts()}`);
    ok('the LoginSchema type declaration is unchanged and the restart was initiated by the runner');

    restoreSource();
    await waitFor('the API to serve the original message again', async () => {
      const m = await loginMessage();
      return m?.includes(ORIGINAL_MESSAGE) && !m.includes(marker);
    }, 120_000);
    distConfirmedOriginal = true;
    ok('after restoring the file byte for byte, the API serves the original message again');

    await sleep(10_000); // quiet period: any restart loop would show up now
    const startsAfterQuiet = apiStarts();
    await sleep(8_000);
    say(timeline.join('\n'));
    // Required: the runner restarted the API for each edit, the API started at least once per edit, the start count has
    // settled (no loop) and exactly one API process runs. Not required: that starts equal runner restarts. Extra starts
    // have been observed and their cause is unknown, so they are reported below instead of being failed or explained.
    if (runnerRestarts() !== 2) throw new Error(`Expected 2 runner restarts (edit, restore), saw ${runnerRestarts()}`);
    if (apiStarts() - startsBefore < 2) throw new Error('Expected at least 2 API starts for 2 edits');
    if (apiStarts() !== startsAfterQuiet) throw new Error('The API kept restarting after the last edit (loop)');
    if (apiProcesses().length !== 1) throw new Error(`Expected 1 API process, saw ${apiProcesses().length}`);
    ok(`2 runner restarts, ${apiStarts() - startsBefore} API starts, settled (no loop), exactly one API process`);
    if (apiStarts() - startsBefore > 2) {
      note(`${apiStarts() - startsBefore} API starts for 2 runner restarts: extra starts occurred (cause unknown); see the timeline above`);
    }
  }

  const tree = descendants(runner.pid);
  const groups = new Set(tree.map((p) => p.pgid));
  say(`      process tree before ${signalName}: ${tree.length} processes in ${groups.size} groups`);
  process.kill(runner.pid, signalName);
  const exit = await Promise.race([runnerExit, sleep(30_000).then(() => 'timeout')]);
  if (exit === 'timeout') throw new Error(`The runner did not exit after ${signalName}`);
  await sleep(500);
  const alive = processes().filter((p) => tree.some((t) => t.pid === p.pid) && !p.stat.startsWith('Z'));
  const groupMembers = processes().filter((p) => groups.has(p.pgid) && !p.stat.startsWith('Z'));
  if (alive.length || groupMembers.length) {
    throw new Error(`Orphans after ${signalName}: ${[...alive, ...groupMembers].map((p) => `${p.pid} ${p.args.slice(0, 60)}`).join(' | ')}`);
  }
  // Only a refused connection proves the port is closed; a timeout or any other error means something may still listen.
  let portClosed = false;
  try {
    await http('/health');
  } catch (error) {
    portClosed = error?.cause?.code === 'ECONNREFUSED';
  }
  if (!portClosed) throw new Error('The API port is not confirmed closed after shutdown');
  ok(`${signalName}: the runner exited (code ${exit.code}), no process of its tree is left, the API port is closed`);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    say(`Received ${sig}: restoring the shared source and cleaning up`, console.error);
    void cleanup().finally(() => process.exit(130));
  });
}

try {
  await main();
} catch (error) {
  fail(error.message);
  say(output.split('\n').slice(-25).join('\n'), console.error);
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
