import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BOOK_REPOSITORY } from '../../domain/tokens';
import type {
  IBookRepository,
  BookSegmentHierarchy,
} from '../../domain/repositories/book.repository.interface';
import { Book } from '../../domain/entities/book.entity';
import { BookPart } from '../../domain/entities/book-part.entity';
import { BookSegment } from '../../domain/entities/book-segment.entity';
import {
  CreateBookSchema,
  UpdateBookSchema,
  CreateBookPartSchema,
  UpdateBookPartSchema,
  CreateBookSegmentSchema,
  UpdateBookSegmentSchema,
  type PaginatedResult,
  type NextBookResult,
} from '@edutech/shared';
import type {
  CreateBookInput,
  UpdateBookInput,
  QueryBooksInput,
  BookResponseDto,
} from '../dto/book.dto';
import type {
  CreateBookPartInput,
  UpdateBookPartInput,
  BookPartResponseDto,
} from '../dto/book-part.dto';
import type {
  CreateBookSegmentInput,
  UpdateBookSegmentInput,
  BookSegmentResponseDto,
} from '../dto/book-segment.dto';

@Injectable()
export class BooksService {
  constructor(
    @Inject(BOOK_REPOSITORY)
    private readonly bookRepo: IBookRepository,
  ) {}

  private mapBookToDto(book: Book): BookResponseDto {
    return {
      id: book.id,
      name: book.name,
      level: book.level,
      sequenceOrder: book.sequenceOrder,
      sessionCount: book.sessionCount,
      isTerminal: book.isTerminal,
      isActive: book.isActive,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }

  private mapPartToDto(part: BookPart): BookPartResponseDto {
    return {
      id: part.id,
      bookId: part.bookId,
      name: part.name,
      sequenceOrder: part.sequenceOrder,
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
    };
  }

  private mapSegmentToDto(segment: BookSegment): BookSegmentResponseDto {
    return {
      id: segment.id,
      bookPartId: segment.bookPartId,
      name: segment.name,
      sequenceOrder: segment.sequenceOrder,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }

  // --- Books ---

  async createBook(input: CreateBookInput): Promise<BookResponseDto> {
    const parseResult = CreateBookSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const { name, level, sequenceOrder, sessionCount, isTerminal, isActive } =
      parseResult.data;

    try {
      Book.validateInvariants(sequenceOrder, sessionCount);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: err.message,
      });
    }

    const created = await this.bookRepo.createBook({
      name,
      level,
      sequenceOrder,
      sessionCount,
      isTerminal: isTerminal ?? false,
      isActive: isActive ?? true,
    });

    return this.mapBookToDto(created);
  }

  async findAllBooks(query: QueryBooksInput): Promise<PaginatedResult<BookResponseDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    let isActiveFilter: boolean | undefined = undefined;
    if (query.isActive !== undefined) {
      if (typeof query.isActive === 'boolean') {
        isActiveFilter = query.isActive;
      } else if (typeof query.isActive === 'string') {
        isActiveFilter = query.isActive.toLowerCase() === 'true';
      }
    }

    const result = await this.bookRepo.findAllBooks({
      isActive: isActiveFilter,
      level: query.level,
      search: query.search,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(result.total / pageSize) || 1;

    return {
      items: result.items.map((b) => this.mapBookToDto(b)),
      total: result.total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findBookById(id: string): Promise<BookResponseDto> {
    const book = await this.bookRepo.findBookById(id);
    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${id} not found`,
      });
    }
    return this.mapBookToDto(book);
  }

  async updateBook(id: string, input: UpdateBookInput): Promise<BookResponseDto> {
    const parseResult = UpdateBookSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const book = await this.bookRepo.findBookById(id);
    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${id} not found`,
      });
    }

    const nextSequenceOrder = input.sequenceOrder ?? book.sequenceOrder;
    const nextSessionCount = input.sessionCount ?? book.sessionCount;

    try {
      Book.validateInvariants(nextSequenceOrder, nextSessionCount);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: err.message,
      });
    }

    const updated = await this.bookRepo.updateBook(id, {
      name: input.name,
      level: input.level,
      sequenceOrder: input.sequenceOrder,
      sessionCount: input.sessionCount,
      isTerminal: input.isTerminal,
      isActive: input.isActive,
    });

    return this.mapBookToDto(updated);
  }

  async getNextBook(currentBookId: string): Promise<NextBookResult> {
    const currentBook = await this.bookRepo.findBookById(currentBookId);
    if (!currentBook) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${currentBookId} not found`,
      });
    }

    // Business rule 4.3: Terminal books
    if (currentBook.isTerminal) {
      return {
        outcome: 'TERMINAL_COMPLETION',
        message: 'Student has completed a terminal book in the educational sequence.',
      };
    }

    const nextBook = await this.bookRepo.findNextBookBySequence(currentBook.sequenceOrder);
    if (!nextBook) {
      return {
        outcome: 'NO_NEXT_BOOK',
      };
    }

    return {
      outcome: 'NEXT_BOOK',
      book: this.mapBookToDto(nextBook) as any,
    };
  }

  // --- Book Parts ---

  async findPartsByBookId(bookId: string): Promise<BookPartResponseDto[]> {
    const book = await this.bookRepo.findBookById(bookId);
    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${bookId} not found`,
      });
    }

    const parts = await this.bookRepo.findPartsByBookId(bookId);
    return parts.map((p) => this.mapPartToDto(p));
  }

  async findPartById(id: string): Promise<BookPartResponseDto> {
    const part = await this.bookRepo.findPartById(id);
    if (!part) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookPart with id ${id} not found`,
      });
    }
    return this.mapPartToDto(part);
  }

  async createBookPart(bookId: string, input: CreateBookPartInput): Promise<BookPartResponseDto> {
    const book = await this.bookRepo.findBookById(bookId);
    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${bookId} not found`,
      });
    }

    const parseResult = CreateBookPartSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    try {
      BookPart.validateInvariants(parseResult.data.sequenceOrder);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: err.message,
      });
    }

    const created = await this.bookRepo.createPart({
      bookId,
      name: parseResult.data.name,
      sequenceOrder: parseResult.data.sequenceOrder,
    });

    return this.mapPartToDto(created);
  }

  async updateBookPart(id: string, input: UpdateBookPartInput): Promise<BookPartResponseDto> {
    const part = await this.bookRepo.findPartById(id);
    if (!part) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookPart with id ${id} not found`,
      });
    }

    const parseResult = UpdateBookPartSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    if (parseResult.data.sequenceOrder !== undefined) {
      try {
        BookPart.validateInvariants(parseResult.data.sequenceOrder);
      } catch (err: any) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: err.message,
        });
      }
    }

    const updated = await this.bookRepo.updatePart(id, {
      name: parseResult.data.name,
      sequenceOrder: parseResult.data.sequenceOrder,
    });

    return this.mapPartToDto(updated);
  }

  // --- Book Segments ---

  async findSegmentsByPartId(bookPartId: string): Promise<BookSegmentResponseDto[]> {
    const part = await this.bookRepo.findPartById(bookPartId);
    if (!part) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookPart with id ${bookPartId} not found`,
      });
    }

    const segments = await this.bookRepo.findSegmentsByPartId(bookPartId);
    return segments.map((s) => this.mapSegmentToDto(s));
  }

  async findSegmentById(id: string): Promise<BookSegmentResponseDto> {
    const segment = await this.bookRepo.findSegmentById(id);
    if (!segment) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookSegment with id ${id} not found`,
      });
    }
    return this.mapSegmentToDto(segment);
  }

  async createBookSegment(
    bookPartId: string,
    input: CreateBookSegmentInput,
  ): Promise<BookSegmentResponseDto> {
    const part = await this.bookRepo.findPartById(bookPartId);
    if (!part) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookPart with id ${bookPartId} not found`,
      });
    }

    const parseResult = CreateBookSegmentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    try {
      BookSegment.validateInvariants(parseResult.data.sequenceOrder);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: err.message,
      });
    }

    const created = await this.bookRepo.createSegment({
      bookPartId,
      name: parseResult.data.name,
      sequenceOrder: parseResult.data.sequenceOrder,
    });

    return this.mapSegmentToDto(created);
  }

  async updateBookSegment(
    id: string,
    input: UpdateBookSegmentInput,
  ): Promise<BookSegmentResponseDto> {
    const segment = await this.bookRepo.findSegmentById(id);
    if (!segment) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `BookSegment with id ${id} not found`,
      });
    }

    const parseResult = UpdateBookSegmentSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    if (parseResult.data.sequenceOrder !== undefined) {
      try {
        BookSegment.validateInvariants(parseResult.data.sequenceOrder);
      } catch (err: any) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: err.message,
        });
      }
    }

    const updated = await this.bookRepo.updateSegment(id, {
      name: parseResult.data.name,
      sequenceOrder: parseResult.data.sequenceOrder,
    });

    return this.mapSegmentToDto(updated);
  }

  // --- Hierarchy validation ---

  async verifySegmentBelongsToBook(segmentId: string, bookId: string): Promise<boolean> {
    const hierarchy = await this.bookRepo.findSegmentHierarchy(segmentId);
    if (!hierarchy) return false;
    return hierarchy.book.id === bookId;
  }

  async getSegmentHierarchy(segmentId: string): Promise<BookSegmentHierarchy> {
    const hierarchy = await this.bookRepo.findSegmentHierarchy(segmentId);
    if (!hierarchy) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Segment hierarchy with segment id ${segmentId} not found`,
      });
    }
    return hierarchy;
  }
}
