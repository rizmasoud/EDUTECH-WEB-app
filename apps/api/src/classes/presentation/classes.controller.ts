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
import { ClassesService } from '../application/services/classes.service';
import { EnrollmentsService } from '../application/services/enrollments.service';
import type {
  CreateClassInput,
  UpdateClassInput,
  QueryClassesInput,
  ClassResponseDto,
} from '../application/dto/class.dto';
import type {
  CreateEnrollmentInput,
  QueryEnrollmentsInput,
  EnrollmentResponseDto,
} from '../application/dto/enrollment.dto';
import type { PaginatedResult } from '@edutech/shared';

@Controller('classes')
@UseGuards(AuthGuard, RolesGuard)
export class ClassesController {
  constructor(
    @Inject(ClassesService)
    private readonly classesService: ClassesService,
    @Inject(EnrollmentsService)
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryClassesInput): Promise<PaginatedResult<ClassResponseDto>> {
    return this.classesService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ClassResponseDto> {
    return this.classesService.findById(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateClassInput): Promise<ClassResponseDto> {
    return this.classesService.create(body);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateClassInput,
  ): Promise<ClassResponseDto> {
    return this.classesService.update(id, body);
  }

  @Post(':id/activate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string): Promise<ClassResponseDto> {
    return this.classesService.activate(id);
  }

  @Post(':id/complete')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string): Promise<ClassResponseDto> {
    return this.classesService.complete(id);
  }

  @Post(':id/cancel')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<ClassResponseDto> {
    return this.classesService.cancel(id);
  }

  @Get(':id/enrollments')
  async findEnrollments(
    @Param('id') id: string,
    @Query() query: QueryEnrollmentsInput,
  ): Promise<PaginatedResult<EnrollmentResponseDto>> {
    return this.enrollmentsService.findAllByClass(id, query);
  }

  @Post(':id/enrollments')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async createEnrollment(
    @Param('id') id: string,
    @Body() body: CreateEnrollmentInput,
  ): Promise<EnrollmentResponseDto> {
    return this.enrollmentsService.create(id, body);
  }
}
