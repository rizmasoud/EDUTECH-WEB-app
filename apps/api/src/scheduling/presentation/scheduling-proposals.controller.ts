import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../auth/presentation/guards/roles.guard';
import { Roles } from '../../auth/presentation/decorators/roles.decorator';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { SchedulingProposalsService } from '../application/services/scheduling-proposals.service';
import type {
  GenerateSchedulingProposalDto,
  ModifySchedulingProposalDto,
  FindSchedulingProposalsFilter,
  SchedulingProposalDto,
  AcceptProposalResponseDto,
  ValidateProposalResponseDto,
  PaginatedResult,
  AuthUser,
} from '@edutech/shared';

@Controller('scheduling/proposals')
@UseGuards(AuthGuard, RolesGuard)
export class SchedulingProposalsController {
  constructor(
    @Inject(SchedulingProposalsService)
    private readonly proposalsService: SchedulingProposalsService,
  ) {}

  @Get()
  @Roles('SUPERVISOR')
  async findAll(
    @Query() query: FindSchedulingProposalsFilter,
  ): Promise<PaginatedResult<SchedulingProposalDto>> {
    return this.proposalsService.findAll(query);
  }

  @Get(':id')
  @Roles('SUPERVISOR')
  async findById(@Param('id') id: string): Promise<SchedulingProposalDto> {
    return this.proposalsService.findById(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @Body() body: GenerateSchedulingProposalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    return this.proposalsService.generate(body, user);
  }

  @Post(':id/validate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Param('id') id: string,
  ): Promise<ValidateProposalResponseDto> {
    return this.proposalsService.validate(id);
  }

  @Post(':id/accept')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AcceptProposalResponseDto> {
    return this.proposalsService.accept(id, user);
  }

  @Post(':id/reject')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    return this.proposalsService.reject(id, user);
  }

  @Post(':id/modify')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async modify(
    @Param('id') id: string,
    @Body() body: ModifySchedulingProposalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    return this.proposalsService.modify(id, body, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async patch(
    @Param('id') id: string,
    @Body() body: ModifySchedulingProposalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SchedulingProposalDto> {
    return this.proposalsService.modify(id, body, user);
  }
}
