import { Module } from '@nestjs/common';
import { TicketService } from './application/services/ticket.service';
import { TicketsController } from './presentation/tickets.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketService],
  exports: [TicketService],
})
export class SupportModule {}
