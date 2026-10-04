import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../auth/presentation/guards/roles.guard';
import { Roles } from '../../auth/presentation/decorators/roles.decorator';
import { BooksService } from '../application/services/books.service';
import type {
  UpdateBookSegmentInput,
  BookSegmentResponseDto,
} from '../application/dto/book-segment.dto';
import type { BookSegmentHierarchy } from '../domain/repositories/book.repository.interface';

@Controller('book-segments')
@UseGuards(AuthGuard, RolesGuard)
export class BookSegmentsController {
  constructor(
    @Inject(BooksService)
    private readonly booksService: BooksService,
  ) {}

  @Get(':id')
  async findById(@Param('id') id: string): Promise<BookSegmentResponseDto> {
    return this.booksService.findSegmentById(id);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBookSegmentInput,
  ): Promise<BookSegmentResponseDto> {
    return this.booksService.updateBookSegment(id, body);
  }

  @Get(':id/hierarchy')
  async getHierarchy(@Param('id') id: string): Promise<BookSegmentHierarchy> {
    return this.booksService.getSegmentHierarchy(id);
  }
}
