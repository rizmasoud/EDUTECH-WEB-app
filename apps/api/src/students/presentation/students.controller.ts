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
import { StudentsService } from '../application/services/students.service';
import type {
  CreateStudentDto,
  UpdateStudentDto,
  StudentResponseDto,
  FindStudentsFilter,
  PaginatedResult,
  EnrollmentResponseDto,
} from '@edutech/shared';

@Controller('students')
@UseGuards(AuthGuard, RolesGuard)
export class StudentsController {
  constructor(
    @Inject(StudentsService)
    private readonly studentsService: StudentsService,
  ) {}

  @Get()
  async findAll(@Query() query: FindStudentsFilter): Promise<PaginatedResult<StudentResponseDto>> {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<StudentResponseDto> {
    return this.studentsService.findById(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateStudentDto): Promise<StudentResponseDto> {
    return this.studentsService.create(body);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.studentsService.update(id, body);
  }

  @Get(':id/enrollments')
  async findEnrollments(@Param('id') id: string): Promise<EnrollmentResponseDto[]> {
    return this.studentsService.findStudentEnrollments(id);
  }
}
