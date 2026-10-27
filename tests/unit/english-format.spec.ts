import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateEn,
  formatDateRangeEn,
  formatJalaliDate,
  formatJalaliRange,
  formatNumber,
  formatNumberEn,
} from '../../apps/web/lib/format';

describe('English formatting helpers (used by Overview only)', () => {
  it('formats numbers with Latin digits and grouping', () => {
    assert.equal(formatNumberEn(0), '0');
    assert.equal(formatNumberEn(12), '12');
    assert.equal(formatNumberEn(1200), '1,200');
  });

  it('renders non-finite numbers as an em dash', () => {
    assert.equal(formatNumberEn(null), '—');
    assert.equal(formatNumberEn(undefined), '—');
    assert.equal(formatNumberEn(Number.NaN), '—');
    assert.equal(formatNumberEn(Number.POSITIVE_INFINITY), '—');
  });

  it('formats a bare ISO date as a Gregorian calendar date without a time-zone shift', () => {
    assert.equal(formatDateEn('2026-09-23'), 'Sep 23, 2026');
    assert.equal(formatDateEn('2026-01-01'), 'Jan 1, 2026');
    assert.equal(formatDateEn('2026-12-31'), 'Dec 31, 2026');
  });

  it('uses the UTC calendar day of a full timestamp', () => {
    assert.equal(formatDateEn('2026-09-23T23:30:00Z'), 'Sep 23, 2026');
    assert.equal(formatDateEn('2026-09-23T00:30:00.000Z'), 'Sep 23, 2026');
  });

  it('handles empty and unparseable dates like the Persian helper does', () => {
    assert.equal(formatDateEn(null), '—');
    assert.equal(formatDateEn(undefined), '—');
    assert.equal(formatDateEn(''), '—');
    assert.equal(formatDateEn('not a date'), 'not a date');
  });

  it('joins a range with an English separator', () => {
    assert.equal(formatDateRangeEn('2026-09-23', '2026-12-21'), 'Sep 23, 2026 to Dec 21, 2026');
    assert.equal(formatDateRangeEn(null, '2026-12-21'), '— to Dec 21, 2026');
  });

  it('produces no Persian digits, letters or Jalali months', () => {
    const out = `${formatNumberEn(1234567)} ${formatDateRangeEn('2026-09-23', '2026-12-21')}`;
    assert.ok(!/[؀-ۿ]/.test(out));
  });
});

describe('Persian helpers keep their default behavior for other callers', () => {
  it('formatNumber still uses Persian digits', () => {
    assert.equal(formatNumber(12), '۱۲');
  });

  it('formatJalaliDate and formatJalaliRange still use the Persian calendar and separator', () => {
    assert.equal(formatJalaliDate('2026-09-23'), '۱ مهر ۱۴۰۵');
    assert.equal(formatJalaliRange('2026-09-23', '2026-12-21'), '۱ مهر ۱۴۰۵ تا ۳۰ آذر ۱۴۰۵');
  });
});
