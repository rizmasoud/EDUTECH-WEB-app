import { Module } from '@nestjs/common';
import { NotificationService } from './application/services/notification.service';
import { NotificationsController } from './presentation/notifications.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
