import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';

describe('CryptoSessionTokenService', () => {
  const tokenService = new CryptoSessionTokenService();

  it('should generate a 64-char raw token and a 64-char sha256 token hash', () => {
    const { rawToken, tokenHash } = tokenService.generateToken();

    assert.strictEqual(rawToken.length, 64, 'Raw token must be 64 hex characters (32 bytes)');
    assert.strictEqual(tokenHash.length, 64, 'Token hash must be 64 hex characters (sha256)');
    assert.notStrictEqual(rawToken, tokenHash, 'Raw token and token hash must not be equal');
  });

  it('should deterministically produce the same hash for the same raw token', () => {
    const { rawToken, tokenHash } = tokenService.generateToken();
    const computedHash = tokenService.hashToken(rawToken);

    assert.strictEqual(computedHash, tokenHash, 'hashToken must match tokenHash from generateToken');
  });

  it('should produce unique tokens and hashes across multiple calls', () => {
    const t1 = tokenService.generateToken();
    const t2 = tokenService.generateToken();

    assert.notStrictEqual(t1.rawToken, t2.rawToken);
    assert.notStrictEqual(t1.tokenHash, t2.tokenHash);
  });
});
