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
import { BooksService } from '../application/services/books.service';
import type {
  CreateBookInput,
  UpdateBookInput,
  QueryBooksInput,
  BookResponseDto,
} from '../application/dto/book.dto';
import type {
  CreateBookPartInput,
  BookPartResponseDto,
} from '../application/dto/book-part.dto';
import type { PaginatedResult, NextBookResult } from '@edutech/shared';

@Controller('books')
@UseGuards(AuthGuard, RolesGuard)
export class BooksController {
  constructor(
    @Inject(BooksService)
    private readonly booksService: BooksService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryBooksInput): Promise<PaginatedResult<BookResponseDto>> {
    return this.booksService.findAllBooks(query);
  }

  @Post()
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateBookInput): Promise<BookResponseDto> {
    return this.booksService.createBook(body);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<BookResponseDto> {
    return this.booksService.findBookById(id);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBookInput,
  ): Promise<BookResponseDto> {
    return this.booksService.updateBook(id, body);
  }

  @Get(':id/next')
  async getNextBook(@Param('id') id: string): Promise<NextBookResult> {
    return this.booksService.getNextBook(id);
  }

  @Get(':id/parts')
  async findParts(@Param('id') id: string): Promise<BookPartResponseDto[]> {
    return this.booksService.findPartsByBookId(id);
  }

  @Post(':id/parts')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async createPart(
    @Param('id') id: string,
    @Body() body: CreateBookPartInput,
  ): Promise<BookPartResponseDto> {
    return this.booksService.createBookPart(id, body);
  }
}
