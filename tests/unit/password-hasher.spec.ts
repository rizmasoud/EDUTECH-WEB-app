import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('should hash a password and produce scrypt format', async () => {
    const raw = 'SuperSecret123!';
    const hash = await hasher.hash(raw);

    assert.ok(hash.startsWith('scrypt$'), 'Hash must start with scrypt$');
    const parts = hash.split('$');
    assert.strictEqual(parts.length, 3, 'Hash must contain 3 parts separated by $');
    assert.strictEqual(parts[1].length, 32, 'Salt should be 16 bytes (32 hex characters)');
    assert.strictEqual(parts[2].length, 128, 'Derived key should be 64 bytes (128 hex characters)');
  });

  it('should verify correct password successfully', async () => {
    const raw = 'TeacherPass2026';
    const hash = await hasher.hash(raw);

    const isValid = await hasher.verify(raw, hash);
    assert.strictEqual(isValid, true, 'Correct password must verify as true');
  });

  it('should reject wrong password', async () => {
    const raw = 'CorrectPassword';
    const hash = await hasher.hash(raw);

    const isValid = await hasher.verify('WrongPassword', hash);
    assert.strictEqual(isValid, false, 'Wrong password must verify as false');
  });

  it('should produce different hashes for the same password due to random salting', async () => {
    const raw = 'IdenticalPassword';
    const hash1 = await hasher.hash(raw);
    const hash2 = await hasher.hash(raw);

    assert.notStrictEqual(hash1, hash2, 'Hashes must differ because salts differ');
    assert.strictEqual(await hasher.verify(raw, hash1), true);
    assert.strictEqual(await hasher.verify(raw, hash2), true);
  });

  it('should safely return false for malformed hash string', async () => {
    assert.strictEqual(await hasher.verify('pass', 'not-a-valid-hash'), false);
    assert.strictEqual(await hasher.verify('pass', 'scrypt$bad'), false);
    assert.strictEqual(await hasher.verify('pass', ''), false);
  });
});
