import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLatestRequestGuard,
  hasSessionOccurred,
} from '../../apps/web/lib/attendance-session-utils';

describe('hasSessionOccurred', () => {
  const now = new Date(2026, 10, 5, 14, 30, 0); // 2026-11-05 14:30 local

  it('is false for sessions on a future date', () => {
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-06', startTime: '09:00' }, now), false);
    assert.equal(hasSessionOccurred({ sessionDate: '2026-12-20', startTime: '00:00:00' }, now), false);
  });

  it('is false for a later session today', () => {
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-05', startTime: '14:31' }, now), false);
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-05', startTime: '18:00:00' }, now), false);
  });

  it('is true once the start time has been reached', () => {
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-05', startTime: '14:30' }, now), true);
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-05', startTime: '08:00:00' }, now), true);
  });

  it('is true for past dates', () => {
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-04', startTime: '23:59' }, now), true);
    assert.equal(hasSessionOccurred({ sessionDate: '2026-10-29', startTime: '10:00' }, now), true);
  });

  it('fails closed on malformed input', () => {
    assert.equal(hasSessionOccurred({ sessionDate: '', startTime: '10:00' }, now), false);
    assert.equal(hasSessionOccurred({ sessionDate: '2026-11-05', startTime: 'noon' }, now), false);
    assert.equal(hasSessionOccurred({ sessionDate: '05/11/2026', startTime: '10:00' }, now), false);
  });
});

describe('createLatestRequestGuard (stale roster responses)', () => {
  it('only the most recent request is latest', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    assert.equal(guard.isLatest(first), true);
    const second = guard.begin();
    assert.equal(guard.isLatest(first), false);
    assert.equal(guard.isLatest(second), true);
  });

  it('applies the newest result even when the older request finishes last', async () => {
    const guard = createLatestRequestGuard();
    let applied: string | null = null;
    const load = (label: string, delayMs: number) => {
      const token = guard.begin();
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          if (guard.isLatest(token)) applied = label;
          resolve();
        }, delayMs),
      );
    };
    // Session A is selected first (slow), then session B (fast): A resolves last.
    await Promise.all([load('A', 40), load('B', 5)]);
    assert.equal(applied, 'B');
  });

  it('invalidate() discards every in-flight request', () => {
    const guard = createLatestRequestGuard();
    const token = guard.begin();
    guard.invalidate();
    assert.equal(guard.isLatest(token), false);
  });
});
