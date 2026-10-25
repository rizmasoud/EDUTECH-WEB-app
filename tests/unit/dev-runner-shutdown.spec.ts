/**
 * Regression tests for the API development runner (scripts/dev-api.mjs): shutdown and Node version handling.
 *
 * Isolated: the real runner is copied into a temporary directory next to a FAKE `pnpm` (a bash script put first on
 * PATH). No database, no network, no real Nest or TypeScript watcher, and nothing in the repository is touched.
 * The fake Nest is a group leader that exits as soon as it receives SIGTERM, with a group member that IGNORES
 * SIGTERM, which is the shape of a slow API that outlives the pnpm process that started it.
 *
 * The process-group tests need POSIX process groups and bash, so they are skipped on Windows.
 *
 * The lifeline tests (the "dev runner lifeline" and "dev lifeline guard" suites) use a fake `pnpm` written in Node.js
 * and run on every platform, Windows included. On POSIX they run twice: once with process groups, once with
 * EDUTECH_DEV_RUNNER_NO_GROUPS=1, which makes the runner use the cleanup path that Windows uses. Nothing here has been
 * run on Windows yet: only the Linux results are verified. On Windows run exactly:
 *   pnpm exec tsx --tsconfig apps/api/tsconfig.json --test tests/unit/dev-runner-shutdown.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const posixOnly = process.platform === 'win32' ? 'POSIX process groups and bash are required' : false;

const FAKE_PNPM = `#!/usr/bin/env bash
case "$*" in
  *"@edutech/shared build"*) exit 0 ;;
  *"exec tsc"*) exec sleep 3600 ;;
  *"exec nest"*)
    echo "nest-start" >> "$FAKE_DIR/events.log"
    echo "$$" >> "$FAKE_DIR/leaders.pids"
    ( trap '' TERM; exec sleep 30 ) &
    echo "$!" >> "$FAKE_DIR/members.pids"
    trap 'exit 0' TERM
    while true; do sleep 0.2; done ;;
esac
`;

/** Node.js fake `pnpm` (runs on Windows too); each started "Nest" leader starts one member process (FAKE_MEMBER_JS). */
const FAKE_PNPM_NODE = `#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.FAKE_DIR;
const args = process.argv.slice(2).join(' ');
const log = (name, text) => fs.appendFileSync(path.join(dir, name), text + '\\n');
if (args.includes('@edutech/shared build')) {
  process.exit(0);
} else if (args.includes('exec tsc')) {
  setInterval(() => {}, 1000);
} else if (args.includes('exec nest')) {
  log('events.log', 'nest-start');
  log('leaders.pids', String(process.pid));
  const member = spawn(process.execPath, [path.join(dir, 'bin', 'member.js')], { stdio: 'ignore' });
  log('members.pids', String(member.pid));
  const exitFile = path.join(dir, 'leader-exit-' + process.pid);
  setInterval(() => { if (fs.existsSync(exitFile)) process.exit(0); }, 100);
}
`;

/** The member: ignores SIGTERM; with FAKE_MEMBER=blocked it blocks its event loop after 2 s and can no longer react. */
const FAKE_MEMBER_JS = `process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
if (process.env.FAKE_MEMBER === 'blocked') setTimeout(() => { for (;;) {} }, 2000);
setTimeout(() => process.exit(0), 120000);
`;

/** POSIX stand-in for Windows' taskkill (only used with EDUTECH_DEV_RUNNER_NO_GROUPS=1): logs its call, kills the pid. */
const FAKE_TASKKILL = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.FAKE_DIR, 'taskkill.log'), args.join(' ') + '\\n');
const i = args.findIndex((a) => a.toLowerCase() === '/pid');
if (i >= 0) { try { process.kill(Number(args[i + 1]), 'SIGKILL'); } catch {} }
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  const stat = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  return stat !== '' && !stat.startsWith('Z');
}

async function waitUntil(what: string, condition: () => boolean, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (condition()) return;
    await sleep(50);
  }
  assert.fail(`Timed out waiting for ${what}`);
}

class Sandbox {
  readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-runner-spec-'));
  readonly runner = path.join(this.dir, 'scripts', 'dev-api.mjs');
  private process: ChildProcess | null = null;
  output = '';
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> = Promise.resolve({ code: null, signal: null });

  /**
   * `engines` is what the sandbox's package.json declares: by default the repository's own, `null` for no "engines"
   * field at all. (A plain `undefined` would silently select the default, so "missing" is spelled `null`.)
   */
  constructor(
    engines: { node?: string } | null = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).engines,
    private readonly options: { node?: boolean; env?: Record<string, string> } = {},
  ) {
    fs.mkdirSync(path.join(this.dir, 'scripts'));
    fs.mkdirSync(path.join(this.dir, 'bin'));
    fs.mkdirSync(path.join(this.dir, 'packages/shared/dist'), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, 'scripts/dev-api.mjs'), this.runner); // the real runner, byte for byte
    fs.copyFileSync(path.join(repoRoot, 'scripts/dev-lifeline.js'), path.join(this.dir, 'scripts', 'dev-lifeline.js'));
    fs.writeFileSync(path.join(this.dir, 'package.json'), JSON.stringify(engines === null ? {} : { engines }));
    fs.writeFileSync(path.join(this.dir, 'packages/shared/dist/a.js'), '// original\n');
    if (options.node) {
      fs.writeFileSync(path.join(this.dir, 'bin/fake-pnpm.js'), FAKE_PNPM_NODE);
      fs.writeFileSync(path.join(this.dir, 'bin/pnpm'), FAKE_PNPM_NODE, { mode: 0o755 });
      fs.writeFileSync(path.join(this.dir, 'bin/pnpm.cmd'), '@node "%~dp0fake-pnpm.js" %*\r\n');
      fs.writeFileSync(path.join(this.dir, 'bin/member.js'), FAKE_MEMBER_JS);
      if (process.platform !== 'win32') fs.writeFileSync(path.join(this.dir, 'bin/taskkill'), FAKE_TASKKILL, { mode: 0o755 });
    } else {
      fs.writeFileSync(path.join(this.dir, 'bin/pnpm'), FAKE_PNPM, { mode: 0o755 });
    }
  }

  private env() {
    return {
      ...process.env,
      ...this.options.env,
      FAKE_DIR: this.dir,
      PATH: `${path.join(this.dir, 'bin')}${path.delimiter}${process.env.PATH}`,
    };
  }

  start(): ChildProcess {
    const child = spawn(process.execPath, [this.runner], { cwd: this.dir, env: this.env(), stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (d) => (this.output += d.toString()));
    this.exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    this.process = child;
    return child;
  }

  /** Runs the runner to completion (for the cases where it must refuse to start). */
  runToExit() {
    return spawnSync(process.execPath, [this.runner], { cwd: this.dir, env: this.env(), encoding: 'utf8', timeout: 20_000 });
  }

  pids(name: 'leaders' | 'members'): number[] {
    try {
      return fs.readFileSync(path.join(this.dir, `${name}.pids`), 'utf8').split('\n').filter(Boolean).map(Number);
    } catch {
      return [];
    }
  }

  nestStarts(): number {
    try {
      return fs.readFileSync(path.join(this.dir, 'events.log'), 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  taskkillLog(): string {
    try {
      return fs.readFileSync(path.join(this.dir, 'taskkill.log'), 'utf8');
    } catch {
      return '';
    }
  }

  touchShared(): void {
    fs.appendFileSync(path.join(this.dir, 'packages/shared/dist/a.js'), `// changed ${Date.now()}\n`);
  }

  async exitWithin(ms: number) {
    const result = await Promise.race([this.exited, sleep(ms).then(() => 'timeout' as const)]);
    assert.notEqual(result, 'timeout', `the runner did not exit within ${ms} ms; output:\n${this.output}`);
    return result as { code: number | null; signal: NodeJS.Signals | null };
  }

  /** Always called: nothing of the fake tree may outlive the test, whatever happened. */
  dispose(): void {
    for (const pid of [...this.pids('members'), ...this.pids('leaders')]) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    if (this.process?.pid && this.process.exitCode === null) {
      try {
        process.kill(this.process.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

async function withSandbox(fn: (sandbox: Sandbox) => Promise<void>): Promise<void> {
  const sandbox = new Sandbox();
  try {
    await fn(sandbox);
  } finally {
    sandbox.dispose();
  }
}

describe('dev runner shutdown', { skip: posixOnly }, () => {
  it('SIGTERM during a restart still kills a group member that ignores SIGTERM after its leader exited', { timeout: 60_000 }, async () => {
    await withSandbox(async (sb) => {
      const runner = sb.start();
      await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 15_000);
      const [leader] = sb.pids('leaders');
      const [member] = sb.pids('members');

      sb.touchShared(); // runtime-only change in shared's output: the runner restarts Nest
      await waitUntil('the runner to start the restart', () => sb.output.includes('restarting the API'), 10_000);
      await waitUntil('the old group leader to exit on SIGTERM', () => !isAlive(leader), 5_000);
      // The exact race: leader gone, member still alive, restart still stopping the group, runner about to be signalled.
      assert.equal(isAlive(member), true, 'precondition: the member that ignores SIGTERM is still running');

      process.kill(runner.pid!, 'SIGTERM');
      const exit = await sb.exitWithin(20_000);

      assert.equal(exit.code, 0);
      await waitUntil('the member to be gone', () => !isAlive(member), 2_000);
      assert.equal(sb.nestStarts(), 1, 'no new Nest was started once shutdown had begun');
      assert.equal(sb.pids('members').length, 1);
    });
  });

  it('plain shutdown with repeated signals is idempotent and also kills a member that ignores SIGTERM', { timeout: 60_000 }, async () => {
    await withSandbox(async (sb) => {
      const runner = sb.start();
      await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 15_000);
      const [leader] = sb.pids('leaders');
      const [member] = sb.pids('members');

      for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.kill(runner.pid!, signal);
      const exit = await sb.exitWithin(20_000);

      assert.equal(exit.code, 0);
      await waitUntil('the member to be gone', () => !isAlive(member), 2_000);
      assert.equal(isAlive(leader), false);
      assert.equal(sb.nestStarts(), 1);
    });
  });

  it('a restart never overlaps two Nest process trees', { timeout: 60_000 }, async () => {
    await withSandbox(async (sb) => {
      const runner = sb.start();
      await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 15_000);
      const [oldLeader] = sb.pids('leaders');
      const [oldMember] = sb.pids('members');

      sb.touchShared();
      await waitUntil('the second Nest to start', () => sb.nestStarts() === 2, 30_000);
      assert.equal(isAlive(oldLeader), false, 'the old leader is gone when the new Nest starts');
      assert.equal(isAlive(oldMember), false, 'the old member (which ignores SIGTERM) is gone when the new Nest starts');
      await sleep(2_000);
      assert.equal(sb.nestStarts(), 2, 'one restart for one change, no loop');

      process.kill(runner.pid!, 'SIGTERM');
      assert.equal((await sb.exitWithin(20_000)).code, 0);
      for (const pid of sb.pids('members')) assert.equal(isAlive(pid), false);
    });
  });
});

describe('dev runner Node version guard', { skip: posixOnly }, () => {
  it('refuses to start on a Node older than engines.node, and says why, before starting anything', () => {
    const sb = new Sandbox({ node: '>=999.0.0' });
    try {
      const result = sb.runToExit();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Node\.js \d+\.\d+\.\d+ is not supported/);
      assert.match(result.stderr, />= 999\.0\.0/);
      assert.match(result.stderr, /recursive/);
      assert.equal(sb.nestStarts(), 0);
      assert.equal(fs.existsSync(path.join(sb.dir, 'events.log')), false);
    } finally {
      sb.dispose();
    }
  });

  it('fails loudly when engines.node is missing or not a ">=X.Y.Z" minimum', () => {
    for (const declared of [null, {}, { node: '^20.11.0' }, { node: '>=20' }]) {
      const sb = new Sandbox(declared);
      try {
        const result = sb.runToExit();
        assert.equal(result.status, 1, `engines=${JSON.stringify(declared)}`);
        assert.equal(sb.nestStarts(), 0, 'nothing was started');
        assert.match(result.stderr, /Cannot determine the minimum Node\.js version/);
      } finally {
        sb.dispose();
      }
    }
  });
});

describe('declared Node version', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const parse = (v: string) => v.match(/(\d+)\.(\d+)(?:\.(\d+))?/)!.slice(1).map((n) => Number(n ?? 0));
  const atLeast = (a: number[], b: number[]) => (a[0] - b[0] || a[1] - b[1] || (a[2] ?? 0) - (b[2] ?? 0)) >= 0;

  it('is a ">=X.Y.Z" minimum, the form the runner guard understands', () => {
    assert.match(rootPkg.engines?.node ?? '', /^>=\d+\.\d+\.\d+$/);
  });

  it('is at least what the runner (recursive readdir, Node 20.1) and the installed Nest CLI require', () => {
    const declared = parse(rootPkg.engines.node);
    assert.ok(atLeast(declared, [20, 1, 0]), 'fs.readdirSync({ recursive }) exists from Node 20.1');
    const nestCli = JSON.parse(
      fs.readFileSync(require.resolve('@nestjs/cli/package.json', { paths: [repoRoot, path.join(repoRoot, 'apps/api')] }), 'utf8'),
    );
    assert.ok(atLeast(declared, parse(nestCli.engines.node)), `Nest CLI requires ${nestCli.engines.node}`);
  });

  it('is the same minimum the README states', () => {
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    const stated = readme.match(/\*\*Node\.js\*\*:\s*>=\s*(\d+\.\d+\.\d+)/)?.[1];
    assert.equal(`>=${stated}`, rootPkg.engines.node);
  });
});

/** The cleanup paths to exercise: process groups where they exist, and the group-less path Windows uses. */
const strategies: Array<{ name: string; env: Record<string, string>; groupless: boolean }> =
  process.platform === 'win32'
    ? [{ name: 'Windows cleanup path', env: {}, groupless: true }]
    : [
        { name: 'process groups', env: {}, groupless: false },
        { name: 'no process groups (the Windows cleanup path)', env: { EDUTECH_DEV_RUNNER_NO_GROUPS: '1' }, groupless: true },
      ];

async function withNodeSandbox(env: Record<string, string>, fn: (sandbox: Sandbox) => Promise<void>): Promise<void> {
  const sandbox = new Sandbox(undefined, { node: true, env });
  try {
    await fn(sandbox);
  } finally {
    sandbox.dispose();
  }
}

/** Ends a runner that is still alive: SIGTERM on POSIX (the normal shutdown); Windows has no such signal. */
async function stopRunner(sb: Sandbox, runner: ChildProcess): Promise<void> {
  if (process.platform === 'win32') {
    runner.kill();
    return;
  }
  process.kill(runner.pid!, 'SIGTERM');
  assert.equal((await sb.exitWithin(20_000)).code, 0);
}

for (const strategy of strategies) {
  describe(`dev runner lifeline: ${strategy.name}`, () => {
    it('a leader that exits by itself shuts the runner down without leaving its member behind (the review finding)', { timeout: 90_000 }, async () => {
      await withNodeSandbox(strategy.env, async (sb) => {
        const runner = sb.start();
        await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 20_000);
        await sleep(1_000); // let the lifeline guards connect
        const [leader] = sb.pids('leaders');
        const [member] = sb.pids('members');

        // The leader exits first, while its member (which ignores SIGTERM) keeps running. The runner treats the
        // unexpected exit as a reason to stop everything: the member must not be left behind.
        fs.writeFileSync(path.join(sb.dir, `leader-exit-${leader}`), '');
        await waitUntil('the leader to exit by itself', () => !isAlive(leader), 10_000);
        const exit = await sb.exitWithin(45_000);

        assert.equal(exit.code, 0, sb.output);
        await waitUntil('the member to be gone once the runner has exited', () => !isAlive(member), 5_000);
        assert.equal(sb.nestStarts(), 1);
        assert.equal(sb.taskkillLog().includes(`/pid ${leader} `), false, 'taskkill was never aimed at the exited leader');
        assert.ok(runner.exitCode !== null);
      });
    });

    it('a restart stops the whole old tree (leader and a member that ignores SIGTERM) before the new one starts', { timeout: 90_000 }, async () => {
      await withNodeSandbox(strategy.env, async (sb) => {
        const runner = sb.start();
        await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 20_000);
        await sleep(1_000);
        const [leader] = sb.pids('leaders');
        const [member] = sb.pids('members');

        sb.touchShared();
        await waitUntil('the second Nest to start', () => sb.nestStarts() === 2, 45_000);
        assert.equal(isAlive(leader), false, 'the old leader is gone when the new Nest starts');
        assert.equal(isAlive(member), false, 'the old member is gone when the new Nest starts');

        await stopRunner(sb, runner);
        for (const pid of sb.pids('members')) await waitUntil('every member to be gone', () => !isAlive(pid), 10_000);
      });
    });

    it('killing the runner abruptly leaves no process of its tree behind', { timeout: 60_000 }, async () => {
      await withNodeSandbox(strategy.env, async (sb) => {
        const runner = sb.start();
        await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 20_000);
        await sleep(1_000);
        const [leader] = sb.pids('leaders');
        const [member] = sb.pids('members');

        process.kill(runner.pid!, 'SIGKILL'); // nothing in the runner can react to this
        await waitUntil('the leader to be gone', () => !isAlive(leader), 15_000);
        await waitUntil('the member (which ignores SIGTERM) to be gone', () => !isAlive(member), 15_000);
      });
    });

    if (strategy.groupless) {
      it('a member that cannot react to the release is killed by the pid it reported, never an exited leader', { timeout: 90_000 }, async () => {
        await withNodeSandbox({ ...strategy.env, FAKE_MEMBER: 'blocked' }, async (sb) => {
          const runner = sb.start();
          await waitUntil('the fake Nest to start', () => sb.pids('members').length === 1, 20_000);
          await sleep(3_000); // the member blocks its event loop after 2 s: from now on it cannot react to anything
          const [leader] = sb.pids('leaders');
          const [member] = sb.pids('members');

          sb.touchShared();
          await waitUntil('the second Nest to start', () => sb.nestStarts() === 2, 60_000);
          assert.equal(isAlive(member), false, 'the blocked member is gone when the new Nest starts');
          if (process.platform !== 'win32') {
            const log = sb.taskkillLog();
            assert.ok(log.includes(`/pid ${member} `), `the blocked member was killed through taskkill by its own pid; log:\n${log}`);
            assert.equal(log.includes(`/pid ${leader} `), false, 'the leader had exited by itself: no taskkill for its pid');
          }
          await stopRunner(sb, runner);
        });
      });
    }
  });
}

describe('dev lifeline guard (scripts/dev-lifeline.js)', () => {
  const guard = path.join(repoRoot, 'scripts/dev-lifeline.js');
  const address = () =>
    process.platform === 'win32'
      ? `\\\\.\\pipe\\edutech-guard-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      : path.join(os.tmpdir(), `edutech-guard-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sock`);
  const run = (env: Record<string, string>, code: string) =>
    spawn(process.execPath, ['--require', guard, '-e', code], { env: { ...process.env, ...env }, stdio: 'ignore' });
  const exitOf = (child: ChildProcess, ms: number) =>
    Promise.race([
      new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code))),
      sleep(ms).then(() => 'timeout' as const),
    ]);

  it('does nothing unless EDUTECH_DEV_LIFELINE is set', async () => {
    const child = run({ EDUTECH_DEV_LIFELINE: '' }, 'process.exit(7)');
    assert.equal(await exitOf(child, 10_000), 7);
  });

  it('exits at once when the runner is gone (nothing listens on the lifeline address)', async () => {
    const child = run({ EDUTECH_DEV_LIFELINE: address() }, 'setInterval(() => {}, 1000)');
    try {
      assert.equal(await exitOf(child, 10_000), 0, 'an orphan that starts late must not stay alive');
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('reports its pid, does not keep the process alive, and exits when the runner closes the connection', async () => {
    const where = address();
    const received: string[] = [];
    let closeConnection: () => void = () => {};
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (text) => received.push(String(text)));
      closeConnection = () => socket.end();
    });
    await new Promise<void>((resolve) => server.listen(where, resolve));
    try {
      // 1. With the connection open, a process that has nothing left to do still exits by itself (the guard is unref'd).
      const finishing = run({ EDUTECH_DEV_LIFELINE: where }, '0');
      assert.equal(await exitOf(finishing, 10_000), 0);
      assert.equal(received.join('').trim(), String(finishing.pid), 'the guard reports the pid of its process');

      // 2. A long-running process stays alive while connected and exits when the runner ends the connection.
      received.length = 0;
      const running = run({ EDUTECH_DEV_LIFELINE: where }, 'setInterval(() => {}, 1000)');
      try {
        await waitUntil('the guard to report its pid', () => received.join('').trim() === String(running.pid), 10_000);
        assert.equal(await exitOf(running, 1_000), 'timeout', 'still running while the connection is open');
        closeConnection();
        assert.equal(await exitOf(running, 10_000), 0);
      } finally {
        running.kill('SIGKILL');
      }
    } finally {
      server.close();
    }
  });
});
