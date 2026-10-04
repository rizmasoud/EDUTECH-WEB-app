import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { SchedulesService } from '../application/services/schedules.service';
import type {
  CreateScheduleDto,
  UpdateScheduleDto,
  FindSchedulesFilter,
  ScheduleDto,
  AuthUser,
} from '@edutech/shared';

@Controller('schedules')
@UseGuards(AuthGuard, RolesGuard)
export class SchedulesController {
  constructor(
    @Inject(SchedulesService)
    private readonly schedulesService: SchedulesService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  async findAll(
    @Query() query: FindSchedulesFilter,
    @CurrentUser() user: AuthUser,
  ): Promise<ScheduleDto[]> {
    return this.schedulesService.findAll(query, user);
  }

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ScheduleDto> {
    return this.schedulesService.findById(id, user);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateScheduleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ScheduleDto> {
    return this.schedulesService.create(body, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ScheduleDto> {
    return this.schedulesService.update(id, body, user);
  }

  @Delete(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ success: boolean }> {
    const success = await this.schedulesService.delete(id, user);
    return { success };
  }
}
