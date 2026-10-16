import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DatabaseConfigError,
  maskConnectionString,
  parseBooleanFlag,
  resolveDatabaseDriver,
} from '../../apps/api/src/infrastructure/database/driver-selection';

const PG = 'postgresql://user:secret@localhost:5432/db';
const throwsConfig = (env: Record<string, string>, re: RegExp) =>
  assert.throws(() => resolveDatabaseDriver(env), (e: unknown) => e instanceof DatabaseConfigError && re.test((e as Error).message));

describe('resolveDatabaseDriver (PostgreSQL only)', () => {
  it('explicit postgres with a postgres URL', () => {
    const s = resolveDatabaseDriver({ DATABASE_DRIVER: 'postgres', DATABASE_URL: PG });
    assert.equal(s.driver, 'postgres');
    assert.equal(s.source, 'DATABASE_DRIVER');
    assert.equal(s.connectionString, PG);
    assert.deepEqual(s.warnings, []);
  });

  it('postgres:// and postgresql:// are both accepted, production included', () => {
    assert.equal(resolveDatabaseDriver({ DATABASE_URL: 'postgres://u:p@h/db' }).driver, 'postgres');
    assert.equal(
      resolveDatabaseDriver({ NODE_ENV: 'production', DATABASE_DRIVER: 'postgres', DATABASE_URL: PG }).driver,
      'postgres',
    );
  });

  it('DATABASE_URL alone selects PostgreSQL, with a warning', () => {
    const s = resolveDatabaseDriver({ DATABASE_URL: PG });
    assert.equal(s.driver, 'postgres');
    assert.equal(s.source, 'DATABASE_URL');
    assert.equal(s.warnings.length, 1);
  });

  it('nothing configured fails with an actionable error in EVERY environment (no implicit fallback)', () => {
    for (const NODE_ENV of [undefined, 'development', 'test', 'production']) {
      const env: Record<string, string> = NODE_ENV ? { NODE_ENV } : {};
      throwsConfig(env, /DATABASE_URL is not set[\s\S]*\.env\.example[\s\S]*docker compose up -d --wait postgres/);
    }
    throwsConfig({ DATABASE_DRIVER: 'postgres' }, /DATABASE_URL is not set/);
    throwsConfig({ DATABASE_URL: '   ' }, /DATABASE_URL is not set/);
  });

  it('PGlite is rejected however it is requested', () => {
    throwsConfig({ DATABASE_DRIVER: 'pglite' }, /no longer a supported runtime database/);
    throwsConfig({ DATABASE_DRIVER: 'pglite', DATABASE_URL: PG }, /no longer a supported runtime database/);
    throwsConfig({ DATABASE_URL: 'pglite' }, /no longer a supported runtime database/);
    throwsConfig({ USE_PGLITE: 'true', DATABASE_URL: PG }, /no longer a supported runtime database/);
    throwsConfig({ NODE_ENV: 'production', DATABASE_DRIVER: 'pglite' }, /no longer a supported runtime database/);
  });

  it('rejects an unknown DATABASE_DRIVER and a non-postgres URL', () => {
    throwsConfig({ DATABASE_DRIVER: 'sqlite', DATABASE_URL: PG }, /must be "postgres"/);
    throwsConfig({ DATABASE_URL: 'http://example.com' }, /must be a postgres/);
    throwsConfig({ DATABASE_DRIVER: 'postgres', DATABASE_URL: 'mysql://x' }, /must be a postgres/);
  });

  it('is a pure function: same input, same output, never touches the network', () => {
    const env = { DATABASE_DRIVER: 'postgres', DATABASE_URL: 'postgresql://u:p@192.0.2.1:5432/db' };
    assert.deepEqual(resolveDatabaseDriver(env), resolveDatabaseDriver(env));
  });

  it('error messages never contain the configured password', () => {
    assert.throws(
      () => resolveDatabaseDriver({ DATABASE_DRIVER: 'pglite', DATABASE_URL: PG }),
      (e: Error) => !e.message.includes('secret'),
    );
  });
});

describe('helpers', () => {
  it('maskConnectionString hides passwords', () => {
    assert.ok(!maskConnectionString(PG).includes('secret'));
    assert.ok(!maskConnectionString(`connect ECONNREFUSED ${PG}`).includes('secret'));
  });

  it('parseBooleanFlag is strict', () => {
    assert.equal(parseBooleanFlag('X', undefined), false);
    assert.equal(parseBooleanFlag('X', ' TRUE '), true);
    assert.equal(parseBooleanFlag('X', 'false', true), false);
    assert.throws(() => parseBooleanFlag('X', 'yes'), DatabaseConfigError);
  });
});
