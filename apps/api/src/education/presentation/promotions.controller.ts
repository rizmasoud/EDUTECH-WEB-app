import {
  Controller,
  Get,
  Post,
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
import { PromotionService } from '../application/services/promotion.service';
import type {
  DecidePromotionDto,
  PromotionDetailDto,
  PromotionStatus,
  AuthUser,
} from '@edutech/shared';

@Controller('promotions')
@UseGuards(AuthGuard, RolesGuard)
export class PromotionsController {
  constructor(
    @Inject(PromotionService)
    private readonly promotionService: PromotionService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async list(
    @Query('studentId') studentId: string | undefined,
    @Query('status') status: PromotionStatus | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto[]> {
    return this.promotionService.listPromotions({ studentId, status }, user);
  }

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto> {
    return this.promotionService.getPromotion(id, user);
  }

  @Post(':id/decision')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async decide(
    @Param('id') id: string,
    @Body() body: DecidePromotionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto> {
    return this.promotionService.decidePromotion(id, body, user);
  }

  @Post(':id/decide')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async decideAlias(
    @Param('id') id: string,
    @Body() body: DecidePromotionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto> {
    return this.promotionService.decidePromotion(id, body, user);
  }

  @Post('process/:examResultId')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async process(
    @Param('examResultId') examResultId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PromotionDetailDto> {
    return this.promotionService.processExamResult(examResultId, user);
  }
}
