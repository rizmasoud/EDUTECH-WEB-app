import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ACADEMIC_TERM_REPOSITORY } from '../../domain/tokens';
import type { IAcademicTermRepository } from '../../domain/repositories/academic-term.repository.interface';
import { AcademicTerm } from '../../domain/entities/academic-term.entity';
import {
  CreateAcademicTermSchema,
  UpdateAcademicTermSchema,
  type AcademicTermStatus,
  type PaginatedResult,
} from '@edutech/shared';
import type {
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
  QueryAcademicTermsInput,
  AcademicTermResponseDto,
} from '../dto/academic-term.dto';

@Injectable()
export class AcademicTermsService {
  constructor(
    @Inject(ACADEMIC_TERM_REPOSITORY)
    private readonly termRepo: IAcademicTermRepository,
  ) {}

  private mapToDto(term: AcademicTerm): AcademicTermResponseDto {
    return {
      id: term.id,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
      status: term.status,
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
    };
  }

  async create(input: CreateAcademicTermInput): Promise<AcademicTermResponseDto> {
    const parseResult = CreateAcademicTermSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const { name, startDate, endDate, status } = parseResult.data;

    try {
      AcademicTerm.validateDates(startDate, endDate);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'startDate must be strictly before endDate',
      });
    }

    const created = await this.termRepo.create({
      name,
      startDate,
      endDate,
      status: (status as AcademicTermStatus) ?? 'PLANNED',
    });

    return this.mapToDto(created);
  }

  async findAll(query: QueryAcademicTermsInput): Promise<PaginatedResult<AcademicTermResponseDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const result = await this.termRepo.findAll({
      status: query.status,
      search: query.search,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((term) => this.mapToDto(term)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findById(id: string): Promise<AcademicTermResponseDto> {
    const term = await this.termRepo.findById(id);
    if (!term) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Academic term with id ${id} not found`,
      });
    }
    return this.mapToDto(term);
  }

  async update(id: string, input: UpdateAcademicTermInput): Promise<AcademicTermResponseDto> {
    const parseResult = UpdateAcademicTermSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const term = await this.termRepo.findById(id);
    if (!term) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Academic term with id ${id} not found`,
      });
    }

    if (!term.canBeModified()) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'Closed academic terms represent historical periods and cannot be modified.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const nextStartDate = input.startDate ?? term.startDate;
    const nextEndDate = input.endDate ?? term.endDate;

    try {
      AcademicTerm.validateDates(nextStartDate, nextEndDate);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'startDate must be strictly before endDate',
      });
    }

    const updated = await this.termRepo.update(id, {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    return this.mapToDto(updated);
  }

  async activate(id: string): Promise<AcademicTermResponseDto> {
    const term = await this.termRepo.findById(id);
    if (!term) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Academic term with id ${id} not found`,
      });
    }

    if (!term.canTransitionTo('ACTIVE')) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot activate term with status ${term.status}. Only PLANNED terms can become ACTIVE.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.termRepo.update(id, { status: 'ACTIVE' });
    return this.mapToDto(updated);
  }

  async close(id: string): Promise<AcademicTermResponseDto> {
    const term = await this.termRepo.findById(id);
    if (!term) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Academic term with id ${id} not found`,
      });
    }

    if (!term.canTransitionTo('CLOSED')) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot close term with status ${term.status}. Only ACTIVE terms can become CLOSED.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.termRepo.update(id, { status: 'CLOSED' });
    return this.mapToDto(updated);
  }
}
