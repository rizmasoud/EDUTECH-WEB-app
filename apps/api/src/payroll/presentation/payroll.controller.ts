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
import { PayrollService } from '../application/services/payroll.service';
import type {
  AuthUser,
  CreatePayrollDto,
  CreatePayrollAdjustmentDto,
  QueryPayrollsDto,
  PayrollDto,
  PayrollDetailDto,
  PayrollItemDto,
} from '@edutech/shared';

@Controller('payrolls')
@UseGuards(AuthGuard, RolesGuard)
export class PayrollController {
  constructor(
    @Inject(PayrollService)
    private readonly payrollService: PayrollService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryPayrollsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDto[]> {
    return this.payrollService.findAll(query, user);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async createPayroll(
    @Body() body: CreatePayrollDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.createPayroll(body, user);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.findById(id, user);
  }

  @Post(':id/calculate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async calculatePayroll(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.calculatePayroll(id, user);
  }

  @Post(':id/review')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async reviewPayroll(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.reviewPayroll(id, user);
  }

  @Post(':id/finalize')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async finalizePayroll(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.finalizePayroll(id, user);
  }

  @Get(':id/items')
  async findItems(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollItemDto[]> {
    return this.payrollService.findItems(id, user);
  }

  @Post(':id/adjustments')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async addAdjustment(
    @Param('id') id: string,
    @Body() body: CreatePayrollAdjustmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDetailDto> {
    return this.payrollService.addAdjustment(id, body, user);
  }
}

@Controller('teachers')
@UseGuards(AuthGuard, RolesGuard)
export class TeacherPayrollController {
  constructor(
    @Inject(PayrollService)
    private readonly payrollService: PayrollService,
  ) {}

  @Get(':id/payrolls')
  async findTeacherPayrolls(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PayrollDto[]> {
    return this.payrollService.findTeacherPayrolls(id, user);
  }
}
