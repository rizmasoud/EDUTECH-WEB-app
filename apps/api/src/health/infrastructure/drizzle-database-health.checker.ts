import { Injectable, Inject, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDb } from '../../infrastructure/database/drizzle.provider';
import {
  IDatabaseHealthChecker,
  DatabaseCheckResult,
} from '../domain/database-checker.interface';

@Injectable()
export class DrizzleDatabaseHealthChecker implements IDatabaseHealthChecker {
  private readonly logger = new Logger(DrizzleDatabaseHealthChecker.name);

  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: DrizzleDb,
  ) {}

  async checkConnection(): Promise<DatabaseCheckResult> {
    const startTime = Date.now();
    try {
      // Execute a lightweight ping query via Drizzle ORM
      await this.db.execute(sql`SELECT 1 as ping`);
      const latencyMs = Date.now() - startTime;
      return {
        connected: true,
        latencyMs,
        message: 'PostgreSQL connection verified via Drizzle ORM',
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Failed to connect to PostgreSQL';
      this.logger.warn(`Database health check failed (${latencyMs}ms): ${errorMessage}`);
      return {
        connected: false,
        latencyMs,
        error: errorMessage,
        message: 'PostgreSQL is unreachable. Ensure the database is running (e.g. docker compose up -d).',
      };
    }
  }
}
