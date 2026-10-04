import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';

describe('MemoryLoginRateLimiter', () => {
  it('should allow attempts under the limit', () => {
    const limiter = new MemoryLoginRateLimiter({ maxAttempts: 3, windowMs: 1000 });
    const key = 'login:12345';

    assert.strictEqual(limiter.isRateLimited(key), false);
    assert.strictEqual(limiter.getRemainingAttempts(key), 3);

    limiter.recordFailure(key);
    assert.strictEqual(limiter.isRateLimited(key), false);
    assert.strictEqual(limiter.getRemainingAttempts(key), 2);

    limiter.recordFailure(key);
    assert.strictEqual(limiter.isRateLimited(key), false);
    assert.strictEqual(limiter.getRemainingAttempts(key), 1);
  });

  it('should block attempts once maxAttempts threshold is reached', () => {
    const limiter = new MemoryLoginRateLimiter({ maxAttempts: 3, windowMs: 1000 });
    const key = 'login:99999';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    limiter.recordFailure(key);

    assert.strictEqual(limiter.isRateLimited(key), true);
    assert.strictEqual(limiter.getRemainingAttempts(key), 0);
  });

  it('should reset attempts when reset() is called', () => {
    const limiter = new MemoryLoginRateLimiter({ maxAttempts: 2, windowMs: 1000 });
    const key = 'login:userA';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    assert.strictEqual(limiter.isRateLimited(key), true);

    limiter.reset(key);
    assert.strictEqual(limiter.isRateLimited(key), false);
    assert.strictEqual(limiter.getRemainingAttempts(key), 2);
  });

  it('should automatically unblock after the time window expires', async () => {
    const limiter = new MemoryLoginRateLimiter({ maxAttempts: 2, windowMs: 50 });
    const key = 'login:fastExpire';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    assert.strictEqual(limiter.isRateLimited(key), true);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 70));

    assert.strictEqual(limiter.isRateLimited(key), false);
    assert.strictEqual(limiter.getRemainingAttempts(key), 2);
  });
});
