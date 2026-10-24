#!/usr/bin/env node
/**
 * Development runner for the API (`pnpm --filter @edutech/api dev`).
 *
 * The API loads @edutech/shared at runtime through the package's compiled entry (packages/shared/dist/index.js),
 * and `dist` is not checked in. So this script
 *   1. builds @edutech/shared (a clean checkout has no dist) before anything else starts,
 *   2. keeps it compiling (`tsc --watch`) so edits under packages/shared/src reach dist, and
 *   3. runs `nest start --watch` for the API's own sources.
 *
 * Restarting on shared changes: Nest's watcher only sees the emitted .d.ts files of shared, so a change that
 * only touches runtime code (a function body, a validation message) would leave the API running stale logic.
 * The runner therefore also watches the emitted .js files of shared itself: it polls them, waits until they have
 * stopped changing (so a half-written emit is never loaded), compares a content hash, and only when the content
 * really changed stops the whole Nest process tree and starts a fresh one. A rewrite with identical content (tsc's
 * initial emit, a touch) does not restart anything. Restarts never overlap, and Nest is only started again after
 * the previous tree is gone and only while no shutdown is under way, so there is never more than one API.
 *
 * Shutdown: SIGINT, SIGTERM and SIGHUP (terminal closed) all take the same idempotent path. Every child process
 * group (pnpm -> tsc / nest -> the API) gets SIGTERM, repeated while the group lives, and SIGKILL if it is still
 * there after a few seconds; the runner exits only once every group has been seen empty. A group is tracked until
 * then even when its leader has already exited (a slow API can outlive the pnpm process that started it), and a stop
 * that is already running for a group (a restart) is joined by the shutdown, not repeated. Signals that arrive while
 * a shutdown is running are ignored.
 *
 * Node version: the minimum is the "engines.node" of the root package.json (">=X.Y.Z"). The runner lists the files
 * emitted by @edutech/shared recursively (fs.readdirSync with { recursive: true }, which older Node versions ignore
 * silently), so it refuses to start on an older Node instead of missing nested shared files. The guard needs Node 14.8
 * or later to run at all (top-level await); older versions fail with a SyntaxError.
 *
 * Platform notes: supported and verified on Linux only; macOS is untested; native Windows is not supported (use WSL2).
 * Process-tree cleanup relies on POSIX process groups, so a child that outlives its group leader is still found and
 * killed. Windows has no process groups. Its branch kills the tree with `taskkill /T /F` only while the leader is
 * alive: `taskkill /T` walks the tree from a live process and cannot find the descendants of one that has exited
 * (documented by libraries such as execa; not verified on Windows by this project), and an exited PID may already
 * belong to an unrelated process, so calling it with that PID could kill the wrong tree. On Windows a child that
 * outlives its leader is therefore not cleaned up. SIGKILL of the runner itself cannot be intercepted and leaves
 * its children running.
 *
 * Extra arguments are passed through to `nest start` (for example `--debug`).
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function requireSupportedNode() {
  let declared;
  try {
    declared = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines?.node;
  } catch (error) {
    console.error(`[dev-api] Cannot read ${path.join(root, 'package.json')} to check the Node.js version: ${error.message}`);
    process.exit(1);
  }
  const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(String(declared ?? '').trim());
  if (!match) {
    console.error(
      `[dev-api] Cannot determine the minimum Node.js version: expected "engines.node" in package.json to look like ">=22.0.0", found ${JSON.stringify(declared)}.`,
    );
    process.exit(1);
  }
  const minimum = match.slice(1).map(Number);
  const current = process.versions.node.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] > minimum[i]) return;
    if (current[i] < minimum[i]) {
      console.error(
        `[dev-api] Node.js ${process.versions.node} is not supported: this repository requires Node.js >= ${minimum.join('.')} ` +
          '(package.json "engines.node"). The runner lists the files emitted by @edutech/shared recursively, and older Node ' +
          'versions ignore that option silently, so edits to nested shared files would never restart the API. ' +
          'Upgrade Node.js (Node 22 LTS is recommended) and run the command again.',
      );
      process.exit(1);
    }
  }
}
requireSupportedNode();

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const windows = process.platform === 'win32';
const sharedDist = path.join(root, 'packages', 'shared', 'dist');
const POLL_MS = 400;
const STOP_GRACE_MS = 5000;

// On POSIX each child runs in its own process group so stopping it also stops the processes it spawned
// (pnpm -> nest -> the API itself); otherwise a plain SIGTERM would leave the API running.
const options = { cwd: root, stdio: 'inherit', shell: windows, detached: !windows };
const nestArgs = ['--filter', '@edutech/api', 'exec', 'nest', 'start', '--watch', ...process.argv.slice(2)];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Children whose process group may still have members. A child stays here until its group has been seen empty,
 * even after the leader itself exited: that is what lets a shutdown clean up a group that a restart was still stopping.
 */
const groups = new Set();

function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // already gone
  }
}

function groupAlive(child) {
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const groupGone = (child) => windows || child.pid === undefined || !groupAlive(child);

function launch(args) {
  const child = spawn(pnpm, args, options);
  child.expected = false; // set before an intentional stop, so its exit is not treated as a crash
  child.stopPromise = null;
  child.done = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      // The leader is gone; members of its group may not be. Keep the group until it is seen empty.
      if (groupGone(child)) groups.delete(child);
      resolve({ code, signal });
    });
    child.once('error', (error) => {
      groups.delete(child);
      console.error(`[dev-api] Failed to start a child process: ${error.message}`);
      resolve({ code: 1, signal: null });
    });
  });
  groups.add(child);
  return child;
}

/** Stops a child and everything it started. Single-flight per child: a second caller joins the first stop. */
function stopTree(child) {
  if (!child.stopPromise) child.stopPromise = stopTreeOnce(child);
  return child.stopPromise;
}

/** Returns once the whole group is gone (or SIGKILL was sent and waited for). */
async function stopTreeOnce(child) {
  child.expected = true;
  try {
    if (child.pid === undefined) return;
    if (windows) {
      // Only while the leader is alive, on purpose: see the platform notes at the top of this file.
      if (child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      await child.done;
      return;
    }
    const deadline = Date.now() + STOP_GRACE_MS;
    // Repeat the SIGTERM while the group lives: Nest may be spawning a new API at the very moment it is told to stop,
    // and that new process must not miss the signal.
    do {
      signalGroup(child, 'SIGTERM');
      for (let waited = 0; waited < 250 && groupAlive(child); waited += 50) await sleep(50);
    } while (groupAlive(child) && Date.now() < deadline);
    if (groupAlive(child)) {
      signalGroup(child, 'SIGKILL');
      const killDeadline = Date.now() + 2000;
      while (groupAlive(child) && Date.now() < killDeadline) await sleep(50);
    }
  } finally {
    groups.delete(child);
  }
}

let shuttingDown = false;
let shutdownPromise = null;
/** Idempotent: the first call does the work, later calls (more signals, a child exiting meanwhile) share it. */
function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    // Every group still known: running children, groups whose leader already exited, and groups a restart is stopping.
    while (groups.size > 0) await Promise.all([...groups].map(stopTree));
    process.exit(code);
  })();
  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void shutdown(0));
// Last resort if the runner itself dies abnormally (uncaught exception): do not leave the groups behind.
process.on('exit', () => {
  if (windows) return;
  for (const child of groups) signalGroup(child, 'SIGKILL');
});

function supervise(child, name) {
  void child.done.then(({ code, signal }) => {
    if (child.expected || shuttingDown) return;
    console.error(`[dev-api] ${name} stopped unexpectedly; stopping the other processes.`);
    void shutdown(code ?? (signal ? 1 : 0));
  });
}

// 1. Build shared before anything else (a clean checkout has no dist).
const build = launch(['--filter', '@edutech/shared', 'build']);
const built = await build.done;
if (shuttingDown) await shutdownPromise;
if (built.code !== 0) {
  console.error('[dev-api] Building @edutech/shared failed; not starting the API.');
  process.exit(built.code ?? 1);
}

// 2. Keep shared compiling, and 3. run the API.
const tsc = launch(['--filter', '@edutech/shared', 'exec', 'tsc', '--watch', '--preserveWatchOutput']);
supervise(tsc, 'The shared TypeScript watcher');
let nest = launch(nestArgs);
supervise(nest, 'Nest');

// Restart Nest when the runtime JavaScript emitted by shared changes.
function sharedJsFiles() {
  try {
    return fs
      .readdirSync(sharedDist, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.js'))
      .sort();
  } catch {
    return [];
  }
}

function signature() {
  return sharedJsFiles()
    .map((file) => {
      try {
        const stat = fs.statSync(path.join(sharedDist, file));
        return `${file}:${stat.size}:${stat.mtimeMs}`;
      } catch {
        return `${file}:gone`;
      }
    })
    .join('\n');
}

function contentHash() {
  const hash = crypto.createHash('sha256');
  for (const file of sharedJsFiles()) {
    hash.update(file);
    try {
      hash.update(fs.readFileSync(path.join(sharedDist, file)));
    } catch {
      hash.update('gone');
    }
  }
  return hash.digest('hex');
}

let appliedHash = contentHash(); // what the running API was started with
let lastSignature = signature();
let checkedSignature = lastSignature;
let restarting = false;

setInterval(async () => {
  if (shuttingDown || restarting) return;
  const current = signature();
  if (current !== lastSignature) {
    lastSignature = current; // still being written: wait for a quiet poll before looking at the content
    return;
  }
  if (current === checkedSignature) return;
  checkedSignature = current;
  const hash = contentHash();
  if (hash === appliedHash) return;
  appliedHash = hash;
  restarting = true;
  try {
    console.log('[dev-api] @edutech/shared runtime output changed; restarting the API.');
    await stopTree(nest);
    if (!shuttingDown) {
      nest = launch(nestArgs);
      supervise(nest, 'Nest');
    }
  } finally {
    restarting = false;
  }
}, POLL_MS);
