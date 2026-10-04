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
import { ExamService } from '../application/services/exam.service';
import type { CreateExamDto, ExamDetailDto, AuthUser } from '@edutech/shared';

@Controller('classes/:classId/exams')
@UseGuards(AuthGuard, RolesGuard)
export class ClassExamsController {
  constructor(
    @Inject(ExamService)
    private readonly examService: ExamService,
  ) {}

  @Post()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('classId') classId: string,
    @Body() body: CreateExamDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamDetailDto> {
    return this.examService.createExam(classId, body, user);
  }

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async list(
    @Param('classId') classId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExamDetailDto[]> {
    return this.examService.listExamsForClass(classId, user);
  }
}
