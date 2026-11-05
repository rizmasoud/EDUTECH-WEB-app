import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUSINESS_TIME_ZONE,
  hasSessionStarted,
  isValidTimeZone,
  resolveBusinessTimeZone,
  wallClockToInstant,
} from '../../apps/api/src/sessions/domain/session-start';

const iso = (d: Date) => d.toISOString();

describe('session start time semantics', () => {
  it('defaults the business time zone to Asia/Tehran and honours BUSINESS_TIME_ZONE', () => {
    assert.equal(DEFAULT_BUSINESS_TIME_ZONE, 'Asia/Tehran');
    assert.equal(resolveBusinessTimeZone({}), 'Asia/Tehran');
    assert.equal(resolveBusinessTimeZone({ BUSINESS_TIME_ZONE: '  ' }), 'Asia/Tehran');
    assert.equal(resolveBusinessTimeZone({ BUSINESS_TIME_ZONE: 'Europe/Berlin' }), 'Europe/Berlin');
    assert.throws(() => resolveBusinessTimeZone({ BUSINESS_TIME_ZONE: 'Not/AZone' }), /not a valid IANA/);
    assert.equal(isValidTimeZone('Asia/Tehran'), true);
    assert.equal(isValidTimeZone('Mars/Olympus'), false);
  });

  it('interprets wall-clock values in Asia/Tehran (UTC+03:30, no DST), accepting HH:mm and HH:mm:ss', () => {
    assert.equal(iso(wallClockToInstant('2026-11-15', '08:00:00', 'Asia/Tehran')), '2026-11-15T04:30:00.000Z');
    assert.equal(iso(wallClockToInstant('2026-11-15', '08:00', 'Asia/Tehran')), '2026-11-15T04:30:00.000Z');
    assert.equal(iso(wallClockToInstant('2026-07-15', '08:00:00', 'Asia/Tehran')), '2026-07-15T04:30:00.000Z');
    // Local date rolls back across UTC midnight.
    assert.equal(iso(wallClockToInstant('2026-11-15', '01:00:00', 'Asia/Tehran')), '2026-11-14T21:30:00.000Z');
  });

  it('does not depend on the server time zone and handles daylight-saving zones', () => {
    assert.equal(iso(wallClockToInstant('2026-11-15', '08:00:00', 'UTC')), '2026-11-15T08:00:00.000Z');
    assert.equal(iso(wallClockToInstant('2026-01-15', '09:00:00', 'America/New_York')), '2026-01-15T14:00:00.000Z');
    assert.equal(iso(wallClockToInstant('2026-07-15', '09:00:00', 'America/New_York')), '2026-07-15T13:00:00.000Z');
    // The offset changes between the two sides of a spring-forward day.
    assert.equal(iso(wallClockToInstant('2026-03-08', '09:00:00', 'America/New_York')), '2026-03-08T13:00:00.000Z');
  });

  it('treats the exact start instant as started and one millisecond earlier as not started', () => {
    const session = { sessionDate: '2026-11-15', startTime: '08:00:00' };
    assert.equal(hasSessionStarted(session, new Date('2026-11-15T04:29:59.999Z'), 'Asia/Tehran'), false);
    assert.equal(hasSessionStarted(session, new Date('2026-11-15T04:30:00.000Z'), 'Asia/Tehran'), true);
    assert.equal(hasSessionStarted(session, new Date('2026-11-15T04:30:00.001Z'), 'Asia/Tehran'), true);
    // 08:00 read as UTC would be wrong: at 05:00Z the Tehran session started 30 minutes ago.
    assert.equal(hasSessionStarted(session, new Date('2026-11-15T05:00:00.000Z'), 'Asia/Tehran'), true);
  });

  it('rejects malformed input instead of guessing', () => {
    assert.throws(() => wallClockToInstant('15/11/2026', '08:00', 'Asia/Tehran'), /Invalid session date\/time/);
    assert.throws(() => wallClockToInstant('2026-11-15', 'noon', 'Asia/Tehran'), /Invalid session date\/time/);
  });
});
