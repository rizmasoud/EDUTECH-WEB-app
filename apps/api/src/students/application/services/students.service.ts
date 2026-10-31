import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { STUDENT_REPOSITORY } from '../../domain/tokens';
import type { IStudentRepository } from '../../domain/repositories/student.repository.interface';
import { ENROLLMENT_REPOSITORY } from '../../../classes/domain/tokens';
import type { IEnrollmentRepository } from '../../../classes/domain/repositories/enrollment.repository.interface';
import { Student } from '../../domain/entities/student.entity';
import {
  CreateStudentSchema,
  UpdateStudentSchema,
  type CreateStudentDto,
  type UpdateStudentDto,
  type StudentResponseDto,
  type FindStudentsFilter,
  type PaginatedResult,
  type EnrollmentResponseDto,
  type AuthUser,
} from '@edutech/shared';
import { resolveDataScope, forbiddenResource } from '../../../auth/presentation/policies/teacher-data-scope';

@Injectable()
export class StudentsService {
  constructor(
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: IStudentRepository,
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: IEnrollmentRepository,
  ) {}

  private mapToDto(student: Student): StudentResponseDto {
    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      shahvarCode: student.shahvarCode,
      isActive: student.isActive,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    };
  }

  async create(input: CreateStudentDto): Promise<StudentResponseDto> {
    const parseResult = CreateStudentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const created = await this.studentRepo.create(parseResult.data);
    return this.mapToDto(created);
  }

  /**
   * A teacher may read a student only while that student has an ACTIVE enrollment in one of the teacher's own
   * classes. Supervisors are unrestricted. Same 403 whether the student is someone else's or does not exist.
   */
  private async assertCanReadStudent(studentId: string, user: AuthUser): Promise<void> {
    const scope = resolveDataScope(user);
    if (scope.kind === 'ALL') return;
    if (
      scope.kind === 'NONE' ||
      !(await this.studentRepo.isActivelyEnrolledWithTeacher(studentId, scope.teacherId))
    ) {
      throw forbiddenResource('You do not have permission to access this student');
    }
  }

  async findAll(
    filter: FindStudentsFilter | undefined,
    user: AuthUser,
  ): Promise<PaginatedResult<StudentResponseDto>> {
    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 20));

    const scope = resolveDataScope(user);
    if (scope.kind === 'NONE') {
      return { items: [], total: 0, page, pageSize, totalPages: 1 };
    }

    const result = await this.studentRepo.findAll(
      {
        search: filter?.search,
        isActive: filter?.isActive,
        page,
        pageSize,
      },
      scope.kind === 'TEACHER' ? { teacherId: scope.teacherId } : undefined,
    );

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((s) => this.mapToDto(s)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string, user: AuthUser): Promise<StudentResponseDto> {
    await this.assertCanReadStudent(id, user);
    const student = await this.studentRepo.findById(id);
    if (!student) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Student with id ${id} not found`,
      });
    }

    return this.mapToDto(student);
  }

  async update(id: string, input: UpdateStudentDto): Promise<StudentResponseDto> {
    const parseResult = UpdateStudentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const student = await this.studentRepo.findById(id);
    if (!student) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Student with id ${id} not found`,
      });
    }

    const updated = await this.studentRepo.update(id, parseResult.data);
    return this.mapToDto(updated);
  }

  async findStudentEnrollments(studentId: string, user: AuthUser): Promise<EnrollmentResponseDto[]> {
    await this.assertCanReadStudent(studentId, user);
    const scope = resolveDataScope(user);
    const student = await this.studentRepo.findById(studentId);
    if (!student) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Student with id ${studentId} not found`,
      });
    }

    // A teacher sees only the student's enrollments in the teacher's own classes, never the student's
    // enrollments in other teachers' classes (a student can be enrolled with several teachers).
    const enrollments =
      scope.kind === 'TEACHER'
        ? await this.enrollmentRepo.findAllByStudentAndTeacher(studentId, scope.teacherId)
        : await this.enrollmentRepo.findAllByStudent(studentId);
    return enrollments.map((e) => ({
      id: e.id,
      classId: e.classId,
      studentId: e.studentId,
      status: e.status,
      joinedAt: e.joinedAt,
      leftAt: e.leftAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }
}
