import {
  Controller,
  Patch,
  Delete,
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
import { SyllabusService } from '../application/services/syllabus.service';
import type {
  UpdateSyllabusItemDto,
  SyllabusItemDto,
  AuthUser,
} from '@edutech/shared';

@Controller('syllabus-items')
@UseGuards(AuthGuard, RolesGuard)
export class SyllabusItemsController {
  constructor(
    @Inject(SyllabusService)
    private readonly syllabusService: SyllabusService,
  ) {}

  @Patch(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async updateItem(
    @Param('id') id: string,
    @Body() body: UpdateSyllabusItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SyllabusItemDto> {
    return this.syllabusService.updateItem(id, body, user);
  }

  @Delete(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async deleteItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; deleted: boolean }> {
    return this.syllabusService.deleteItem(id, user);
  }
}
