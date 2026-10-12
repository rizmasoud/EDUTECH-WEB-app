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

describe('resolveDatabaseDriver', () => {
  it('explicit postgres with a postgres URL', () => {
    const s = resolveDatabaseDriver({ DATABASE_DRIVER: 'postgres', DATABASE_URL: PG });
    assert.equal(s.driver, 'postgres');
    assert.equal(s.source, 'DATABASE_DRIVER');
    assert.equal(s.connectionString, PG);
    assert.deepEqual(s.warnings, []);
  });

  it('explicit postgres requires a postgres URL', () => {
    throwsConfig({ DATABASE_DRIVER: 'postgres' }, /requires DATABASE_URL/);
    throwsConfig({ DATABASE_DRIVER: 'postgres', DATABASE_URL: 'pglite' }, /requires DATABASE_URL/);
    throwsConfig({ DATABASE_DRIVER: 'postgres', DATABASE_URL: 'mysql://x' }, /requires DATABASE_URL/);
  });

  it('explicit postgres conflicts with USE_PGLITE=true', () => {
    throwsConfig({ DATABASE_DRIVER: 'postgres', DATABASE_URL: PG, USE_PGLITE: 'true' }, /conflicts with USE_PGLITE/);
  });

  it('explicit pglite is accepted without a URL, or with "pglite"', () => {
    assert.equal(resolveDatabaseDriver({ DATABASE_DRIVER: 'pglite' }).driver, 'pglite');
    assert.equal(resolveDatabaseDriver({ DATABASE_DRIVER: 'pglite', DATABASE_URL: 'pglite' }).driver, 'pglite');
  });

  it('explicit pglite conflicts with a postgres URL (no guessing which one wins)', () => {
    throwsConfig({ DATABASE_DRIVER: 'pglite', DATABASE_URL: PG }, /conflicts with a DATABASE_URL/);
  });

  it('rejects an unknown DATABASE_DRIVER', () => {
    throwsConfig({ DATABASE_DRIVER: 'sqlite' }, /must be "postgres" or "pglite"/);
  });

  it('production never allows PGlite, however it is requested', () => {
    throwsConfig({ NODE_ENV: 'production', DATABASE_DRIVER: 'pglite' }, /not allowed in production/);
    throwsConfig({ NODE_ENV: 'production', DATABASE_URL: 'pglite' }, /not allowed in production/);
    throwsConfig({ NODE_ENV: 'production', USE_PGLITE: 'true' }, /not allowed in production/);
    throwsConfig({ NODE_ENV: ' Production ' }, /No database configured in production/);
  });

  it('production with explicit postgres works', () => {
    assert.equal(
      resolveDatabaseDriver({ NODE_ENV: 'production', DATABASE_DRIVER: 'postgres', DATABASE_URL: PG }).driver,
      'postgres',
    );
  });

  it('legacy inference: postgres URL -> postgres, with a warning', () => {
    const s = resolveDatabaseDriver({ DATABASE_URL: PG });
    assert.equal(s.driver, 'postgres');
    assert.equal(s.source, 'DATABASE_URL');
    assert.equal(s.warnings.length, 1);
  });

  it('legacy inference: DATABASE_URL=pglite and USE_PGLITE=true -> pglite with a warning', () => {
    const a = resolveDatabaseDriver({ DATABASE_URL: 'pglite' });
    assert.equal(a.driver, 'pglite');
    assert.ok(a.warnings.length >= 1);
    const b = resolveDatabaseDriver({ USE_PGLITE: 'true', DATABASE_URL: PG });
    assert.equal(b.driver, 'pglite');
    assert.ok(b.warnings.some((w) => /ignored/.test(w)));
  });

  it('legacy inference: nothing configured outside production -> pglite (explicitly implicit)', () => {
    const s = resolveDatabaseDriver({});
    assert.equal(s.driver, 'pglite');
    assert.equal(s.source, 'implicit-default');
    assert.ok(s.warnings.length >= 1);
  });

  it('rejects a DATABASE_URL that is neither postgres nor "pglite"', () => {
    throwsConfig({ DATABASE_URL: 'http://example.com' }, /must be a postgres/);
  });

  it('is a pure function: same input, same output, never touches the network', () => {
    const env = { DATABASE_DRIVER: 'postgres', DATABASE_URL: 'postgresql://u:p@192.0.2.1:5432/db' };
    assert.deepEqual(resolveDatabaseDriver(env), resolveDatabaseDriver(env));
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
