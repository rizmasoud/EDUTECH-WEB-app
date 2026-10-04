import { Injectable, Inject } from '@nestjs/common';
import { eq, asc, ilike, and, count, gt } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import {
  books,
  bookParts,
  bookSegments,
} from '../../infrastructure/database/schema/academics.schema';
import { Book } from '../domain/entities/book.entity';
import { BookPart } from '../domain/entities/book-part.entity';
import { BookSegment } from '../domain/entities/book-segment.entity';
import type {
  IBookRepository,
  FindBooksFilter,
  BookSegmentHierarchy,
} from '../domain/repositories/book.repository.interface';

@Injectable()
export class DrizzleBookRepository implements IBookRepository {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  private mapBookRow(row: typeof books.$inferSelect): Book {
    return new Book(
      row.id,
      row.name,
      row.level,
      row.sequenceOrder,
      row.sessionCount,
      row.isTerminal,
      row.isActive,
      row.createdAt,
      row.updatedAt,
    );
  }

  private mapPartRow(row: typeof bookParts.$inferSelect): BookPart {
    return new BookPart(
      row.id,
      row.bookId,
      row.name,
      row.sequenceOrder,
      row.createdAt,
      row.updatedAt,
    );
  }

  private mapSegmentRow(row: typeof bookSegments.$inferSelect): BookSegment {
    return new BookSegment(
      row.id,
      row.bookPartId,
      row.name,
      row.sequenceOrder,
      row.createdAt,
      row.updatedAt,
    );
  }

  // --- Books ---

  async findBookById(id: string): Promise<Book | null> {
    const [row] = await this.db
      .select()
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    return row ? this.mapBookRow(row) : null;
  }

  async findAllBooks(filter?: FindBooksFilter): Promise<{ items: Book[]; total: number }> {
    const conditions: any[] = [];

    if (filter?.isActive !== undefined) {
      conditions.push(eq(books.isActive, filter.isActive));
    }
    if (filter?.level) {
      conditions.push(eq(books.level, filter.level));
    }
    if (filter?.search) {
      conditions.push(ilike(books.name, `%${filter.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(books)
      .where(whereClause);
    const total = Number(countResult?.val || 0);

    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(books)
      .where(whereClause)
      .orderBy(asc(books.sequenceOrder))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map((r: typeof books.$inferSelect) => this.mapBookRow(r)),
      total,
    };
  }

  async createBook(data: {
    name: string;
    level: string;
    sequenceOrder: number;
    sessionCount: number;
    isTerminal: boolean;
    isActive: boolean;
  }): Promise<Book> {
    const [row] = await this.db
      .insert(books)
      .values({
        name: data.name,
        level: data.level,
        sequenceOrder: data.sequenceOrder,
        sessionCount: data.sessionCount,
        isTerminal: data.isTerminal,
        isActive: data.isActive,
      })
      .returning();

    return this.mapBookRow(row);
  }

  async updateBook(
    id: string,
    updates: Partial<{
      name: string;
      level: string;
      sequenceOrder: number;
      sessionCount: number;
      isTerminal: boolean;
      isActive: boolean;
    }>,
  ): Promise<Book> {
    const values: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) values.name = updates.name;
    if (updates.level !== undefined) values.level = updates.level;
    if (updates.sequenceOrder !== undefined) values.sequenceOrder = updates.sequenceOrder;
    if (updates.sessionCount !== undefined) values.sessionCount = updates.sessionCount;
    if (updates.isTerminal !== undefined) values.isTerminal = updates.isTerminal;
    if (updates.isActive !== undefined) values.isActive = updates.isActive;

    const [row] = await this.db
      .update(books)
      .set(values)
      .where(eq(books.id, id))
      .returning();

    return this.mapBookRow(row);
  }

  async findNextBookBySequence(currentSequenceOrder: number): Promise<Book | null> {
    const [row] = await this.db
      .select()
      .from(books)
      .where(and(gt(books.sequenceOrder, currentSequenceOrder), eq(books.isActive, true)))
      .orderBy(asc(books.sequenceOrder))
      .limit(1);

    return row ? this.mapBookRow(row) : null;
  }

  // --- Book Parts ---

  async findPartsByBookId(bookId: string): Promise<BookPart[]> {
    const rows = await this.db
      .select()
      .from(bookParts)
      .where(eq(bookParts.bookId, bookId))
      .orderBy(asc(bookParts.sequenceOrder));

    return rows.map((r: typeof bookParts.$inferSelect) => this.mapPartRow(r));
  }

  async findPartById(id: string): Promise<BookPart | null> {
    const [row] = await this.db
      .select()
      .from(bookParts)
      .where(eq(bookParts.id, id))
      .limit(1);

    return row ? this.mapPartRow(row) : null;
  }

  async createPart(data: {
    bookId: string;
    name: string;
    sequenceOrder: number;
  }): Promise<BookPart> {
    const [row] = await this.db
      .insert(bookParts)
      .values({
        bookId: data.bookId,
        name: data.name,
        sequenceOrder: data.sequenceOrder,
      })
      .returning();

    return this.mapPartRow(row);
  }

  async updatePart(
    id: string,
    updates: Partial<{
      name: string;
      sequenceOrder: number;
    }>,
  ): Promise<BookPart> {
    const values: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) values.name = updates.name;
    if (updates.sequenceOrder !== undefined) values.sequenceOrder = updates.sequenceOrder;

    const [row] = await this.db
      .update(bookParts)
      .set(values)
      .where(eq(bookParts.id, id))
      .returning();

    return this.mapPartRow(row);
  }

  // --- Book Segments ---

  async findSegmentsByPartId(bookPartId: string): Promise<BookSegment[]> {
    const rows = await this.db
      .select()
      .from(bookSegments)
      .where(eq(bookSegments.bookPartId, bookPartId))
      .orderBy(asc(bookSegments.sequenceOrder));

    return rows.map((r: typeof bookSegments.$inferSelect) => this.mapSegmentRow(r));
  }

  async findSegmentById(id: string): Promise<BookSegment | null> {
    const [row] = await this.db
      .select()
      .from(bookSegments)
      .where(eq(bookSegments.id, id))
      .limit(1);

    return row ? this.mapSegmentRow(row) : null;
  }

  async createSegment(data: {
    bookPartId: string;
    name: string;
    sequenceOrder: number;
  }): Promise<BookSegment> {
    const [row] = await this.db
      .insert(bookSegments)
      .values({
        bookPartId: data.bookPartId,
        name: data.name,
        sequenceOrder: data.sequenceOrder,
      })
      .returning();

    return this.mapSegmentRow(row);
  }

  async updateSegment(
    id: string,
    updates: Partial<{
      name: string;
      sequenceOrder: number;
    }>,
  ): Promise<BookSegment> {
    const values: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) values.name = updates.name;
    if (updates.sequenceOrder !== undefined) values.sequenceOrder = updates.sequenceOrder;

    const [row] = await this.db
      .update(bookSegments)
      .set(values)
      .where(eq(bookSegments.id, id))
      .returning();

    return this.mapSegmentRow(row);
  }

  // --- Hierarchy ---

  async findSegmentHierarchy(segmentId: string): Promise<BookSegmentHierarchy | null> {
    const [row] = await this.db
      .select({
        segment: bookSegments,
        part: bookParts,
        book: books,
      })
      .from(bookSegments)
      .innerJoin(bookParts, eq(bookSegments.bookPartId, bookParts.id))
      .innerJoin(books, eq(bookParts.bookId, books.id))
      .where(eq(bookSegments.id, segmentId))
      .limit(1);

    if (!row) return null;

    return {
      segment: this.mapSegmentRow(row.segment),
      part: this.mapPartRow(row.part),
      book: this.mapBookRow(row.book),
    };
  }
}
