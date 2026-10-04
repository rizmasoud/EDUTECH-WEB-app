import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../auth/presentation/guards/roles.guard';
import { Roles } from '../../auth/presentation/decorators/roles.decorator';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { ImportsService } from '../application/services/imports.service';
import type {
  CreateImportJobDto,
  ValidateImportJobDto,
  CommitImportJobDto,
  CommitImportResponseDto,
  ImportJobResponseDto,
  ImportResultResponseDto,
  ImportValidationPreviewDto,
  FindImportJobsFilter,
  FindImportResultsFilter,
  PaginatedResult,
  AuthUser,
} from '@edutech/shared';

@Controller('import-jobs')
@UseGuards(AuthGuard, RolesGuard)
export class ImportsController {
  constructor(
    @Inject(ImportsService)
    private readonly importsService: ImportsService,
  ) {}

  @Get()
  @Roles('SUPERVISOR')
  async findAll(@Query() query: FindImportJobsFilter): Promise<PaginatedResult<ImportJobResponseDto>> {
    return this.importsService.findAll(query);
  }

  @Get(':id')
  @Roles('SUPERVISOR')
  async findById(@Param('id') id: string): Promise<ImportJobResponseDto> {
    return this.importsService.findById(id);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateImportJobDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportJobResponseDto> {
    return this.importsService.createJob(body, user);
  }

  @Post(':id/upload')
  @Roles('SUPERVISOR')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('academicTermId') academicTermId: string,
    @Body('bookId') bookId: string,
  ): Promise<ImportValidationPreviewDto> {
    return this.importsService.uploadAndProcessFile(id, file, academicTermId, bookId);
  }

  @Post(':id/validate')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Param('id') id: string,
    @Body() body: ValidateImportJobDto,
  ): Promise<ImportValidationPreviewDto> {
    return this.importsService.validateJob(id, body);
  }

  @Get(':id/preview')
  @Roles('SUPERVISOR')
  async getPreview(@Param('id') id: string): Promise<ImportValidationPreviewDto> {
    return this.importsService.getPreview(id);
  }

  @Post(':id/commit')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param('id') id: string,
    @Body() body: CommitImportJobDto,
  ): Promise<CommitImportResponseDto> {
    return this.importsService.commitJob(id, body);
  }

  @Get(':id/results')
  @Roles('SUPERVISOR')
  async findResults(
    @Param('id') id: string,
    @Query() query: FindImportResultsFilter,
  ): Promise<PaginatedResult<ImportResultResponseDto>> {
    return this.importsService.findResults(id, query);
  }
}

