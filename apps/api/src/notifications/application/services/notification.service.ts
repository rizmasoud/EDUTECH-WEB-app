import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { eq, and, desc, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import { notifications } from '../../../infrastructure/database/schema/system.schema';
import type {
  AuthUser,
  CreateNotificationDto,
  NotificationDto,
  NotificationListResponseDto,
  NotificationType,
  QueryNotificationsDto,
} from '@edutech/shared';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Internal helper to create in-app notification.
   * By default, safeDispatch = true prevents failure from rolling back primary operations.
   */
  async createNotification(
    dto: CreateNotificationDto,
    safeDispatch = true,
  ): Promise<NotificationDto | null> {
    try {
      const [inserted] = await this.db
        .insert(notifications)
        .values({
          recipientAccountId: dto.recipientAccountId,
          type: dto.type,
          title: dto.title,
          message: dto.message,
          referenceEntityType: dto.referenceEntityType || null,
          referenceEntityId: dto.referenceEntityId || null,
          isRead: false,
          readAt: null,
        })
        .returning();

      return {
        id: inserted.id,
        recipientAccountId: inserted.recipientAccountId,
        type: inserted.type,
        title: inserted.title,
        message: inserted.message,
        referenceEntityType: inserted.referenceEntityType,
        referenceEntityId: inserted.referenceEntityId,
        isRead: inserted.isRead,
        createdAt: inserted.createdAt,
        readAt: inserted.readAt,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to create notification for account ${dto.recipientAccountId}: ${err.message}`,
        err.stack,
      );
      if (!safeDispatch) {
        throw err;
      }
      return null;
    }
  }

  /**
   * Helper to dispatch operational events safely
   */
  async dispatchOperationalEvent(
    type: NotificationType,
    recipientAccountId: string,
    title: string,
    message: string,
    referenceEntityType?: string | null,
    referenceEntityId?: string | null,
  ): Promise<NotificationDto | null> {
    return this.createNotification(
      {
        recipientAccountId,
        type,
        title,
        message,
        referenceEntityType: referenceEntityType || null,
        referenceEntityId: referenceEntityId || null,
      },
      true,
    );
  }

  /**
   * The only place a stored notification becomes an API response for its reader.
   *
   * Teachers get no financial detail and no payroll link: payroll endpoints are supervisor-only, so a payroll
   * notification for anyone else carries neutral text and no reference to the payroll. This also covers legacy
   * rows written before amounts were removed from the text (they may contain a total).
   */
  private toDto(row: any, user: AuthUser): NotificationDto {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    let message: string = row.message;
    let referenceEntityType: string | null = row.referenceEntityType;
    let referenceEntityId: string | null = row.referenceEntityId;

    if (!isSupervisor) {
      if (row.type === 'PAYROLL_READY') message = 'Your payroll for the current academic term has been calculated.';
      if (row.type === 'PAYROLL_FINALIZED') message = 'Your payroll for the academic term has been finalized.';
      if (row.type === 'PAYROLL_READY' || row.type === 'PAYROLL_FINALIZED' || referenceEntityType === 'PAYROLL') {
        referenceEntityType = null;
        referenceEntityId = null;
      }
    }

    return {
      id: row.id,
      recipientAccountId: row.recipientAccountId,
      type: row.type,
      title: row.title,
      message,
      referenceEntityType,
      referenceEntityId,
      isRead: row.isRead,
      createdAt: row.createdAt,
      readAt: row.readAt,
    };
  }

  /**
   * GET /api/v1/notifications
   * Returns authenticated user's notifications and unread count.
   */
  async listNotifications(
    user: AuthUser,
    query: QueryNotificationsDto = {},
  ): Promise<NotificationListResponseDto> {
    const conditions: SQL[] = [eq(notifications.recipientAccountId, user.id)];

    if (query.isRead !== undefined) {
      conditions.push(eq(notifications.isRead, query.isRead));
    }

    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));

    // Calculate unread count strictly for this user
    const [unreadCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, user.id),
          eq(notifications.isRead, false),
        ),
      );

    const unreadCount = unreadCountResult ? Number(unreadCountResult.count) : 0;

    const data: NotificationDto[] = rows.map((r: any) => this.toDto(r, user));

    return {
      data,
      unreadCount,
    };
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark a specific notification as read.
   */
  async markAsRead(id: string, user: AuthUser): Promise<NotificationDto> {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Notification with id ${id} not found`,
      });
    }

    // IDOR protection: only recipient can mark notification as read
    if (row.recipientAccountId !== user.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You are not authorized to access this notification',
      });
    }

    if (row.isRead) {
      return this.toDto(row, user);
    }

    const now = new Date();
    const [updated] = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
      })
      .where(eq(notifications.id, id))
      .returning();

    return this.toDto(updated, user);
  }

  /**
   * POST /api/v1/notifications/read-all
   * Mark all unread notifications for authenticated user as read.
   */
  async markAllAsRead(user: AuthUser): Promise<{ updatedCount: number }> {
    const now = new Date();

    const updatedRows = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
      })
      .where(
        and(
          eq(notifications.recipientAccountId, user.id),
          eq(notifications.isRead, false),
        ),
      )
      .returning({ id: notifications.id });

    return {
      updatedCount: updatedRows.length,
    };
  }
}
