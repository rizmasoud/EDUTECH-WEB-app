import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  importJobs,
  importResults,
} from '../../../infrastructure/database/schema/imports.schema';
import { students } from '../../../infrastructure/database/schema/students.schema';
import {
  classes,
  enrollments,
} from '../../../infrastructure/database/schema/classes.schema';
import {
  IMPORT_JOB_REPOSITORY,
  IMPORT_RESULT_REPOSITORY,
  EXCEL_PARSER,
} from '../../domain/tokens';
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository.interface';
import type { IImportResultRepository } from '../../domain/repositories/import-result.repository.interface';
import type { IExcelParser } from '../../domain/interfaces/excel-parser.interface';
import { ShahvarValidatorService } from './shahvar-validator.service';
import { ImportJob } from '../../domain/entities/import-job.entity';
import {
  CreateImportJobSchema,
  ValidateImportJobSchema,
  CommitImportJobSchema,
  type CreateImportJobDto,
  type ImportJobResponseDto,
  type FindImportJobsFilter,
  type ImportResultResponseDto,
  type FindImportResultsFilter,
  type ValidateImportJobDto,
  type CommitImportJobDto,
  type CommitImportResponseDto,
  type ImportValidationPreviewDto,
  type PaginatedResult,
  type AuthUser,
  type ImportStatus,
} from '@edutech/shared';

@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly jobRepo: IImportJobRepository,
    @Inject(IMPORT_RESULT_REPOSITORY)
    private readonly resultRepo: IImportResultRepository,
    @Inject(ShahvarValidatorService)
    private readonly validatorService: ShahvarValidatorService,
    @Inject(EXCEL_PARSER)
    private readonly excelParser: IExcelParser,
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapJobToDto(
    job: ImportJob,
    resultsCount?: {
      total: number;
      success: number;
      warning: number;
      error: number;
      skipped: number;
    },
  ): ImportJobResponseDto {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      createdBy: job.createdBy,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      resultsCount,
    };
  }

  async createJob(input: CreateImportJobDto, currentUser: AuthUser): Promise<ImportJobResponseDto> {
    const parseResult = CreateImportJobSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const created = await this.jobRepo.create({
      type: parseResult.data.type,
      fileName: parseResult.data.fileName,
      createdBy: currentUser.id,
      status: 'PENDING',
    });

    return this.mapJobToDto(created);
  }

  async findAll(filter?: FindImportJobsFilter): Promise<PaginatedResult<ImportJobResponseDto>> {
    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 20));

    const result = await this.jobRepo.findAll({
      type: filter?.type,
      status: filter?.status,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    const items = await Promise.all(
      result.items.map(async (job) => {
        const counts = await this.jobRepo.getResultsCount(job.id);
        return this.mapJobToDto(job, counts);
      }),
    );

    return {
      items,
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string): Promise<ImportJobResponseDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${id} not found`,
      });
    }

    const counts = await this.jobRepo.getResultsCount(id);
    return this.mapJobToDto(job, counts);
  }

  async validateJob(id: string, input: ValidateImportJobDto): Promise<ImportValidationPreviewDto> {
    const parseResult = ValidateImportJobSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const job = await this.jobRepo.findById(id);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${id} not found`,
      });
    }

    if (job.isTerminal()) {
      throw new BadRequestException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot validate an import job in terminal status ${job.status}`,
      });
    }

    // Set status to PROCESSING
    await this.jobRepo.update(id, {
      status: 'PROCESSING',
      startedAt: new Date(),
    });

    const data = parseResult.data;
    const output = await this.validatorService.validateRows(
      id,
      data.academicTermId,
      data.bookId,
      data.rows,
    );

    // Persist row diagnostic results
    await this.resultRepo.deleteByJobId(id);
    const createdResults = await this.resultRepo.createMany(
      output.results.map((r) => ({
        importJobId: id,
        rowNumber: r.rowNumber,
        status: r.status,
        message: r.message,
      })),
    );

    // Update job status
    const targetStatus = output.invalidRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'PROCESSING';
    await this.jobRepo.update(id, { status: targetStatus });

    return {
      importJobId: id,
      totalRows: output.totalRows,
      validRows: output.validRows,
      invalidRows: output.invalidRows,
      warningRows: output.warningRows,
      results: createdResults.map((r) => ({
        id: r.id,
        importJobId: r.importJobId,
        rowNumber: r.rowNumber,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
      })),
      studentsToCreate: output.studentsToCreate,
      studentsToMatch: output.studentsToMatch,
      enrollmentsToCreate: output.validRows,
    };
  }

  async uploadAndProcessFile(
    jobId: string,
    file: Express.Multer.File,
    academicTermId: string,
    bookId: string,
  ): Promise<ImportValidationPreviewDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'MISSING_FILE',
        message: 'No valid file was uploaded.',
      });
    }

    if (!academicTermId || !bookId) {
      throw new BadRequestException({
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'academicTermId and bookId are required when processing a Shahvar import.',
      });
    }

    const job = await this.jobRepo.findById(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${jobId} not found`,
      });
    }

    if (job.isTerminal()) {
      throw new BadRequestException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot process an import job in terminal status ${job.status}`,
      });
    }

    // Parse Excel workbook buffer
    const parsedSheet = this.excelParser.parseBuffer(file.buffer);

    // Validate parsed rows against database models
    return this.validateJob(jobId, {
      academicTermId,
      bookId,
      rows: parsedSheet.rows,
    });
  }

  async getPreview(jobId: string): Promise<ImportValidationPreviewDto> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${jobId} not found`,
      });
    }

    const results = await this.resultRepo.findAllByJobId(jobId, { pageSize: 1000 });
    const counts = await this.jobRepo.getResultsCount(jobId);

    return {
      importJobId: jobId,
      totalRows: counts.total,
      validRows: counts.success + counts.warning,
      invalidRows: counts.error,
      warningRows: counts.warning,
      results: results.items.map((r) => ({
        id: r.id,
        importJobId: r.importJobId,
        rowNumber: r.rowNumber,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
      })),
      studentsToCreate: [],
      studentsToMatch: [],
      enrollmentsToCreate: counts.success + counts.warning,
    };
  }


  async commitJob(id: string, input: CommitImportJobDto): Promise<CommitImportResponseDto> {
    const parseResult = CommitImportJobSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const job = await this.jobRepo.findById(id);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${id} not found`,
      });
    }

    if (job.isTerminal()) {
      throw new BadRequestException({
        code: 'JOB_ALREADY_COMMITTED',
        message: `Import job is in a terminal status (${job.status}) and cannot be committed.`,
      });
    }

    if (job.isPending()) {
      throw new BadRequestException({
        code: 'UNVALIDATED_IMPORT_JOB',
        message: 'Import job must be validated before committing.',
      });
    }

    const data = parseResult.data;

    // Validate rows against database models
    const validationOutput = await this.validatorService.validateRows(
      id,
      data.academicTermId,
      data.bookId,
      data.rows,
    );

    if (validationOutput.invalidRows > 0) {
      throw new BadRequestException({
        code: 'IMPORT_VALIDATION_ERRORS',
        message: 'Cannot commit import job with validation errors. Please review and resolve row errors.',
      });
    }

    const capacity = data.capacity ?? 15;
    if (validationOutput.validRows > capacity) {
      throw new BadRequestException({
        code: 'CAPACITY_EXCEEDED',
        message: `Total students to enroll (${validationOutput.validRows}) exceeds class capacity limit (${capacity}).`,
      });
    }

    // Execute atomic, transactional commit
    return await this.db.transaction(async (tx: any) => {
      // Concurrency & idempotency guard: lock job row by updating status
      const [lockedJob] = await tx
        .update(importJobs)
        .set({ status: 'PROCESSING' })
        .where(and(eq(importJobs.id, id), eq(importJobs.status, 'PROCESSING')))
        .returning();

      if (!lockedJob) {
        throw new BadRequestException({
          code: 'CONCURRENT_COMMIT_CONFLICT',
          message: 'Import job is currently being committed or has already finished.',
        });
      }

      const createdStudentIds: string[] = [];
      const matchedStudentIds: string[] = [];
      const studentIdsToEnroll: string[] = [];

      // Resolve students (match existing by shahvarCode or create new)
      for (const row of data.rows) {
        let studentId: string | null = null;
        const code = row.shahvarStudentCode?.trim() || null;

        if (code) {
          const [existingStudent] = await tx
            .select()
            .from(students)
            .where(eq(students.shahvarCode, code))
            .limit(1);

          if (existingStudent) {
            matchedStudentIds.push(existingStudent.id);
            studentId = existingStudent.id;
          }
        }

        if (!studentId) {
          // Create new student
          const [newStudent] = await tx
            .insert(students)
            .values({
              firstName: row.firstName?.trim() || 'Unknown',
              lastName: row.lastName!.trim(),
              shahvarCode: code,
              isActive: true,
            })
            .returning();

          createdStudentIds.push(newStudent.id);
          studentId = newStudent.id;
        }

        if (studentId) {
          studentIdsToEnroll.push(studentId);
        }
      }

      // Create new Class
      const [newClass] = await tx
        .insert(classes)
        .values({
          academicTermId: data.academicTermId,
          bookId: data.bookId,
          bookSegmentId: data.bookSegmentId || null,
          classType: data.classType || 'REGULAR',
          status: 'DRAFT',
          capacity,
        })
        .returning();

      // Create unique Enrollments
      const uniqueStudentIds = Array.from(new Set(studentIdsToEnroll));
      if (uniqueStudentIds.length > capacity) {
        throw new BadRequestException({
          code: 'CAPACITY_EXCEEDED',
          message: 'Total unique students exceed class capacity.',
        });
      }

      const enrollmentIds: string[] = [];
      for (const studentId of uniqueStudentIds) {
        const [enr] = await tx
          .insert(enrollments)
          .values({
            classId: newClass.id,
            studentId,
            status: 'ACTIVE',
            joinedAt: new Date(),
          })
          .returning();

        enrollmentIds.push(enr.id);
      }

      // Update Import Results diagnostics
      await tx.delete(importResults).where(eq(importResults.importJobId, id));
      await tx.insert(importResults).values(
        validationOutput.results.map((r) => ({
          importJobId: id,
          rowNumber: r.rowNumber,
          status: r.status,
          message: r.message,
        })),
      );

      // Finalize ImportJob state to COMPLETED
      const completedAt = new Date();
      await tx
        .update(importJobs)
        .set({
          status: 'COMPLETED',
          completedAt,
        })
        .where(eq(importJobs.id, id));

      return {
        importJobId: id,
        status: 'COMPLETED' as ImportStatus,
        classId: newClass.id,
        studentsCreatedCount: createdStudentIds.length,
        studentsMatchedCount: matchedStudentIds.length,
        enrollmentsCreatedCount: enrollmentIds.length,
        createdStudentIds,
        matchedStudentIds,
        enrollmentIds,
        completedAt,
      };
    });
  }

  async findResults(
    id: string,
    filter?: FindImportResultsFilter,
  ): Promise<PaginatedResult<ImportResultResponseDto>> {
    const job = await this.jobRepo.findById(id);
    if (!job) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Import job with id ${id} not found`,
      });
    }

    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 50));

    const result = await this.resultRepo.findAllByJobId(id, {
      status: filter?.status,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((r) => ({
        id: r.id,
        importJobId: r.importJobId,
        rowNumber: r.rowNumber,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
      })),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }
}
