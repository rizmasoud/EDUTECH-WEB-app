import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubstitutionService } from './application/services/substitution.service';
import { SubstitutionController } from './presentation/substitution.controller';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule],
  controllers: [SubstitutionController],
  providers: [SubstitutionService],
  exports: [SubstitutionService],
})
export class SubstitutionModule {}
