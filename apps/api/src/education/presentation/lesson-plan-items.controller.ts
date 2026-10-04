import {
  Controller,
  Post,
  Param,
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
import type { LessonPlanItemDto, AuthUser } from '@edutech/shared';

@Controller('lesson-plan-items')
@UseGuards(AuthGuard, RolesGuard)
export class LessonPlanItemsController {
  constructor(
    @Inject(LessonPlanService)
    private readonly lessonPlanService: LessonPlanService,
  ) {}

  @Post(':id/complete')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonPlanItemDto> {
    return this.lessonPlanService.completeItem(id, user);
  }
}
