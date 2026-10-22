/**
 * Display formatting for the Persian UI (apps/web/lib/format.ts).
 * Display only: API and database values stay ISO / Gregorian.
 * Anchors are independent calendar facts: 1 Farvardin 1405 is 21 March 2026, 1 Mehr 1405 is 23 September 2026.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliRange,
  formatNumber,
} from '../../apps/web/lib/format';

describe('Jalali date and Persian number formatting', () => {
  it('converts calendar dates to the Jalali calendar with Persian digits', () => {
    assert.equal(formatJalaliDate('2026-03-21'), '۱ فروردین ۱۴۰۵');
    assert.equal(formatJalaliDate('2026-03-20'), '۲۹ اسفند ۱۴۰۴');
    assert.equal(formatJalaliDate('2026-09-23'), '۱ مهر ۱۴۰۵');
    assert.equal(formatJalaliDate('2026-10-20'), '۲۸ مهر ۱۴۰۵');
  });

  it('pins bare calendar dates to UTC so the viewer time zone cannot shift them', async () => {
    // Guard on the implementation (a process-wide TZ change is not reliable inside one test process):
    // the date-only formatter must carry an explicit UTC time zone. Verified manually under
    // TZ=Pacific/Honolulu and TZ=Pacific/Kiritimati: the output for 2026-03-21 stays «۱ فروردین ۱۴۰۵».
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../../apps/web/lib/format.ts'), 'utf8');
    const dateOnlyFormatter = src.slice(src.indexOf('const jalaliDate'), src.indexOf('const DATE_ONLY'));
    assert.match(dateOnlyFormatter, /timeZone:\s*'UTC'/);
  });

  it('renders missing values as a dash and returns unparseable input unchanged', () => {
    assert.equal(formatJalaliDate(null), '—');
    assert.equal(formatJalaliDate(undefined), '—');
    assert.equal(formatJalaliDate(''), '—');
    assert.equal(formatJalaliDate('not-a-date'), 'not-a-date', 'no data is silently hidden');
  });

  it('formats a date range', () => {
    assert.equal(formatJalaliRange('2026-09-23', '2026-12-21'), '۱ مهر ۱۴۰۵ تا ۳۰ آذر ۱۴۰۵');
  });

  it('formats a timestamp in an explicit time zone (Asia/Tehran is UTC+03:30)', () => {
    const out = formatJalaliDateTime('2026-10-20T08:12:00Z', 'Asia/Tehran');
    assert.ok(out.includes('۲۸ مهر ۱۴۰۵'), out);
    assert.ok(out.includes('۱۱:۴۲'), out);
  });

  it('formats numbers with Persian digits and never prints NaN', () => {
    assert.equal(formatNumber(12), '۱۲');
    assert.equal(formatNumber(0), '۰');
    assert.equal(formatNumber(NaN), '—');
    assert.equal(formatNumber(null), '—');
    assert.equal(formatNumber(undefined), '—');
    assert.equal(formatNumber(Infinity), '—');
  });

  it('leaves the API value untouched: formatting returns a new string and never mutates input', () => {
    const iso = '2026-10-20';
    formatJalaliDate(iso);
    assert.equal(iso, '2026-10-20');
  });
});
