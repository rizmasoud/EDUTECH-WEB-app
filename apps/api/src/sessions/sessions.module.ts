import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SessionsController } from './presentation/sessions.controller';
import { SessionGenerationService } from './application/services/session-generation.service';
import { AttendanceService } from './application/services/attendance.service';
import { SessionLifecycleService } from './application/services/session-lifecycle.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SessionsController],
  providers: [SessionGenerationService, AttendanceService, SessionLifecycleService],
  exports: [SessionGenerationService, AttendanceService, SessionLifecycleService],
})
export class SessionsModule {}
