/**
 * Pure helpers for the teacher attendance workflow.
 * Kept free of React so the behaviour can be unit tested directly.
 */

export interface SessionTiming {
  sessionDate: string; // YYYY-MM-DD (local school date)
  startTime: string; // HH:mm or HH:mm:ss
}

/**
 * A session has "occurred" once its scheduled start (local time) has been reached.
 * Future sessions stay viewable, but attendance must not be submitted for them.
 * Unparseable values are treated as NOT occurred so submission fails closed.
 */
export function hasSessionOccurred(session: SessionTiming, now: Date = new Date()): boolean {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(session.sessionDate);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(session.startTime);
  if (!dateMatch || !timeMatch) return false;
  const start = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] ?? 0),
  );
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() <= now.getTime();
}

/**
 * Issues monotonically increasing tokens so that only the most recent async
 * request is allowed to apply its result. Older (stale) responses are discarded.
 */
export function createLatestRequestGuard() {
  let latest = 0;
  return {
    /** Start a new request; invalidates every earlier token. */
    begin(): number {
      latest += 1;
      return latest;
    },
    /** Invalidate all in-flight requests without starting a new one. */
    invalidate(): void {
      latest += 1;
    },
    isLatest(token: number): boolean {
      return token === latest;
    },
  };
}
