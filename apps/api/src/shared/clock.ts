/**
 * Minimal clock abstraction so time-dependent business rules can be tested deterministically.
 * Production code uses `systemClock`; tests may provide their own `CLOCK`.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
