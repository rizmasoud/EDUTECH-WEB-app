export interface SecurityAuditEvent {
  actorAccountId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ISecurityAuditService {
  recordEvent(event: SecurityAuditEvent): Promise<void>;
}
