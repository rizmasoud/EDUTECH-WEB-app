import {
  Controller,
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
import { ExamService } from '../application/services/exam.service';
import { PromotionService } from '../application/services/promotion.service';
import type {
  UpdateExamResultDto,
  ExamResultDetailDto,
  PromotionDetailDto,
  AuthUser,
} from '@edutech/shared';

@Controller('exam-results')
@UseGuards(AuthGuard, RolesGuard)
export class ExamResultsController {
  constructor(
    @Inject(ExamService)
    private readonly examService: ExamService,
    @Inject(PromotionService)
    private readonly promotionService: PromotionService,
  ) {}

  @Patch(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async updateResult(
    @Param('id') id: string,
    @Body() body: UpdateExamResultDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamResultDetailDto> {
    return this.examService.updateExamResult(id, body, user);
  }

  @Post(':id/process-promotion')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async processPromotion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto> {
    return this.promotionService.processExamResult(id, user);
  }
}
