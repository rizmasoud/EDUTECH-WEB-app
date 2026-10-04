import {
  Controller,
  Get,
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
import { PromotionService } from '../application/services/promotion.service';
import type { PromotionDetailDto, AuthUser } from '@edutech/shared';

@Controller('students/:id/promotions')
@UseGuards(AuthGuard, RolesGuard)
export class StudentPromotionsController {
  constructor(
    @Inject(PromotionService)
    private readonly promotionService: PromotionService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async listForStudent(
    @Param('id') studentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto[]> {
    return this.promotionService.listPromotionsForStudent(studentId, user);
  }
}
