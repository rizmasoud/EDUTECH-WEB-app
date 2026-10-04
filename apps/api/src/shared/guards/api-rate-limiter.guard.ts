import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

interface RateLimitStore {
  count: number;
  resetAt: number;
}

@Injectable()
export class ApiRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(ApiRateLimiterGuard.name);
  private readonly store = new Map<string, RateLimitStore>();

  // Limits
  private readonly defaultLimit = 200; // standard request count per minute
  private readonly defaultWindowMs = 60000; // 1 minute window

  private readonly sensitiveLimit = 60; // sensitive / mutation endpoints limit per minute
  private readonly testLimit = 2; // test rate limit count
  private readonly testWindowMs = 10000; // 10 second window for testing

  constructor(private readonly configService?: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const env = this.configService?.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';

    // Extract Client IP securely using Express trust proxy
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';

    // Check for special test rate-limit header to trigger rate limiting in integration tests
    const isTestRateLimitTrigger = req.headers['x-test-rate-limit'] === 'true';

    // If we are in test environment and NOT explicitly testing rate limits, bypass to avoid flakiness
    if (env === 'test' && !isTestRateLimitTrigger) {
      return true;
    }

    const now = Date.now();
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    const isLogin = req.url.includes('/auth/login');

    // Resolve Limit and Window
    let limit = this.defaultLimit;
    let windowMs = this.defaultWindowMs;

    if (isTestRateLimitTrigger) {
      limit = this.testLimit;
      windowMs = this.testWindowMs;
    } else if (isMutation || isLogin) {
      limit = this.sensitiveLimit;
    }

    const key = `${ip}:${req.method}:${req.url.split('?')[0]}`;
    
    // Prune old entries to prevent memory leak
    this.pruneStore(now);

    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (entry.count >= limit) {
      this.logger.warn(`Rate limit exceeded for IP: ${ip} on URI: ${req.url}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  private pruneStore(now: Date | number): void {
    const nowTime = typeof now === 'number' ? now : now.getTime();
    if (this.store.size > 10000) {
      for (const [k, v] of this.store.entries()) {
        if (nowTime > v.resetAt) {
          this.store.delete(k);
        }
      }
    }
  }
}
