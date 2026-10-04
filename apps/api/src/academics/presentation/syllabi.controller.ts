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
import { SyllabusService } from '../application/services/syllabus.service';
import type {
  CreateSyllabusDto,
  UpdateSyllabusDto,
  FindSyllabiFilterDto,
  CreateSyllabusItemDto,
  SyllabusDetailDto,
  SyllabusItemDto,
  AuthUser,
} from '@edutech/shared';

@Controller('syllabi')
@UseGuards(AuthGuard, RolesGuard)
export class SyllabiController {
  constructor(
    @Inject(SyllabusService)
    private readonly syllabusService: SyllabusService,
  ) {}

  @Get()
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: FindSyllabiFilterDto): Promise<SyllabusDetailDto[]> {
    return this.syllabusService.findAll(query);
  }

  @Get(':id')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<SyllabusDetailDto> {
    return this.syllabusService.findOne(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSyllabusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SyllabusDetailDto> {
    return this.syllabusService.create(body, user);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSyllabusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SyllabusDetailDto> {
    return this.syllabusService.update(id, body, user);
  }

  @Get(':id/items')
  @Roles('SUPERVISOR', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  async findItems(@Param('id') id: string): Promise<SyllabusItemDto[]> {
    return this.syllabusService.findItems(id);
  }

  @Post(':id/items')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Param('id') id: string,
    @Body() body: CreateSyllabusItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SyllabusItemDto> {
    return this.syllabusService.addItem(id, body, user);
  }
}
