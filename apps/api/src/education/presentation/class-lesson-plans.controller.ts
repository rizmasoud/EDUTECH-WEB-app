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
import { LessonPlanService } from '../application/services/lesson-plan.service';
import type {
  CreateLessonPlanDto,
  LessonPlanDetailDto,
  AuthUser,
} from '@edutech/shared';

@Controller('classes/:classId/lesson-plans')
@UseGuards(AuthGuard, RolesGuard)
export class ClassLessonPlansController {
  constructor(
    @Inject(LessonPlanService)
    private readonly lessonPlanService: LessonPlanService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findByClass(
    @Param('classId') classId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto[]> {
    return this.lessonPlanService.findByClass(classId, user);
  }

  @Post()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('classId') classId: string,
    @Body() body: CreateLessonPlanDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanDetailDto> {
    return this.lessonPlanService.create(classId, body, user);
  }
}
