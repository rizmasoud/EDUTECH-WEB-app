import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { CLASS_REPOSITORY } from '../../domain/tokens';
import type { IClassRepository } from '../../domain/repositories/class.repository.interface';
import { Class } from '../../domain/entities/class.entity';
import {
  CreateClassSchema,
  UpdateClassSchema,
  type ClassStatus,
  type ClassType,
  type PaginatedResult,
} from '@edutech/shared';
import type {
  CreateClassInput,
  UpdateClassInput,
  QueryClassesInput,
  ClassResponseDto,
} from '../dto/class.dto';

@Injectable()
export class ClassesService {
  constructor(
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: IClassRepository,
  ) {}

  private mapToDto(cls: Class, activeEnrollmentCount?: number): ClassResponseDto {
    return {
      id: cls.id,
      academicTermId: cls.academicTermId,
      bookId: cls.bookId,
      bookSegmentId: cls.bookSegmentId,
      teacherId: cls.teacherId,
      classType: cls.classType,
      status: cls.status,
      capacity: cls.capacity,
      activeEnrollmentCount,
      createdAt: cls.createdAt,
      updatedAt: cls.updatedAt,
    };
  }

  async create(input: CreateClassInput): Promise<ClassResponseDto> {
    const parseResult = CreateClassSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;
    const capacity = data.capacity ?? Class.DEFAULT_CAPACITY;
    const status = (data.status as ClassStatus) ?? 'DRAFT';
    const classType = (data.classType as ClassType) ?? 'REGULAR';

    try {
      Class.validateCapacity(capacity);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_CAPACITY',
        message: err.message,
      });
    }

    // 1. Verify Academic Term exists and is not CLOSED
    const termValid = await this.classRepo.verifyTermExistsAndNotClosed(data.academicTermId);
    if (!termValid) {
      throw new BadRequestException({
        code: 'INVALID_ACADEMIC_TERM',
        message: 'Academic term does not exist or is in CLOSED status',
      });
    }

    // 2. Verify Book exists and is active
    const bookValid = await this.classRepo.verifyBookExistsAndActive(data.bookId);
    if (!bookValid) {
      throw new BadRequestException({
        code: 'INVALID_BOOK',
        message: 'Book does not exist or is inactive',
      });
    }

    // 3. Verify Book Segment if provided
    if (data.bookSegmentId) {
      const segmentValid = await this.classRepo.verifySegmentBelongsToBook(
        data.bookSegmentId,
        data.bookId,
      );
      if (!segmentValid) {
        throw new BadRequestException({
          code: 'INVALID_BOOK_SEGMENT',
          message: 'Specified book segment does not belong to the selected book',
        });
      }
    }

    // 4. Verify Teacher if provided
    if (data.teacherId) {
      const teacherValid = await this.classRepo.verifyTeacherExistsAndActive(data.teacherId);
      if (!teacherValid) {
        throw new BadRequestException({
          code: 'INVALID_TEACHER',
          message: 'Assigned teacher does not exist or is inactive',
        });
      }

      // Check teacher skill if active
      if (status === 'ACTIVE') {
        const hasSkill = await this.classRepo.verifyTeacherSkill(data.teacherId, data.bookId);
        if (!hasSkill) {
          throw new BadRequestException({
            code: 'TEACHER_INELIGIBLE',
            message: 'Teacher does not possess the required skill for this book',
          });
        }
      }
    } else if (status === 'ACTIVE') {
      throw new BadRequestException({
        code: 'MISSING_TEACHER',
        message: 'An active class must have an assigned teacher',
      });
    }

    const created = await this.classRepo.create({
      academicTermId: data.academicTermId,
      bookId: data.bookId,
      bookSegmentId: data.bookSegmentId ?? null,
      teacherId: data.teacherId ?? null,
      classType,
      status,
      capacity,
    });

    return this.mapToDto(created, 0);
  }

  async findAll(query: QueryClassesInput): Promise<PaginatedResult<ClassResponseDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const result = await this.classRepo.findAll({
      academicTermId: query.academicTermId,
      bookId: query.bookId,
      teacherId: query.teacherId,
      status: query.status,
      classType: query.classType,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    const items = await Promise.all(
      result.items.map(async (cls) => {
        const count = await this.classRepo.countActiveEnrollments(cls.id);
        return this.mapToDto(cls, count);
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

  async findById(id: string): Promise<ClassResponseDto> {
    const cls = await this.classRepo.findById(id);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${id} not found`,
      });
    }

    const count = await this.classRepo.countActiveEnrollments(id);
    return this.mapToDto(cls, count);
  }

  async update(id: string, input: UpdateClassInput): Promise<ClassResponseDto> {
    const parseResult = UpdateClassSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const cls = await this.classRepo.findById(id);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${id} not found`,
      });
    }

    if (!cls.canBeModified()) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Classes in ${cls.status} status are historical and cannot be modified`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const data = parseResult.data;

    // Validate new capacity if provided
    if (data.capacity !== undefined) {
      try {
        Class.validateCapacity(data.capacity);
      } catch (err: any) {
        throw new BadRequestException({
          code: 'INVALID_CAPACITY',
          message: err.message,
        });
      }

      const activeCount = await this.classRepo.countActiveEnrollments(id);
      if (data.capacity < activeCount) {
        throw new BadRequestException({
          code: 'CAPACITY_BELOW_ENROLLMENT',
          message: `Cannot reduce capacity to ${data.capacity} below current active enrollment count (${activeCount})`,
        });
      }
    }

    // Validate book segment if updated
    if (data.bookSegmentId !== undefined && data.bookSegmentId !== null) {
      const segmentValid = await this.classRepo.verifySegmentBelongsToBook(
        data.bookSegmentId,
        cls.bookId,
      );
      if (!segmentValid) {
        throw new BadRequestException({
          code: 'INVALID_BOOK_SEGMENT',
          message: 'Specified book segment does not belong to the class book',
        });
      }
    }

    // Validate teacher if updated
    if (data.teacherId !== undefined && data.teacherId !== null) {
      const teacherValid = await this.classRepo.verifyTeacherExistsAndActive(data.teacherId);
      if (!teacherValid) {
        throw new BadRequestException({
          code: 'INVALID_TEACHER',
          message: 'Assigned teacher does not exist or is inactive',
        });
      }

      if (cls.status === 'ACTIVE' || data.status === 'ACTIVE') {
        const hasSkill = await this.classRepo.verifyTeacherSkill(data.teacherId, cls.bookId);
        if (!hasSkill) {
          throw new BadRequestException({
            code: 'TEACHER_INELIGIBLE',
            message: 'Teacher does not possess the required skill for this book',
          });
        }
      }
    }

    // Validate status transition if status updated directly
    if (data.status !== undefined && data.status !== cls.status) {
      if (!cls.canTransitionTo(data.status as ClassStatus)) {
        throw new HttpException(
          {
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: `Cannot transition class from ${cls.status} to ${data.status}`,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const updated = await this.classRepo.update(id, {
      bookSegmentId: data.bookSegmentId,
      teacherId: data.teacherId,
      classType: data.classType as ClassType | undefined,
      status: data.status as ClassStatus | undefined,
      capacity: data.capacity,
    });

    const activeCount = await this.classRepo.countActiveEnrollments(id);
    return this.mapToDto(updated, activeCount);
  }

  async activate(id: string): Promise<ClassResponseDto> {
    const cls = await this.classRepo.findById(id);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${id} not found`,
      });
    }

    if (!cls.canTransitionTo('ACTIVE')) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot activate class in ${cls.status} status. Only DRAFT classes can be activated.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify Active Class requirements:
    // 1. Term not closed
    const termValid = await this.classRepo.verifyTermExistsAndNotClosed(cls.academicTermId);
    if (!termValid) {
      throw new BadRequestException({
        code: 'INVALID_ACADEMIC_TERM',
        message: 'Cannot activate class: Academic term is closed or invalid',
      });
    }

    // 2. Book is active
    const bookValid = await this.classRepo.verifyBookExistsAndActive(cls.bookId);
    if (!bookValid) {
      throw new BadRequestException({
        code: 'INVALID_BOOK',
        message: 'Cannot activate class: Book is inactive or invalid',
      });
    }

    // 3. Segment belongs to book if specified
    if (cls.bookSegmentId) {
      const segmentValid = await this.classRepo.verifySegmentBelongsToBook(
        cls.bookSegmentId,
        cls.bookId,
      );
      if (!segmentValid) {
        throw new BadRequestException({
          code: 'INVALID_BOOK_SEGMENT',
          message: 'Cannot activate class: Book segment does not belong to the book',
        });
      }
    }

    // 4. Teacher assigned and active
    if (!cls.teacherId) {
      throw new BadRequestException({
        code: 'MISSING_TEACHER',
        message: 'Cannot activate class: A teacher must be assigned before activation',
      });
    }

    const teacherValid = await this.classRepo.verifyTeacherExistsAndActive(cls.teacherId);
    if (!teacherValid) {
      throw new BadRequestException({
        code: 'INVALID_TEACHER',
        message: 'Cannot activate class: Assigned teacher is inactive or invalid',
      });
    }

    // 5. Teacher eligibility (skill for book)
    const hasSkill = await this.classRepo.verifyTeacherSkill(cls.teacherId, cls.bookId);
    if (!hasSkill) {
      throw new BadRequestException({
        code: 'TEACHER_INELIGIBLE',
        message: 'Cannot activate class: Teacher does not possess the required skill for this book',
      });
    }

    const updated = await this.classRepo.update(id, { status: 'ACTIVE' });
    const count = await this.classRepo.countActiveEnrollments(id);
    return this.mapToDto(updated, count);
  }

  async complete(id: string): Promise<ClassResponseDto> {
    const cls = await this.classRepo.findById(id);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${id} not found`,
      });
    }

    if (!cls.canTransitionTo('COMPLETED')) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot complete class in ${cls.status} status. Only ACTIVE classes can be completed.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.classRepo.update(id, { status: 'COMPLETED' });
    const count = await this.classRepo.countActiveEnrollments(id);
    return this.mapToDto(updated, count);
  }

  async cancel(id: string): Promise<ClassResponseDto> {
    const cls = await this.classRepo.findById(id);
    if (!cls) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Class with id ${id} not found`,
      });
    }

    if (!cls.canTransitionTo('CANCELLED')) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot cancel class in ${cls.status} status. Only DRAFT or ACTIVE classes can be cancelled.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.classRepo.update(id, { status: 'CANCELLED' });
    const count = await this.classRepo.countActiveEnrollments(id);
    return this.mapToDto(updated, count);
  }
}
