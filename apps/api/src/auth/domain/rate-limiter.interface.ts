export interface ILoginRateLimiter {
  isRateLimited(key: string): boolean;
  recordFailure(key: string): void;
  reset(key: string): void;
  getRemainingAttempts(key: string): number;
}
