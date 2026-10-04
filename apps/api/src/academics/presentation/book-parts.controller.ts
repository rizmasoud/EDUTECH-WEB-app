import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
  UpdateBookPartInput,
  BookPartResponseDto,
} from '../application/dto/book-part.dto';
import type {
  CreateBookSegmentInput,
  BookSegmentResponseDto,
} from '../application/dto/book-segment.dto';

@Controller('book-parts')
@UseGuards(AuthGuard, RolesGuard)
export class BookPartsController {
  constructor(
    @Inject(BooksService)
    private readonly booksService: BooksService,
  ) {}

  @Get(':id')
  async findById(@Param('id') id: string): Promise<BookPartResponseDto> {
    return this.booksService.findPartById(id);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBookPartInput,
  ): Promise<BookPartResponseDto> {
    return this.booksService.updateBookPart(id, body);
  }

  @Get(':id/segments')
  async findSegments(@Param('id') id: string): Promise<BookSegmentResponseDto[]> {
    return this.booksService.findSegmentsByPartId(id);
  }

  @Post(':id/segments')
  @Roles('SUPERVISOR')
  @HttpCode(HttpStatus.CREATED)
  async createSegment(
    @Param('id') id: string,
    @Body() body: CreateBookSegmentInput,
  ): Promise<BookSegmentResponseDto> {
    return this.booksService.createBookSegment(id, body);
  }
}
