import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { HealthController } from './presentation/health.controller';
import { HealthService } from './application/health.service';
import { DATABASE_HEALTH_CHECKER } from './domain/database-checker.interface';
import { DrizzleDatabaseHealthChecker } from './infrastructure/drizzle-database-health.checker';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: DATABASE_HEALTH_CHECKER,
      useClass: DrizzleDatabaseHealthChecker,
    },
  ],
  exports: [HealthService],
})
export class HealthModule {}
