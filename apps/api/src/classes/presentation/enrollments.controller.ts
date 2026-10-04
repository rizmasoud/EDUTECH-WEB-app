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
import { EnrollmentsService } from '../application/services/enrollments.service';
import type {
  UpdateEnrollmentInput,
  EnrollmentResponseDto,
} from '../application/dto/enrollment.dto';

@Controller('enrollments')
@UseGuards(AuthGuard, RolesGuard)
export class EnrollmentsController {
  constructor(
    @Inject(EnrollmentsService)
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  @Get(':id')
  async findById(@Param('id') id: string): Promise<EnrollmentResponseDto> {
    return this.enrollmentsService.findById(id);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateEnrollmentInput,
  ): Promise<EnrollmentResponseDto> {
    return this.enrollmentsService.updateStatus(id, body);
  }

  @Post(':id/withdraw')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async withdraw(@Param('id') id: string): Promise<EnrollmentResponseDto> {
    return this.enrollmentsService.withdraw(id);
  }

  @Post(':id/complete')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string): Promise<EnrollmentResponseDto> {
    return this.enrollmentsService.complete(id);
  }
}
