import {
  Controller,
  Get,
  Post,
  Patch,
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
import { SessionGenerationService } from '../application/services/session-generation.service';
import { AttendanceService } from '../application/services/attendance.service';
import { SessionLifecycleService } from '../application/services/session-lifecycle.service';
import type {
  GenerateClassSessionsDto,
  FindClassSessionsFilterDto,
  ClassSessionDto,
  ClassSessionDetailDto,
  RecordStudentAttendanceDto,
  RecordTeacherAttendanceDto,
  AttendanceRecordWithStudentDto,
  CancelClassSessionDto,
  UpdateClassSessionDto,
  ClassSessionLifecycleResponseDto,
  AuthUser,
} from '@edutech/shared';

@Controller('sessions')
@UseGuards(AuthGuard, RolesGuard)
export class SessionsController {
  constructor(
    @Inject(SessionGenerationService)
    private readonly sessionsService: SessionGenerationService,
    @Inject(AttendanceService)
    private readonly attendanceService: AttendanceService,
    @Inject(SessionLifecycleService)
    private readonly lifecycleService: SessionLifecycleService,
  ) {}

  @Post('generate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @Body() body: GenerateClassSessionsDto,
  ): Promise<{
    generatedCount: number;
    skippedCount: number;
    sessionIds: string[];
  }> {
    return this.sessionsService.generate(body);
  }

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: FindClassSessionsFilterDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSessionDto[]> {
    return this.sessionsService.findAll(query, user);
  }

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSessionDetailDto> {
    return this.attendanceService.findSessionDetail(id, user);
  }

  @Post(':id/complete')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSessionLifecycleResponseDto> {
    return this.lifecycleService.completeSession(id, user);
  }

  @Post(':id/cancel')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelClassSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSessionLifecycleResponseDto> {
    return this.lifecycleService.cancelSession(id, body, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateClassSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ClassSessionDetailDto> {
    return this.lifecycleService.updateSession(id, body, user);
  }

  @Get(':sessionId/attendance')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findStudentAttendance(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AttendanceRecordWithStudentDto[]> {
    return this.attendanceService.findStudentAttendance(sessionId, user);
  }

  @Post(':sessionId/attendance')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.CREATED)
  async recordStudentAttendance(
    @Param('sessionId') sessionId: string,
    @Body() body: RecordStudentAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ recordedCount: number; sessionStatus: string }> {
    return this.attendanceService.recordStudentAttendance(sessionId, body, user);
  }

  @Get(':sessionId/teacher-attendance')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findTeacherAttendance(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<any> {
    return this.attendanceService.findTeacherAttendance(sessionId, user);
  }

  @Post(':sessionId/teacher-attendance')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async recordTeacherAttendance(
    @Param('sessionId') sessionId: string,
    @Body() body: RecordTeacherAttendanceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<any> {
    return this.attendanceService.recordTeacherAttendance(sessionId, body, user);
  }
}
