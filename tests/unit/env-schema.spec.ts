/**
 * ConfigModule copies ONLY the keys that the validated schema returns into process.env, so every
 * variable the API reads from .env must be part of envSchema.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../../apps/api/src/shared/config/env.schema';

describe('envSchema keeps the database variables', () => {
  it('passes DATABASE_URL, DATABASE_DRIVER and DATABASE_CONNECT_RETRY_SECONDS through', () => {
    const out = validateEnv({
      DATABASE_DRIVER: 'postgres',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
      DATABASE_CONNECT_RETRY_SECONDS: '10',
    }) as Record<string, unknown>;
    assert.equal(out.DATABASE_DRIVER, 'postgres');
    assert.equal(out.DATABASE_URL, 'postgresql://u:p@127.0.0.1:5432/db');
    assert.equal(out.DATABASE_CONNECT_RETRY_SECONDS, '10');
  });

  it('does not require them (the actionable error comes from driver selection)', () => {
    assert.doesNotThrow(() => validateEnv({}));
  });
});
