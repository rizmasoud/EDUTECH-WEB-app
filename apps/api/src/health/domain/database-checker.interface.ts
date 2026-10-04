/**
 * Domain Interface for Database Health Checking
 *
 * ARCHITECTURAL RULE:
 * The domain layer MUST NOT import NestJS, Next.js, Drizzle, or PostgreSQL-specific code.
 * Infrastructure layers implement this interface.
 */

export interface DatabaseCheckResult {
  connected: boolean;
  latencyMs?: number;
  message?: string;
  error?: string;
}

export interface IDatabaseHealthChecker {
  checkConnection(): Promise<DatabaseCheckResult>;
}

export const DATABASE_HEALTH_CHECKER = Symbol('IDatabaseHealthChecker');
