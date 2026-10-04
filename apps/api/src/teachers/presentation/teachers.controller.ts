import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { TeachersService } from '../application/services/teachers.service';
import type {
  CreateTeacherDto,
  UpdateTeacherDto,
  CreateTeacherSkillDto,
  TeacherResponseDto,
  TeacherSkillResponseDto,
  FindTeachersFilter,
  PaginatedResult,
  ClassResponseDto,
  AuthUser,
} from '@edutech/shared';

@Controller('teachers')
@UseGuards(AuthGuard, RolesGuard)
export class TeachersController {
  constructor(
    @Inject(TeachersService)
    private readonly teachersService: TeachersService,
  ) {}

  @Get()
  async findAll(@Query() query: FindTeachersFilter): Promise<PaginatedResult<TeacherResponseDto>> {
    return this.teachersService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<TeacherResponseDto> {
    return this.teachersService.findById(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateTeacherDto): Promise<TeacherResponseDto> {
    return this.teachersService.create(body);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTeacherDto,
  ): Promise<TeacherResponseDto> {
    return this.teachersService.update(id, body);
  }

  @Get(':id/skills')
  async findSkills(@Param('id') id: string): Promise<TeacherSkillResponseDto[]> {
    return this.teachersService.findSkills(id);
  }

  @Post(':id/skills')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async addSkill(
    @Param('id') id: string,
    @Body() body: CreateTeacherSkillDto,
  ): Promise<TeacherSkillResponseDto> {
    return this.teachersService.addSkill(id, body);
  }

  @Delete(':id/skills/:skillId')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSkill(
    @Param('id') id: string,
    @Param('skillId') skillId: string,
  ): Promise<void> {
    return this.teachersService.deleteSkill(id, skillId);
  }

  @Get(':id/classes')
  async findClasses(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PaginatedResult<ClassResponseDto>> {
    return this.teachersService.findTeacherClasses(id, user);
  }
}
