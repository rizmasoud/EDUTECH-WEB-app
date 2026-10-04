import type { Book } from '../entities/book.entity';
import type { BookPart } from '../entities/book-part.entity';
import type { BookSegment } from '../entities/book-segment.entity';

export interface FindBooksFilter {
  isActive?: boolean;
  level?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface BookSegmentHierarchy {
  segment: BookSegment;
  part: BookPart;
  book: Book;
}

export interface IBookRepository {
  // Books
  findBookById(id: string): Promise<Book | null>;
  findAllBooks(filter?: FindBooksFilter): Promise<{ items: Book[]; total: number }>;
  createBook(data: {
    name: string;
    level: string;
    sequenceOrder: number;
    sessionCount: number;
    isTerminal: boolean;
    isActive: boolean;
  }): Promise<Book>;
  updateBook(
    id: string,
    updates: Partial<{
      name: string;
      level: string;
      sequenceOrder: number;
      sessionCount: number;
      isTerminal: boolean;
      isActive: boolean;
    }>,
  ): Promise<Book>;
  findNextBookBySequence(currentSequenceOrder: number): Promise<Book | null>;

  // Book Parts
  findPartsByBookId(bookId: string): Promise<BookPart[]>;
  findPartById(id: string): Promise<BookPart | null>;
  createPart(data: {
    bookId: string;
    name: string;
    sequenceOrder: number;
  }): Promise<BookPart>;
  updatePart(
    id: string,
    updates: Partial<{
      name: string;
      sequenceOrder: number;
    }>,
  ): Promise<BookPart>;

  // Book Segments
  findSegmentsByPartId(partId: string): Promise<BookSegment[]>;
  findSegmentById(id: string): Promise<BookSegment | null>;
  createSegment(data: {
    bookPartId: string;
    name: string;
    sequenceOrder: number;
  }): Promise<BookSegment>;
  updateSegment(
    id: string,
    updates: Partial<{
      name: string;
      sequenceOrder: number;
    }>,
  ): Promise<BookSegment>;

  // Hierarchy
  findSegmentHierarchy(segmentId: string): Promise<BookSegmentHierarchy | null>;
}
