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
import { AcademicTermsService } from '../application/services/academic-terms.service';
import type {
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
  QueryAcademicTermsInput,
  AcademicTermResponseDto,
} from '../application/dto/academic-term.dto';
import type { PaginatedResult } from '@edutech/shared';

@Controller('academic-terms')
@UseGuards(AuthGuard, RolesGuard)
export class AcademicTermsController {
  constructor(
    @Inject(AcademicTermsService)
    private readonly academicTermsService: AcademicTermsService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryAcademicTermsInput,
  ): Promise<PaginatedResult<AcademicTermResponseDto>> {
    return this.academicTermsService.findAll(query);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateAcademicTermInput,
  ): Promise<AcademicTermResponseDto> {
    return this.academicTermsService.create(body);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<AcademicTermResponseDto> {
    return this.academicTermsService.findById(id);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAcademicTermInput,
  ): Promise<AcademicTermResponseDto> {
    return this.academicTermsService.update(id, body);
  }

  @Post(':id/activate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string): Promise<AcademicTermResponseDto> {
    return this.academicTermsService.activate(id);
  }

  @Post(':id/close')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string): Promise<AcademicTermResponseDto> {
    return this.academicTermsService.close(id);
  }
}
