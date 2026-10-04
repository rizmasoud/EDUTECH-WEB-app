import {
  Controller,
  Get,
  Patch,
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
import { LessonPlanService } from '../application/services/lesson-plan.service';
import type {
  UpdateLessonPlanDto,
  RejectLessonPlanDto,
  LessonPlanDetailDto,
  AuthUser,
} from '@edutech/shared';

@Controller('lesson-plans')
@UseGuards(AuthGuard, RolesGuard)
export class LessonPlansController {
  constructor(
    @Inject(LessonPlanService)
    private readonly lessonPlanService: LessonPlanService,
  ) {}

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateLessonPlanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.update(id, body, user);
  }

  @Post(':id/submit')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.submit(id, user);
  }

  @Post(':id/approve')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.approve(id, user);
  }

  @Post(':id/reject')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() body: RejectLessonPlanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.reject(id, body, user);
  }
}
