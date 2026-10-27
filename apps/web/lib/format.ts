/**
 * Display formatting for the Persian UI.
 *
 * Display only: API values and database values stay ISO / Gregorian and are never rewritten.
 * Jalali (Persian calendar) output uses the platform's Intl data, so there is no extra dependency.
 * Persian digits come from the `fa-IR` locale. Identifiers (personnel codes, ids) must NOT go through
 * these helpers: render them as-is inside an element with dir="ltr".
 */

const JALALI_LOCALE = 'fa-IR-u-ca-persian';
const EMPTY = '—';

const numberFormat = new Intl.NumberFormat('fa-IR');

const jalaliDate = new Intl.DateTimeFormat(JALALI_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 12 → «۱۲». Non-finite input renders as an em dash instead of «NaN». */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return numberFormat.format(value);
}

/**
 * Format an ISO value as a Jalali calendar date, e.g. "2026-10-20" → «۲۸ مهر ۱۴۰۵».
 * A bare date (YYYY-MM-DD) is treated as a calendar date and is never shifted by the viewer's time zone.
 * Unparseable input is returned unchanged so no data is silently hidden.
 */
export function formatJalaliDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (DATE_ONLY.test(value)) return jalaliDate.format(date);
  // A full timestamp: use the calendar day in UTC-agnostic local time via the date-time formatter.
  return formatJalaliDateTime(value, undefined, false);
}

/**
 * Format an ISO timestamp as a Jalali date and time. `timeZone` is optional (defaults to the viewer's).
 */
export function formatJalaliDateTime(
  value: string | Date | null | undefined,
  timeZone?: string,
  withTime = true,
): string {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : EMPTY;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    ...(timeZone ? { timeZone } : {}),
  };
  return new Intl.DateTimeFormat(JALALI_LOCALE, options).format(date);
}

/** «از ۱ مهر ۱۴۰۵ تا ۳۰ آذر ۱۴۰۵» style range for two ISO dates. */
export function formatJalaliRange(start: string | null | undefined, end: string | null | undefined): string {
  return `${formatJalaliDate(start)} تا ${formatJalaliDate(end)}`;
}

/*
 * English (Latin digits, Gregorian calendar) variants for screens that are already translated.
 * They are additive: the Persian helpers above keep their behavior for every other caller.
 * Display only; API and database values are never rewritten.
 */

const englishNumberFormat = new Intl.NumberFormat('en-US');

const englishDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** 1200 → "1,200". Non-finite input renders as an em dash instead of "NaN". */
export function formatNumberEn(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return englishNumberFormat.format(value);
}

/**
 * Format an ISO value as a Gregorian calendar date, e.g. "2026-09-23" → "Sep 23, 2026".
 * Both a bare date and a full timestamp use their UTC calendar day, so the viewer's time zone never shifts the date.
 * Unparseable input is returned unchanged so no data is silently hidden.
 */
export function formatDateEn(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return englishDate.format(date);
}

/** "Sep 23, 2026 to Dec 21, 2026" for two ISO dates. */
export function formatDateRangeEn(start: string | null | undefined, end: string | null | undefined): string {
  return `${formatDateEn(start)} to ${formatDateEn(end)}`;
}
