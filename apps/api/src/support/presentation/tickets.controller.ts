import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
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
import { TicketService } from '../application/services/ticket.service';
import { QueryTicketsSchema } from '@edutech/shared';
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
} from '@edutech/shared';

@Controller('tickets')
@UseGuards(AuthGuard)
export class TicketsController {
  constructor(
    @Inject(TicketService)
    private readonly ticketService: TicketService,
  ) {}

  @Get()
  async listTickets(
    @CurrentUser() user: AuthUser,
    @Query() query: any,
  ) {
    const parseResult = QueryTicketsSchema.safeParse(query || {});
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    return this.ticketService.listTickets(user, parseResult.data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.createTicket(dto, user);
  }

  @Get(':id')
  async getTicket(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.getTicket(id, user);
  }

  @Patch(':id')
  async updateTicket(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.updateTicket(id, dto, user);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.assignTicket(id, dto, user);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveTicket(
    @Param('id') id: string,
    @Body() dto: ResolveTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.resolveTicket(id, dto, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectTicket(
    @Param('id') id: string,
    @Body() dto: RejectTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.rejectTicket(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTicket(
    @Param('id') id: string,
    @Body() dto: CancelTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.cancelTicket(id, dto, user);
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.listMessages(id, user);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addMessage(
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.addMessage(id, dto, user);
  }

  @Get(':id/attachments')
  async listAttachments(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.listAttachments(id, user);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @Param('id') id: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketService.addAttachment(id, dto, user);
  }
}
