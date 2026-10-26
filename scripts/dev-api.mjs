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
 * Process-tree cleanup, in two layers:
 *  - POSIX: each child is a process group leader, so a signal reaches every member, even after the leader exited.
 *  - Everywhere (and the only mechanism on Windows, which has no process groups): the lifeline. Each child process tree
 *    gets a private local socket (a unix socket, or a named pipe on Windows) and scripts/dev-lifeline.js is preloaded
 *    into every Node.js process of the tree through NODE_OPTIONS. Every guarded process connects, reports its pid and
 *    exits when the connection ends. To stop a tree the runner closes its side; the runner dying, even by SIGKILL, has
 *    the same effect. The open connections also tell the runner which processes of a tree are still alive, so it never
 *    has to look up descendants of a parent that has exited, and a straggler that cannot react (a blocked event loop)
 *    is killed by the pid it reported: an open connection proves that pid still belongs to that process. `taskkill`
 *    is only ever called for a leader the runner still holds a handle to, or for such a proven-alive straggler.
 *    Limits: only Node.js processes are guarded (the `cmd.exe` that `pnpm.cmd` runs through is not, but it exits
 *    with its child); NODE_OPTIONS must reach the children (it does through pnpm and the Nest CLI); and a process
 *    that is blocked cannot exit on its own, so it falls back to the kill above after a grace period.
 *
 * Platform notes: verified on Linux (see tests/unit/dev-runner-shutdown.spec.ts and scripts/check-dev-runner.mjs).
 * macOS and native Windows are NOT verified yet: the Windows path (named pipe lifeline, `taskkill` for a live leader or
 * a proven-alive straggler) is implemented, and the same tests run unchanged on Windows, but they have not been run
 * there. EDUTECH_DEV_RUNNER_NO_GROUPS=1 makes a POSIX machine use the Windows cleanup path (the tests use it).
 *
 * Extra arguments are passed through to `nest start` (for example `--debug`).
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
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
// Process groups are the POSIX mechanism; without them (Windows, or EDUTECH_DEV_RUNNER_NO_GROUPS=1 to exercise that
// path on POSIX) the lifeline is the only way to reach descendants.
const noGroups = windows || process.env.EDUTECH_DEV_RUNNER_NO_GROUPS === '1';
const sharedDist = path.join(root, 'packages', 'shared', 'dist');
const POLL_MS = 400;
const STOP_GRACE_MS = 5000;
const LIFELINE_GRACE_MS = 3000; // without groups: how long released processes get to exit by themselves before a kill
const guardFile = path.join(root, 'scripts', 'dev-lifeline.js');

const nestArgs = ['--filter', '@edutech/api', 'exec', 'nest', 'start', '--watch', ...process.argv.slice(2)];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await sleep(50);
  return condition();
}

/**
 * Lifeline: one private local socket per child process tree (see the header). Every Node.js process of the tree runs
 * scripts/dev-lifeline.js, connects here and reports its pid. A connection stays open exactly as long as its process
 * lives, which is what `members` reflects.
 */
let socketDir = null; // POSIX: directory of the unix sockets, created on first use and removed when the runner exits
let lifelineCount = 0;

/** A runner that was SIGKILLed cannot remove its socket directory: remove the ones whose runner (named in it) is gone. */
function removeStaleSocketDirs() {
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      const pid = Number(/^edutech-dev-(\d+)-/.exec(name)?.[1]);
      if (!Number.isSafeInteger(pid) || pid === process.pid) continue;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
      }
    }
  } catch {
    // best effort
  }
}
const NO_LIFELINE = { env: {}, size: () => 0, livePids: () => [], release() {} };

function makeSocketDir() {
  removeStaleSocketDirs();
  return fs.mkdtempSync(path.join(os.tmpdir(), `edutech-dev-${process.pid}-`));
}

function createLifeline() {
  if (!fs.existsSync(guardFile)) return NO_LIFELINE;
  lifelineCount += 1;
  const address = windows
    ? `\\\\.\\pipe\\edutech-dev-${process.pid}-${lifelineCount}`
    : path.join((socketDir ??= makeSocketDir()), `${lifelineCount}.sock`);
  const members = new Map(); // socket -> { pid }
  let released = false;
  const server = net.createServer((socket) => {
    if (released) {
      socket.destroy();
      return;
    }
    const entry = { pid: null, buffered: '' };
    members.set(socket, entry);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      if (entry.pid !== null) return;
      entry.buffered += chunk;
      const end = entry.buffered.indexOf('\n');
      const pid = Number(end >= 0 ? entry.buffered.slice(0, end) : NaN);
      if (Number.isSafeInteger(pid) && pid > 0) entry.pid = pid;
    });
    socket.on('close', () => members.delete(socket));
    socket.on('error', () => {});
  });
  server.on('error', () => {});
  server.listen(address); // binds synchronously: the address exists before the child is started
  if (!server.listening) {
    console.error('[dev-api] Could not create the process lifeline; this process tree will not be guarded.');
    return NO_LIFELINE;
  }
  // Forward slashes: NODE_OPTIONS treats a backslash inside quotes as an escape character.
  const guard = guardFile.split(path.sep).join('/');
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --require "${guard}"`.trim();
  return {
    env: { EDUTECH_DEV_LIFELINE: address, NODE_OPTIONS: nodeOptions },
    size: () => members.size,
    /** Pids of processes that are connected right now, hence alive: a pid that is certain to be theirs. */
    livePids: () => [...members.values()].map((entry) => entry.pid).filter((pid) => pid !== null),
    /** Ends the tree: stops listening (a process that starts late finds nobody and exits) and closes every connection. */
    release() {
      if (released) return;
      released = true;
      server.close();
      for (const socket of members.keys()) socket.end();
    },
  };
}

// On POSIX each child runs in its own process group so stopping it also stops the processes it spawned
// (pnpm -> nest -> the API itself); otherwise a plain SIGTERM would leave the API running.
const spawnOptions = (lifeline) => ({
  cwd: root,
  stdio: 'inherit',
  shell: windows,
  detached: !noGroups,
  env: { ...process.env, ...lifeline.env },
});

/**
 * Children whose process tree may still have members. A child stays here until its tree has been seen empty, even
 * after the leader itself exited: that is what lets a shutdown clean up a tree that a restart was still stopping.
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

/** The tree is gone: no process group member (POSIX) or no connected guarded process (lifeline). */
const groupGone = (child) => child.pid === undefined || (noGroups ? child.lifeline.size() === 0 : !groupAlive(child));

const leaderRunning = (child) => child.exitCode === null && child.signalCode === null;

function forget(child) {
  groups.delete(child);
  child.lifeline.release();
}

function launch(args) {
  const lifeline = createLifeline();
  const child = spawn(pnpm, args, spawnOptions(lifeline));
  child.lifeline = lifeline;
  child.expected = false; // set before an intentional stop, so its exit is not treated as a crash
  child.stopPromise = null;
  child.done = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      // The leader is gone; members of its tree may not be. Keep the tree until it is seen empty.
      if (groupGone(child)) forget(child);
      resolve({ code, signal });
    });
    child.once('error', (error) => {
      forget(child);
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

function taskkill(pid) {
  spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
}

/**
 * Stops a tree without process groups. Nothing here ever looks up the descendants of a parent that has exited, and
 * `taskkill` is only used on a pid that is certain to belong to the intended process:
 *  1. Release the lifeline: every guarded process exits by itself (this is what reaches a process whose parent is gone).
 *  2. A leader that is still running (the runner holds its process handle, so its pid cannot have been reused) gets
 *     `taskkill /T /F`, which walks the tree from a live process.
 *  3. A member whose connection is still open after that is alive, so the pid it reported is its own: kill it.
 */
async function stopWithoutGroups(child) {
  const lifeline = child.lifeline;
  const treeGone = () => lifeline.size() === 0 && !leaderRunning(child);
  lifeline.release();
  await waitFor(treeGone, LIFELINE_GRACE_MS);
  if (leaderRunning(child)) taskkill(child.pid);
  await waitFor(treeGone, 2000);
  for (const pid of lifeline.livePids()) taskkill(pid);
  if (!(await waitFor(() => lifeline.size() === 0, 2000))) {
    console.error('[dev-api] Some processes of a stopped process tree are still running; they may keep a port open.');
  }
}

/** POSIX: returns once the whole group is gone (or SIGKILL was sent and waited for). */
async function stopWithGroups(child) {
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
}

async function stopTreeOnce(child) {
  child.expected = true;
  try {
    if (child.pid === undefined) return;
    await (noGroups ? stopWithoutGroups(child) : stopWithGroups(child));
  } finally {
    forget(child);
  }
}

let shuttingDown = false;
let shutdownPromise = null;
/** Idempotent: the first call does the work, later calls (more signals, a child exiting meanwhile) share it. */
function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    // Every tree still known: running children, trees whose leader already exited, and trees a restart is stopping.
    while (groups.size > 0) await Promise.all([...groups].map(stopTree));
    process.exit(code);
  })();
  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void shutdown(0));
// Last resort if the runner itself dies abnormally (uncaught exception): do not leave the groups behind. (Without
// groups the lifeline connections close with this process, which ends the guarded processes.)
process.on('exit', () => {
  if (!noGroups) for (const child of groups) signalGroup(child, 'SIGKILL');
  if (socketDir) fs.rmSync(socketDir, { recursive: true, force: true });
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
