import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, CLASS_REPOSITORY } from '../../domain/tokens';
import type { IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface';
import type { IClassRepository } from '../../domain/repositories/class.repository.interface';
import { Enrollment } from '../../domain/entities/enrollment.entity';
import {
  CreateEnrollmentSchema,
  UpdateEnrollmentSchema,
  type EnrollmentStatus,
  type PaginatedResult,
} from '@edutech/shared';
import type {
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  QueryEnrollmentsInput,
  EnrollmentResponseDto,
} from '../dto/enrollment.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: IEnrollmentRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: IClassRepository,
  ) {}

  private mapToDto(enrollment: Enrollment): EnrollmentResponseDto {
    return {
      id: enrollment.id,
      classId: enrollment.classId,
      studentId: enrollment.studentId,
      status: enrollment.status,
      joinedAt: enrollment.joinedAt,
      leftAt: enrollment.leftAt,
      createdAt: enrollment.createdAt,
      updatedAt: enrollment.updatedAt,
    };
  }

  async create(classId: string, input: CreateEnrollmentInput): Promise<EnrollmentResponseDto> {
    const parseResult = CreateEnrollmentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const status = (data.status as EnrollmentStatus) ?? 'ACTIVE';

    // 1. Verify Class exists and is not COMPLETED or CANCELLED
    const cls = await this.classRepo.findById(classId);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${classId} not found`,
      });
    }

    if (cls.isTerminal()) {
      throw new BadRequestException({
        code: 'CLASS_NOT_ELIGIBLE_FOR_ENROLLMENT',
        message: `Cannot enroll students into a class with status ${cls.status}`,
      });
    }

    // 2. Verify Student exists and is active
    const studentValid = await this.classRepo.verifyStudentExistsAndActive(data.studentId);
    if (!studentValid) {
      throw new BadRequestException({
        code: 'INVALID_STUDENT',
        message: 'Student does not exist or is inactive',
      });
    }

    // 3. Check for existing active enrollment in this class
    const existing = await this.enrollmentRepo.findByClassAndStudent(classId, data.studentId);
    if (existing && existing.isActive()) {
      throw new BadRequestException({
        code: 'DUPLICATE_ENROLLMENT',
        message: 'Student is already actively enrolled in this class',
      });
    }

    // 4. Create with atomic capacity enforcement
    try {
      const created = await this.enrollmentRepo.createWithCapacityCheck(
        {
          classId,
          studentId: data.studentId,
          status,
        },
        cls.capacity,
      );

      return this.mapToDto(created);
    } catch (err: any) {
      if (err.message === 'CAPACITY_EXCEEDED' || err.code === 'CAPACITY_EXCEEDED') {
        throw new BadRequestException({
          code: 'CAPACITY_EXCEEDED',
          message: `Class capacity limit (${cls.capacity}) reached`,
        });
      }
      throw err;
    }
  }

  async findAllByClass(
    classId: string,
    query: QueryEnrollmentsInput,
  ): Promise<PaginatedResult<EnrollmentResponseDto>> {
    const cls = await this.classRepo.findById(classId);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${classId} not found`,
      });
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const result = await this.enrollmentRepo.findAllByClass(classId, {
      status: query.status,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((e) => this.mapToDto(e)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string): Promise<EnrollmentResponseDto> {
    const enrollment = await this.enrollmentRepo.findById(id);
    if (!enrollment) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Enrollment with id ${id} not found`,
      });
    }

    return this.mapToDto(enrollment);
  }

  async updateStatus(id: string, input: UpdateEnrollmentInput): Promise<EnrollmentResponseDto> {
    const parseResult = UpdateEnrollmentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const enrollment = await this.enrollmentRepo.findById(id);
    if (!enrollment) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Enrollment with id ${id} not found`,
      });
    }

    const targetStatus = parseResult.data.status as EnrollmentStatus;

    if (targetStatus === enrollment.status) {
      return this.mapToDto(enrollment);
    }

    if (!enrollment.canTransitionTo(targetStatus)) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot transition enrollment from ${enrollment.status} to ${targetStatus}`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const leftAt = targetStatus === 'WITHDRAWN' || targetStatus === 'COMPLETED' ? new Date() : null;
    const updated = await this.enrollmentRepo.updateStatus(id, targetStatus, leftAt);
    return this.mapToDto(updated);
  }

  async withdraw(id: string): Promise<EnrollmentResponseDto> {
    return this.updateStatus(id, { status: 'WITHDRAWN' });
  }

  async complete(id: string): Promise<EnrollmentResponseDto> {
    return this.updateStatus(id, { status: 'COMPLETED' });
  }
}
