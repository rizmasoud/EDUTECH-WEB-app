import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../auth/presentation/guards/roles.guard';
import { Roles } from '../../auth/presentation/decorators/roles.decorator';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { AttendanceService } from '../application/services/attendance.service';
import type { AuthUser, TeacherAttendanceSummaryDto } from '@edutech/shared';

@Controller('teachers')
@UseGuards(AuthGuard, RolesGuard)
export class TeacherAttendanceSummaryController {
  constructor(
    @Inject(AttendanceService)
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * A teacher's own attendance counts (own only for teachers; any teacher for supervisors).
   * ?term=all (default) | current | <academicTermId>
   */
  @Get(':id/attendance-summary')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async summary(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('term') term?: string,
  ): Promise<TeacherAttendanceSummaryDto> {
    return this.attendanceService.getTeacherAttendanceSummary(id, user, term);
  }
}
