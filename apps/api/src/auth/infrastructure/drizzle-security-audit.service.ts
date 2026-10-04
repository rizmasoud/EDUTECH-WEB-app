import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import type { DrizzleDb } from '../../infrastructure/database/drizzle.provider';
import { auditLogs } from '../../infrastructure/database/schema/system.schema';
import type {
  ISecurityAuditService,
  SecurityAuditEvent,
} from '../domain/security-audit.interface';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'rawtoken',
  'raw_token',
  'token',
  'sessiontoken',
  'session_token',
  'cookie',
  'secret',
]);

@Injectable()
export class DrizzleSecurityAuditService implements ISecurityAuditService {
  private readonly logger = new Logger(DrizzleSecurityAuditService.name);

  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: DrizzleDb,
  ) {}

  async recordEvent(event: SecurityAuditEvent): Promise<void> {
    try {
      const sanitizedMetadata = this.sanitizeMetadata(event.metadata);

      await this.db.insert(auditLogs).values({
        actorAccountId: event.actorAccountId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        metadata: sanitizedMetadata,
      });
    } catch (err: unknown) {
      // Security audit logging failure must be logged to system stderr but not crash execution
      this.logger.error('Failed to record security audit log event', err);
    }
  }

  private sanitizeMetadata(
    metadata?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!metadata) return null;

    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(metadata)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lower)) {
        continue; // Never persist sensitive keys
      }
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        sanitized[key] = this.sanitizeMetadata(val as Record<string, unknown>);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }
}
