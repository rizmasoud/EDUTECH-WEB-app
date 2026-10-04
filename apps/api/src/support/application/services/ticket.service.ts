import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc, asc, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  tickets,
  ticketMessages,
  attachments,
} from '../../../infrastructure/database/schema/support.schema';
import { accounts, accountRoles, roles } from '../../../infrastructure/database/schema/auth.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  AssignTicketSchema,
  ResolveTicketSchema,
  RejectTicketSchema,
  CancelTicketSchema,
  CreateTicketMessageSchema,
  CreateAttachmentSchema,
  QueryTicketsSchema,
} from '@edutech/shared';
import type {
  AuthUser,
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  ResolveTicketDto,
  RejectTicketDto,
  CancelTicketDto,
  CreateTicketMessageDto,
  CreateAttachmentDto,
  TicketDto,
  TicketDetailDto,
  TicketMessageDto,
  AttachmentDto,
  QueryTicketsDto,
} from '@edutech/shared';

@Injectable()
export class TicketService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper to verify supervisor role
   */
  private assertSupervisor(user: AuthUser) {
    if (!user.roles.includes('SUPERVISOR')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supervisors can perform this operation',
      });
    }
  }

  /**
   * Helper to check ticket visibility for authenticated user
   */
  private checkTicketAccess(ticket: any, user: AuthUser) {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isCreator = ticket.createdBy === user.id;
    const isAssignee = ticket.assignedTo === user.id;

    if (!isSupervisor && !isCreator && !isAssignee) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'You do not have permission to access this ticket',
      });
    }
  }

  /**
   * POST /api/v1/tickets
   * Create a new ticket (default status: OPEN)
   */
  async createTicket(dto: CreateTicketDto, user: AuthUser): Promise<TicketDetailDto> {
    const parseResult = CreateTicketSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const now = new Date();

    const createdId = await this.db.transaction(async (tx: any) => {
      const [ticket] = await tx
        .insert(tickets)
        .values({
          createdBy: user.id,
          assignedTo: null,
          type: data.type,
          status: 'OPEN',
          title: data.title,
          description: data.description,
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_TICKET',
        entityType: 'TICKET',
        entityId: ticket.id,
        metadata: {
          type: data.type,
          title: data.title,
          createdBy: user.id,
        },
      });

      return ticket.id;
    });

    // Notify supervisors safely
    const supervisorRoles = await this.db
      .select({ accountId: accountRoles.accountId })
      .from(accountRoles)
      .innerJoin(roles, eq(accountRoles.roleId, roles.id))
      .where(eq(roles.name, 'SUPERVISOR'));

    for (const sup of supervisorRoles) {
      if (sup.accountId !== user.id) {
        await this.notificationService.dispatchOperationalEvent(
          'TICKET_CREATED',
          sup.accountId,
          `New Ticket: ${data.title}`,
          `A new ticket of type ${data.type} was created.`,
          'TICKET',
          createdId,
        );
      }
    }

    return this.getTicket(createdId, user);
  }

  /**
   * GET /api/v1/tickets
   * List tickets with role-based filtering and criteria
   */
  async listTickets(user: AuthUser, query: QueryTicketsDto = {}): Promise<TicketDetailDto[]> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    const conditions: SQL[] = [];

    if (!isSupervisor) {
      // Teachers only see their own tickets
      conditions.push(eq(tickets.createdBy, user.id));
    } else {
      if (query.createdBy) {
        conditions.push(eq(tickets.createdBy, query.createdBy));
      }
    }

    if (query.status) {
      conditions.push(eq(tickets.status, query.status));
    }
    if (query.type) {
      conditions.push(eq(tickets.type, query.type));
    }
    if (query.assignedTo) {
      conditions.push(eq(tickets.assignedTo, query.assignedTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(tickets)
      .where(whereClause)
      .orderBy(desc(tickets.createdAt));

    const result: TicketDetailDto[] = [];
    for (const row of rows) {
      const [creator] = await this.db
        .select({ id: accounts.id, personnelCode: accounts.personnelCode })
        .from(accounts)
        .where(eq(accounts.id, row.createdBy))
        .limit(1);

      let assignee: { id: string; personnelCode: string } | null = null;
      if (row.assignedTo) {
        const [ass] = await this.db
          .select({ id: accounts.id, personnelCode: accounts.personnelCode })
          .from(accounts)
          .where(eq(accounts.id, row.assignedTo))
          .limit(1);
        assignee = ass || null;
      }

      result.push({
        id: row.id,
        createdBy: row.createdBy,
        assignedTo: row.assignedTo,
        type: row.type,
        status: row.status,
        title: row.title,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        resolvedAt: row.resolvedAt,
        creator: creator
          ? {
              id: creator.id,
              personnelCode: creator.personnelCode,
            }
          : undefined,
        assignee: assignee
          ? {
              id: assignee.id,
              personnelCode: assignee.personnelCode,
            }
          : null,
      });
    }

    return result;
  }

  /**
   * GET /api/v1/tickets/:id
   * Get ticket details with messages and attachments
   */
  async getTicket(id: string, user: AuthUser): Promise<TicketDetailDto> {
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    const [creator] = await this.db
      .select({ id: accounts.id, personnelCode: accounts.personnelCode })
      .from(accounts)
      .where(eq(accounts.id, ticket.createdBy))
      .limit(1);

    let assignee: { id: string; personnelCode: string } | null = null;
    if (ticket.assignedTo) {
      const [ass] = await this.db
        .select({ id: accounts.id, personnelCode: accounts.personnelCode })
        .from(accounts)
        .where(eq(accounts.id, ticket.assignedTo))
        .limit(1);
      assignee = ass || null;
    }

    const messages = await this.listMessages(id, user);
    const attachmentList = await this.listAttachments(id, user);

    return {
      id: ticket.id,
      createdBy: ticket.createdBy,
      assignedTo: ticket.assignedTo,
      type: ticket.type,
      status: ticket.status,
      title: ticket.title,
      description: ticket.description,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt,
      creator: creator
        ? {
            id: creator.id,
            personnelCode: creator.personnelCode,
          }
        : undefined,
      assignee: assignee
        ? {
            id: assignee.id,
            personnelCode: assignee.personnelCode,
          }
        : null,
      messages,
      attachments: attachmentList,
    };
  }

  /**
   * PATCH /api/v1/tickets/:id
   * Update editable ticket fields (title, description)
   */
  async updateTicket(
    id: string,
    dto: UpdateTicketDto,
    user: AuthUser,
  ): Promise<TicketDetailDto> {
    const parseResult = UpdateTicketSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot update a closed ticket with status '${ticket.status}'`,
      });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (parseResult.data.title !== undefined) {
      updateData.title = parseResult.data.title;
    }
    if (parseResult.data.description !== undefined) {
      updateData.description = parseResult.data.description;
    }

    await this.db.transaction(async (tx: any) => {
      await tx.update(tickets).set(updateData).where(eq(tickets.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_TICKET',
        entityType: 'TICKET',
        entityId: id,
        metadata: {
          updates: parseResult.data,
        },
      });
    });

    return this.getTicket(id, user);
  }

  /**
   * POST /api/v1/tickets/:id/assign
   * Supervisor assigns ticket to an account (transitions to IN_PROGRESS)
   */
  async assignTicket(
    id: string,
    dto: AssignTicketDto,
    user: AuthUser,
  ): Promise<TicketDetailDto> {
    this.assertSupervisor(user);

    const parseResult = AssignTicketSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot assign a closed ticket in status '${ticket.status}'`,
      });
    }

    const [assignee] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, parseResult.data.assignedTo))
      .limit(1);

    if (!assignee || !assignee.isActive) {
      throw new BadRequestException({
        code: 'INVALID_ASSIGNEE',
        message: `Assigned account ${parseResult.data.assignedTo} does not exist or is inactive`,
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(tickets)
        .set({
          assignedTo: parseResult.data.assignedTo,
          status: 'IN_PROGRESS',
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'ASSIGN_TICKET',
        entityType: 'TICKET',
        entityId: id,
        metadata: {
          assignedTo: parseResult.data.assignedTo,
          assignedBy: user.id,
          previousStatus: ticket.status,
          newStatus: 'IN_PROGRESS',
        },
      });
    });

    // Notify assignee
    await this.notificationService.dispatchOperationalEvent(
      'TICKET_UPDATED',
      parseResult.data.assignedTo,
      `Ticket Assigned: ${ticket.title}`,
      `You were assigned to ticket "${ticket.title}".`,
      'TICKET',
      id,
    );

    // Notify creator
    if (ticket.createdBy !== user.id) {
      await this.notificationService.dispatchOperationalEvent(
        'TICKET_UPDATED',
        ticket.createdBy,
        `Ticket In Progress: ${ticket.title}`,
        `Your ticket was assigned and is now in progress.`,
        'TICKET',
        id,
      );
    }

    return this.getTicket(id, user);
  }

  /**
   * POST /api/v1/tickets/:id/resolve
   * Supervisor resolves ticket (transitions to RESOLVED, sets resolvedAt)
   */
  async resolveTicket(
    id: string,
    dto: ResolveTicketDto = {},
    user: AuthUser,
  ): Promise<TicketDetailDto> {
    this.assertSupervisor(user);

    const parseResult = ResolveTicketSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot resolve an already closed ticket in status '${ticket.status}'`,
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(tickets)
        .set({
          status: 'RESOLVED',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'RESOLVE_TICKET',
        entityType: 'TICKET',
        entityId: id,
        metadata: {
          resolvedBy: user.id,
          resolutionNotes: parseResult.data.resolutionNotes || null,
          previousStatus: ticket.status,
          newStatus: 'RESOLVED',
        },
      });
    });

    // Notify ticket creator
    await this.notificationService.dispatchOperationalEvent(
      'TICKET_UPDATED',
      ticket.createdBy,
      `Ticket Resolved: ${ticket.title}`,
      `Your ticket has been resolved by a supervisor.`,
      'TICKET',
      id,
    );

    return this.getTicket(id, user);
  }

  /**
   * POST /api/v1/tickets/:id/reject
   * Supervisor rejects ticket (transitions to REJECTED)
   */
  async rejectTicket(
    id: string,
    dto: RejectTicketDto = {},
    user: AuthUser,
  ): Promise<TicketDetailDto> {
    this.assertSupervisor(user);

    const parseResult = RejectTicketSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot reject an already closed ticket in status '${ticket.status}'`,
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(tickets)
        .set({
          status: 'REJECTED',
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'REJECT_TICKET',
        entityType: 'TICKET',
        entityId: id,
        metadata: {
          rejectedBy: user.id,
          reason: parseResult.data.reason || null,
          previousStatus: ticket.status,
          newStatus: 'REJECTED',
        },
      });
    });

    // Notify ticket creator
    await this.notificationService.dispatchOperationalEvent(
      'TICKET_UPDATED',
      ticket.createdBy,
      `Ticket Rejected: ${ticket.title}`,
      `Your ticket was rejected: ${parseResult.data.reason || 'No reason specified'}`,
      'TICKET',
      id,
    );

    return this.getTicket(id, user);
  }

  /**
   * POST /api/v1/tickets/:id/cancel
   * Creator (or Supervisor) cancels ticket (transitions to CANCELLED)
   */
  async cancelTicket(
    id: string,
    dto: CancelTicketDto = {},
    user: AuthUser,
  ): Promise<TicketDetailDto> {
    const parseResult = CancelTicketSchema.safeParse(dto || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${id} not found`,
      });
    }

    const isSupervisor = user.roles.includes('SUPERVISOR');
    const isCreator = ticket.createdBy === user.id;

    if (!isSupervisor && !isCreator) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only the ticket creator or a supervisor can cancel this ticket',
      });
    }

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot cancel an already closed ticket in status '${ticket.status}'`,
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx: any) => {
      await tx
        .update(tickets)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CANCEL_TICKET',
        entityType: 'TICKET',
        entityId: id,
        metadata: {
          cancelledBy: user.id,
          reason: parseResult.data.reason || null,
          previousStatus: ticket.status,
          newStatus: 'CANCELLED',
        },
      });
    });

    if (ticket.assignedTo && ticket.assignedTo !== user.id) {
      await this.notificationService.dispatchOperationalEvent(
        'TICKET_UPDATED',
        ticket.assignedTo,
        `Ticket Cancelled: ${ticket.title}`,
        `Ticket "${ticket.title}" has been cancelled.`,
        'TICKET',
        id,
      );
    }

    return this.getTicket(id, user);
  }

  /**
   * GET /api/v1/tickets/:id/messages
   * List messages for a ticket ordered chronologically
   */
  async listMessages(ticketId: string, user: AuthUser): Promise<TicketMessageDto[]> {
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${ticketId} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    const rows = await this.db
      .select({
        message: ticketMessages,
        author: accounts,
      })
      .from(ticketMessages)
      .innerJoin(accounts, eq(ticketMessages.authorId, accounts.id))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(asc(ticketMessages.createdAt));

    return rows.map((r: any) => ({
      id: r.message.id,
      ticketId: r.message.ticketId,
      authorId: r.message.authorId,
      body: r.message.body,
      createdAt: r.message.createdAt,
      author: {
        id: r.author.id,
        personnelCode: r.author.personnelCode,
      },
    }));
  }

  /**
   * POST /api/v1/tickets/:id/messages
   * Add a message to a ticket
   */
  async addMessage(
    ticketId: string,
    dto: CreateTicketMessageDto,
    user: AuthUser,
  ): Promise<TicketMessageDto> {
    const parseResult = CreateTicketMessageSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${ticketId} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot add messages to a closed ticket in status '${ticket.status}'`,
      });
    }

    const now = new Date();
    const created = await this.db.transaction(async (tx: any) => {
      const [msg] = await tx
        .insert(ticketMessages)
        .values({
          ticketId,
          authorId: user.id,
          body: parseResult.data.body,
          createdAt: now,
        })
        .returning();

      await tx
        .update(tickets)
        .set({ updatedAt: now })
        .where(eq(tickets.id, ticketId));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'ADD_TICKET_MESSAGE',
        entityType: 'TICKET_MESSAGE',
        entityId: msg.id,
        metadata: {
          ticketId,
          authorId: user.id,
        },
      });

      return msg;
    });

    // Notify other party
    if (ticket.createdBy !== user.id) {
      await this.notificationService.dispatchOperationalEvent(
        'TICKET_UPDATED',
        ticket.createdBy,
        `New Message on Ticket: ${ticket.title}`,
        `A new reply was posted on your ticket.`,
        'TICKET',
        ticketId,
      );
    } else if (ticket.assignedTo && ticket.assignedTo !== user.id) {
      await this.notificationService.dispatchOperationalEvent(
        'TICKET_UPDATED',
        ticket.assignedTo,
        `New Message on Ticket: ${ticket.title}`,
        `A new message was posted by the creator.`,
        'TICKET',
        ticketId,
      );
    }

    return {
      id: created.id,
      ticketId: created.ticketId,
      authorId: created.authorId,
      body: created.body,
      createdAt: created.createdAt,
      author: {
        id: user.id,
        personnelCode: user.personnelCode,
      },
    };
  }

  /**
   * GET /api/v1/tickets/:id/attachments
   * List attachments for a ticket
   */
  async listAttachments(ticketId: string, user: AuthUser): Promise<AttachmentDto[]> {
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${ticketId} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    const rows = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.ticketId, ticketId))
      .orderBy(asc(attachments.createdAt));

    return rows.map((r: any) => ({
      id: r.id,
      ticketId: r.ticketId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      size: r.size,
      storageKey: r.storageKey,
      createdAt: r.createdAt,
    }));
  }

  /**
   * POST /api/v1/tickets/:id/attachments
   * Add attachment metadata to a ticket
   */
  async addAttachment(
    ticketId: string,
    dto: CreateAttachmentDto,
    user: AuthUser,
  ): Promise<AttachmentDto> {
    const parseResult = CreateAttachmentSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Ticket with id ${ticketId} not found`,
      });
    }

    this.checkTicketAccess(ticket, user);

    if (
      ticket.status === 'RESOLVED' ||
      ticket.status === 'REJECTED' ||
      ticket.status === 'CANCELLED'
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: `Cannot add attachments to a closed ticket in status '${ticket.status}'`,
      });
    }

    const data = parseResult.data;

    if (data.storageKey.includes('..') || data.storageKey.startsWith('/') || data.storageKey.includes('\\')) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Invalid storageKey: path traversal or absolute paths are not allowed',
      });
    }

    const now = new Date();

    const created = await this.db.transaction(async (tx: any) => {
      const [att] = await tx
        .insert(attachments)
        .values({
          ticketId,
          fileName: data.fileName,
          mimeType: data.mimeType,
          size: data.size,
          storageKey: data.storageKey,
          createdAt: now,
        })
        .returning();

      await tx
        .update(tickets)
        .set({ updatedAt: now })
        .where(eq(tickets.id, ticketId));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'ADD_ATTACHMENT',
        entityType: 'ATTACHMENT',
        entityId: att.id,
        metadata: {
          ticketId,
          fileName: data.fileName,
          size: data.size,
          mimeType: data.mimeType,
        },
      });

      return att;
    });

    return {
      id: created.id,
      ticketId: created.ticketId,
      fileName: created.fileName,
      mimeType: created.mimeType,
      size: created.size,
      storageKey: created.storageKey,
      createdAt: created.createdAt,
    };
  }
}
