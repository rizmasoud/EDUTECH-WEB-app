import { Injectable, Inject } from '@nestjs/common';
import type { HealthResponse } from '@edutech/shared';
import {
  DATABASE_HEALTH_CHECKER,
  IDatabaseHealthChecker,
} from '../domain/database-checker.interface';

@Injectable()
export class HealthService {
  private readonly appStartTime = Date.now();

  constructor(
    @Inject(DATABASE_HEALTH_CHECKER)
    private readonly databaseChecker: IDatabaseHealthChecker,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const dbResult = await this.databaseChecker.checkConnection();
    const uptimeSeconds = Math.floor((Date.now() - this.appStartTime) / 1000);

    const isHealthy = dbResult.connected;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      database: dbResult.connected ? 'connected' : 'disconnected',
      details: {
        databaseLatencyMs: dbResult.latencyMs,
        uptimeSeconds,
        message: dbResult.message,
      },
    };
  }
}
