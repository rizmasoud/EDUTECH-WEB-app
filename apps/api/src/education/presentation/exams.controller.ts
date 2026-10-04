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
import { ExamService } from '../application/services/exam.service';
import type {
  UpdateExamDto,
  CreateExamResultDto,
  ExamDetailDto,
  ExamResultDetailDto,
  AuthUser,
} from '@edutech/shared';

@Controller('exams')
@UseGuards(AuthGuard, RolesGuard)
export class ExamsController {
  constructor(
    @Inject(ExamService)
    private readonly examService: ExamService,
  ) {}

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async getExam(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamDetailDto> {
    return this.examService.getExam(id, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async updateExam(
    @Param('id') id: string,
    @Body() body: UpdateExamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamDetailDto> {
    return this.examService.updateExam(id, body, user);
  }

  @Get(':examId/results')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async listResults(
    @Param('examId') examId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamResultDetailDto[]> {
    return this.examService.listResultsForExam(examId, user);
  }

  @Post(':examId/results')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.CREATED)
  async createResult(
    @Param('examId') examId: string,
    @Body() body: CreateExamResultDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamResultDetailDto> {
    return this.examService.createExamResult(examId, body, user);
  }
}
