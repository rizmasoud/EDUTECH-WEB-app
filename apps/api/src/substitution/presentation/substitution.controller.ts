import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../auth/presentation/guards/roles.guard';
import { Roles } from '../../auth/presentation/decorators/roles.decorator';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { SubstitutionService } from '../application/services/substitution.service';
import type {
  CreateSubstitutionRequestDto,
  RespondSubstitutionDto,
  ApproveSubstitutionDto,
  SubstitutionRequestDetailDto,
  SubstitutionCandidateDto,
  AuthUser,
} from '@edutech/shared';

@Controller('substitution-requests')
@UseGuards(AuthGuard, RolesGuard)
export class SubstitutionController {
  constructor(
    @Inject(SubstitutionService)
    private readonly substitutionService: SubstitutionService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findAll(
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto[]> {
    return this.substitutionService.findAll(user);
  }

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.findOneDetail(id, user);
  }

  @Post()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSubstitutionRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.create(body, user);
  }

  @Post(':id/broadcast')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async broadcast(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.broadcast(id, user);
  }

  @Post(':id/respond')
  @Roles('TEACHER')
  @HttpCode(HttpStatus.OK)
  async respond(
    @Param('id') id: string,
    @Body() body: RespondSubstitutionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.respond(id, body, user);
  }

  @Post(':id/approve')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveSubstitutionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.approve(id, body, user);
  }

  @Post(':id/reject')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.reject(id, user);
  }

  @Post(':id/cancel')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SubstitutionRequestDetailDto> {
    return this.substitutionService.cancel(id, user);
  }
}
