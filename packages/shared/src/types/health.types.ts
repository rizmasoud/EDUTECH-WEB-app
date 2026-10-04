export type DatabaseStatus = 'connected' | 'disconnected';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  environment: string;
  timestamp: string;
  database: DatabaseStatus;
  details?: {
    databaseLatencyMs?: number;
    uptimeSeconds?: number;
    message?: string;
  };
}
