import { Injectable, Optional } from '@nestjs/common';
import type { ILoginRateLimiter } from '../domain/rate-limiter.interface';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class MemoryLoginRateLimiter implements ILoginRateLimiter {
  private readonly attempts = new Map<string, RateLimitEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxTrackedKeys = 10000;

  constructor(@Optional() options?: { maxAttempts?: number; windowMs?: number }) {
    this.maxAttempts = options?.maxAttempts ?? 5;
    this.windowMs = options?.windowMs ?? 15 * 60 * 1000; // 15 minutes
  }

  isRateLimited(key: string): boolean {
    this.pruneIfNeeded();
    const entry = this.attempts.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now > entry.resetAt) {
      this.attempts.delete(key);
      return false;
    }

    return entry.count >= this.maxAttempts;
  }

  recordFailure(key: string): void {
    this.pruneIfNeeded();
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return;
    }

    entry.count += 1;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  getRemainingAttempts(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry || Date.now() > entry.resetAt) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - entry.count);
  }

  private pruneIfNeeded(): void {
    const now = Date.now();
    if (this.attempts.size > this.maxTrackedKeys) {
      for (const [key, entry] of this.attempts.entries()) {
        if (now > entry.resetAt) {
          this.attempts.delete(key);
        }
      }
    }
  }
}
