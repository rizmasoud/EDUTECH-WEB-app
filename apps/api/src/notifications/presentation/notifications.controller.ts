import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { NotificationService } from '../application/services/notification.service';
import { QueryNotificationsSchema } from '@edutech/shared';
import type { AuthUser } from '@edutech/shared';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
  ) {}

  @Get()
  async listNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: any,
  ) {
    const parseResult = QueryNotificationsSchema.safeParse(query || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    return this.notificationService.listNotifications(user, parseResult.data);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationService.markAsRead(id, user);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllAsRead(user);
  }
}
