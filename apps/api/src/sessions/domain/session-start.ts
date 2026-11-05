/**
 * Session start-time semantics.
 *
 * `class_sessions.session_date` (date) and `start_time` (time) are plain wall-clock values with
 * NO time zone: they are the school's local calendar date and clock time. To compare them with the
 * current instant they must be interpreted in the school's business time zone, never in the
 * server's time zone (which differs between developer machines, CI and production).
 */

/** The school operates in Iran (UTC+03:30, no daylight saving since 2022). */
export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Tehran';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Business time zone: `BUSINESS_TIME_ZONE` (IANA name) when set, otherwise Asia/Tehran. */
export function resolveBusinessTimeZone(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.BUSINESS_TIME_ZONE?.trim();
  if (!configured) return DEFAULT_BUSINESS_TIME_ZONE;
  if (!isValidTimeZone(configured)) {
    throw new Error(`BUSINESS_TIME_ZONE "${configured}" is not a valid IANA time zone name.`);
  }
  return configured;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Offset (ms) of `timeZone` from UTC at the given instant: local wall clock minus UTC. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Converts a wall-clock date (`YYYY-MM-DD`) and time (`HH:mm` or `HH:mm:ss`) in `timeZone`
 * to the exact UTC instant. Throws on malformed input rather than guessing.
 */
export function wallClockToInstant(
  sessionDate: string,
  startTime: string,
  timeZone: string,
): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(startTime);
  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid session date/time: "${sessionDate}" "${startTime}"`);
  }
  const wallClockAsUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] ?? 0),
  );
  // Resolve the offset at the candidate instant, then re-check once: this settles zones whose
  // offset changes between the wall-clock guess and the real instant (daylight-saving edges).
  const firstOffset = zoneOffsetMs(wallClockAsUtc, timeZone);
  let instant = wallClockAsUtc - firstOffset;
  const secondOffset = zoneOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = wallClockAsUtc - secondOffset;
  return new Date(instant);
}

/** True once the scheduled start instant has been reached (inclusive). */
export function hasSessionStarted(
  session: { sessionDate: string; startTime: string },
  now: Date,
  timeZone: string = resolveBusinessTimeZone(),
): boolean {
  return now.getTime() >= wallClockToInstant(session.sessionDate, session.startTime, timeZone).getTime();
}
