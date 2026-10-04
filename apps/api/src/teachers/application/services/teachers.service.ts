import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TEACHER_REPOSITORY } from '../../domain/tokens';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.interface';
import { CLASS_REPOSITORY } from '../../../classes/domain/tokens';
import type { IClassRepository } from '../../../classes/domain/repositories/class.repository.interface';
import { TeacherOwnershipPolicy } from '../../../auth/presentation/policies/teacher-ownership.policy';
import { Teacher } from '../../domain/entities/teacher.entity';
import { TeacherSkill } from '../../domain/entities/teacher-skill.entity';
import {
  CreateTeacherSchema,
  UpdateTeacherSchema,
  CreateTeacherSkillSchema,
  type CreateTeacherDto,
  type UpdateTeacherDto,
  type CreateTeacherSkillDto,
  type TeacherResponseDto,
  type TeacherSkillResponseDto,
  type FindTeachersFilter,
  type PaginatedResult,
  type ClassResponseDto,
  type AuthUser,
} from '@edutech/shared';

@Injectable()
export class TeachersService {
  constructor(
    @Inject(TEACHER_REPOSITORY)
    private readonly teacherRepo: ITeacherRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: IClassRepository,
    @Inject(TeacherOwnershipPolicy)
    private readonly teacherOwnershipPolicy: TeacherOwnershipPolicy,
  ) {}

  private mapToDto(teacher: Teacher): TeacherResponseDto {
    return {
      id: teacher.id,
      accountId: teacher.accountId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      baseRate: teacher.baseRate,
      isActive: teacher.isActive,
      createdAt: teacher.createdAt,
      updatedAt: teacher.updatedAt,
    };
  }

  private mapSkillToDto(skill: TeacherSkill): TeacherSkillResponseDto {
    return {
      id: skill.id,
      teacherId: skill.teacherId,
      bookId: skill.bookId,
      bookName: skill.bookName,
      bookLevel: skill.bookLevel,
      createdAt: skill.createdAt,
    };
  }

  async create(input: CreateTeacherDto): Promise<TeacherResponseDto> {
    const parseResult = CreateTeacherSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const created = await this.teacherRepo.create(parseResult.data);
    return this.mapToDto(created);
  }

  async findAll(filter?: FindTeachersFilter): Promise<PaginatedResult<TeacherResponseDto>> {
    const page = Math.max(1, Number(filter?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter?.pageSize) || 20));

    const result = await this.teacherRepo.findAll({
      search: filter?.search,
      isActive: filter?.isActive,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((t) => this.mapToDto(t)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string): Promise<TeacherResponseDto> {
    const teacher = await this.teacherRepo.findById(id);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${id} not found`,
      });
    }

    return this.mapToDto(teacher);
  }

  async update(id: string, input: UpdateTeacherDto): Promise<TeacherResponseDto> {
    const parseResult = UpdateTeacherSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const teacher = await this.teacherRepo.findById(id);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${id} not found`,
      });
    }

    const updated = await this.teacherRepo.update(id, parseResult.data);
    return this.mapToDto(updated);
  }

  async findSkills(teacherId: string): Promise<TeacherSkillResponseDto[]> {
    const teacher = await this.teacherRepo.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${teacherId} not found`,
      });
    }

    const skills = await this.teacherRepo.findSkills(teacherId);
    return skills.map((s) => this.mapSkillToDto(s));
  }

  async addSkill(teacherId: string, input: CreateTeacherSkillDto): Promise<TeacherSkillResponseDto> {
    const parseResult = CreateTeacherSkillSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const teacher = await this.teacherRepo.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${teacherId} not found`,
      });
    }

    const { bookId } = parseResult.data;

    // Verify book exists and is active
    const bookValid = await this.teacherRepo.verifyBookExistsAndActive(bookId);
    if (!bookValid) {
      throw new BadRequestException({
        code: 'INVALID_BOOK',
        message: 'Book does not exist or is inactive',
      });
    }

    // Check duplicate skill
    const existing = await this.teacherRepo.findSkillByTeacherAndBook(teacherId, bookId);
    if (existing) {
      throw new BadRequestException({
        code: 'DUPLICATE_SKILL',
        message: 'Teacher already has this skill approved',
      });
    }

    const created = await this.teacherRepo.addSkill(teacherId, bookId);
    return this.mapSkillToDto(created);
  }

  async deleteSkill(teacherId: string, skillId: string): Promise<void> {
    const teacher = await this.teacherRepo.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${teacherId} not found`,
      });
    }

    await this.teacherRepo.deleteSkill(teacherId, skillId);
  }

  async findTeacherClasses(
    teacherId: string,
    currentUser: AuthUser,
  ): Promise<PaginatedResult<ClassResponseDto>> {
    // Enforce teacher ownership policy
    this.teacherOwnershipPolicy.assertAccess(currentUser, teacherId);

    const teacher = await this.teacherRepo.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Teacher with id ${teacherId} not found`,
      });
    }

    const result = await this.classRepo.findAll({ teacherId, pageSize: 100 });
    const items = await Promise.all(
      result.items.map(async (cls) => {
        const count = await this.classRepo.countActiveEnrollments(cls.id);
        return {
          id: cls.id,
          academicTermId: cls.academicTermId,
          bookId: cls.bookId,
          bookSegmentId: cls.bookSegmentId,
          teacherId: cls.teacherId,
          classType: cls.classType,
          status: cls.status,
          capacity: cls.capacity,
          activeEnrollmentCount: count,
          createdAt: cls.createdAt,
          updatedAt: cls.updatedAt,
        };
      }),
    );

    return {
      items,
      total: result.total,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    };
  }
}
