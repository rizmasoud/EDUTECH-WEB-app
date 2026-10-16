/**
 * The provider must never switch from PostgreSQL to PGlite because a connection failed.
 * Uses a closed local port (127.0.0.1:1): no real database is involved. The process
 * works in an empty temp directory so any accidental PGlite storage would be visible.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  connectRetrySeconds,
  drizzleProvider,
  isTransientConnectError,
} from '../../apps/api/src/infrastructure/database/drizzle.provider';

const factory = (drizzleProvider as any).useFactory as () => Promise<unknown>;
const DEAD_URL = 'postgresql://someuser:topsecretpw@127.0.0.1:1/nodb';
const KEYS = ['NODE_ENV', 'DATABASE_DRIVER', 'DATABASE_URL', 'USE_PGLITE', 'PGLITE_DATA_DIR', 'DATABASE_CONNECT_RETRY_SECONDS'];

let tmp: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};

before(() => {
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-provider-test-'));
  process.chdir(tmp);
  for (const k of KEYS) saved[k] = process.env[k];
  delete (global as any).__TEST_DRIZZLE_DB__;
});
after(() => {
  process.chdir(cwd);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function setEnv(env: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  // Do not wait for a database that is deliberately unreachable.
  process.env.DATABASE_CONNECT_RETRY_SECONDS = '0';
  Object.assign(process.env, env);
}

describe('drizzle provider', () => {
  for (const [name, env] of [
    ['explicit postgres', { NODE_ENV: 'development', DATABASE_DRIVER: 'postgres', DATABASE_URL: DEAD_URL }],
    ['URL-only postgres (driver inferred)', { NODE_ENV: 'development', DATABASE_URL: DEAD_URL }],
    ['production postgres', { NODE_ENV: 'production', DATABASE_DRIVER: 'postgres', DATABASE_URL: DEAD_URL }],
  ] as const) {
    it(`${name}: connection failure rejects and does not fall back to PGlite`, async () => {
      setEnv(env);
      await assert.rejects(factory, (e: Error) => {
        assert.match(e.message, /PostgreSQL connection failed/);
        assert.ok(!e.message.includes('topsecretpw'), 'password must be masked');
        return true;
      });
      assert.equal(fs.existsSync(path.join(tmp, '.pglite-storage')), false, 'no PGlite storage may be created');
      assert.deepEqual(fs.readdirSync(tmp), []);
    });
  }

  it('missing or unsupported configuration rejects before any connection or storage is attempted', async () => {
    setEnv({});
    await assert.rejects(factory, /DATABASE_URL is not set/);
    setEnv({ NODE_ENV: 'development' });
    await assert.rejects(factory, /DATABASE_URL is not set/);
    setEnv({ DATABASE_DRIVER: 'pglite', DATABASE_URL: DEAD_URL });
    await assert.rejects(factory, /no longer a supported runtime database/);
    setEnv({ USE_PGLITE: 'true' });
    await assert.rejects(factory, /no longer a supported runtime database/);
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

describe('startup connection helpers', () => {
  it('connectRetrySeconds: default 30, 0 disables, invalid falls back, capped', () => {
    assert.equal(connectRetrySeconds({}), 30);
    assert.equal(connectRetrySeconds({ DATABASE_CONNECT_RETRY_SECONDS: '0' }), 0);
    assert.equal(connectRetrySeconds({ DATABASE_CONNECT_RETRY_SECONDS: '5' }), 5);
    assert.equal(connectRetrySeconds({ DATABASE_CONNECT_RETRY_SECONDS: 'abc' }), 30);
    assert.equal(connectRetrySeconds({ DATABASE_CONNECT_RETRY_SECONDS: '-1' }), 30);
    assert.equal(connectRetrySeconds({ DATABASE_CONNECT_RETRY_SECONDS: '9999' }), 300);
  });

  it('isTransientConnectError retries "not up yet" errors but never authentication errors', () => {
    assert.equal(isTransientConnectError({ code: 'ECONNREFUSED' }), true);
    assert.equal(isTransientConnectError({ code: '57P03' }), true);
    assert.equal(isTransientConnectError({ code: 'CONNECT_TIMEOUT' }), true);
    assert.equal(isTransientConnectError({ errors: [{ code: 'ECONNREFUSED' }, { code: 'ECONNREFUSED' }] }), true);
    assert.equal(isTransientConnectError({ code: '28P01', message: 'password authentication failed' }), false);
    assert.equal(isTransientConnectError({ code: '3D000', message: 'database "x" does not exist' }), false);
    assert.equal(isTransientConnectError(undefined), false);
  });
});
