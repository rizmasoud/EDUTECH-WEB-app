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
import { drizzleProvider } from '../../apps/api/src/infrastructure/database/drizzle.provider';

const factory = (drizzleProvider as any).useFactory as () => Promise<unknown>;
const DEAD_URL = 'postgresql://someuser:topsecretpw@127.0.0.1:1/nodb';
const KEYS = ['NODE_ENV', 'DATABASE_DRIVER', 'DATABASE_URL', 'USE_PGLITE', 'PGLITE_DATA_DIR'];

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
  Object.assign(process.env, env);
}

describe('drizzle provider', () => {
  for (const [name, env] of [
    ['explicit postgres', { NODE_ENV: 'development', DATABASE_DRIVER: 'postgres', DATABASE_URL: DEAD_URL }],
    ['legacy-inferred postgres', { NODE_ENV: 'development', DATABASE_URL: DEAD_URL }],
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

  it('invalid configuration rejects before any connection or storage is attempted', async () => {
    setEnv({ DATABASE_DRIVER: 'pglite', DATABASE_URL: DEAD_URL });
    await assert.rejects(factory, /conflicts with a DATABASE_URL/);
    setEnv({ NODE_ENV: 'production', DATABASE_DRIVER: 'pglite' });
    await assert.rejects(factory, /not allowed in production/);
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});
