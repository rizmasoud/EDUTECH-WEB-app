import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, asc, isNull, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  books,
  bookParts,
  bookSegments,
  syllabi,
  syllabusItems,
} from '../../../infrastructure/database/schema/academics.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
import { SYLLABUS_ERROR_CODES, isUniqueViolation } from '../../domain/syllabus-scope';
import { countBookParts } from '../syllabus-resolution';
import {
  CreateSyllabusSchema,
  UpdateSyllabusSchema,
  CreateSyllabusItemSchema,
  UpdateSyllabusItemSchema,
  FindSyllabiFilterSchema,
} from '@edutech/shared';
import type {
  CreateSyllabusDto,
  UpdateSyllabusDto,
  FindSyllabiFilterDto,
  CreateSyllabusItemDto,
  UpdateSyllabusItemDto,
  SyllabusDetailDto,
  SyllabusItemDto,
  AuthUser,
} from '@edutech/shared';

@Injectable()
export class SyllabusService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: any,
  ) {}

  /**
   * Validates a syllabus scope and returns the normalised one.
   *
   * Rules: a syllabus belongs to a Book Part; a book with Parts has Part-specific syllabi only (no whole-book
   * syllabus); a book without Parts has exactly one whole-book syllabus; Segments are never a scope; no duplicates.
   */
  private async validateScope(
    db: any,
    scope: { bookId: string; bookPartId?: string | null; bookSegmentId?: string | null },
    excludeSyllabusId?: string,
  ): Promise<{ bookId: string; bookPartId: string | null }> {
    if (scope.bookSegmentId) {
      throw new BadRequestException({
        code: SYLLABUS_ERROR_CODES.SEGMENT_SCOPE_NOT_ALLOWED,
        message:
          'A syllabus cannot be defined for a segment. Syllabi belong to a book part (or to the whole book when it has no parts).',
      });
    }

    const [book] = await db.select().from(books).where(eq(books.id, scope.bookId)).limit(1);
    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${scope.bookId} not found`,
      });
    }

    const partId = scope.bookPartId ?? null;
    const partCount = await countBookParts(db, scope.bookId);

    if (partId) {
      const [part] = await db
        .select({ id: bookParts.id, bookId: bookParts.bookId })
        .from(bookParts)
        .where(eq(bookParts.id, partId))
        .limit(1);
      if (!part) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Book part with id ${partId} not found`,
        });
      }
      if (part.bookId !== scope.bookId) {
        if (partCount === 0) {
          throw new BadRequestException({
            code: SYLLABUS_ERROR_CODES.PART_NOT_APPLICABLE,
            message: `Book "${book.name}" has no parts, so a part-specific syllabus is not applicable. Its syllabus covers the whole book.`,
          });
        }
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `Book part ${partId} does not belong to book ${scope.bookId}`,
        });
      }
    } else if (partCount > 0) {
      throw new BadRequestException({
        code: SYLLABUS_ERROR_CODES.PART_REQUIRED,
        message: `Book "${book.name}" has ${partCount} part(s), so its syllabus must belong to a specific part. A whole-book syllabus is not allowed.`,
      });
    }

    // A Part id is only meaningful when the book has Parts (guaranteed above once the part belongs to the book).
    const duplicateConditions = [eq(syllabi.bookId, scope.bookId)];
    if (partId) {
      duplicateConditions.push(eq(syllabi.bookPartId, partId));
    } else {
      duplicateConditions.push(isNull(syllabi.bookPartId), isNull(syllabi.bookSegmentId));
    }
    const duplicates = await db
      .select({ id: syllabi.id })
      .from(syllabi)
      .where(and(...duplicateConditions));
    if (duplicates.some((d: { id: string }) => d.id !== excludeSyllabusId)) {
      throw this.duplicateScopeError(partId === null);
    }

    return { bookId: scope.bookId, bookPartId: partId };
  }

  private duplicateScopeError(wholeBook: boolean): ConflictException {
    return new ConflictException({
      code: SYLLABUS_ERROR_CODES.DUPLICATE_SCOPE,
      message: wholeBook
        ? 'This book already has a whole-book syllabus.'
        : 'This book part already has a syllabus. Each part has exactly one syllabus.',
    });
  }

  private baseSelect() {
    return this.db
      .select({
        id: syllabi.id,
        bookId: syllabi.bookId,
        bookPartId: syllabi.bookPartId,
        bookSegmentId: syllabi.bookSegmentId,
        createdAt: syllabi.createdAt,
        updatedAt: syllabi.updatedAt,
        bookName: books.name,
        bookLevel: books.level,
        partName: bookParts.name,
        partSequenceOrder: bookParts.sequenceOrder,
        bookSegmentName: bookSegments.name,
      })
      .from(syllabi)
      .innerJoin(books, eq(syllabi.bookId, books.id))
      .leftJoin(bookParts, eq(syllabi.bookPartId, bookParts.id))
      .leftJoin(bookSegments, eq(syllabi.bookSegmentId, bookSegments.id));
  }

  private toDetail(s: any): SyllabusDetailDto {
    return {
      id: s.id,
      bookId: s.bookId,
      bookPartId: s.bookPartId,
      bookSegmentId: s.bookSegmentId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      book: {
        id: s.bookId,
        name: s.bookName,
        level: s.bookLevel,
      },
      bookPart: s.bookPartId
        ? {
            id: s.bookPartId,
            name: s.partName,
            sequenceOrder: s.partSequenceOrder,
          }
        : null,
      // Legacy scope only: kept readable so the Supervisor can see and move such syllabi to their Part.
      bookSegment: s.bookSegmentId
        ? {
            id: s.bookSegmentId,
            name: s.bookSegmentName,
          }
        : null,
    };
  }

  /**
   * GET /api/v1/syllabi
   */
  async findAll(filter?: FindSyllabiFilterDto): Promise<SyllabusDetailDto[]> {
    const parseResult = FindSyllabiFilterSchema.safeParse(filter || {});
    const queryFilter = parseResult.success ? parseResult.data : {};

    const conditions: SQL[] = [];
    if (queryFilter.bookId) {
      conditions.push(eq(syllabi.bookId, queryFilter.bookId));
    }
    if (queryFilter.bookPartId) {
      conditions.push(eq(syllabi.bookPartId, queryFilter.bookPartId));
    }
    if (queryFilter.bookSegmentId) {
      conditions.push(eq(syllabi.bookSegmentId, queryFilter.bookSegmentId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await this.baseSelect()
      .where(whereClause)
      .orderBy(asc(syllabi.createdAt), asc(syllabi.id));

    return list.map((s: any) => this.toDetail(s));
  }

  /**
   * GET /api/v1/syllabi/:id
   */
  async findOne(id: string): Promise<SyllabusDetailDto> {
    const [s] = await this.baseSelect().where(eq(syllabi.id, id)).limit(1);

    if (!s) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Syllabus with id ${id} not found`,
      });
    }

    const items = await this.db
      .select()
      .from(syllabusItems)
      .where(eq(syllabusItems.syllabusId, id))
      .orderBy(syllabusItems.sequenceOrder);

    return {
      ...this.toDetail(s),
      items: items.map((i: any) => ({
        id: i.id,
        syllabusId: i.syllabusId,
        type: i.type,
        title: i.title,
        description: i.description,
        required: i.required,
        sequenceOrder: i.sequenceOrder,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
    };
  }

  /**
   * POST /api/v1/syllabi (SUPERVISOR only)
   */
  async create(dto: CreateSyllabusDto, user: AuthUser): Promise<SyllabusDetailDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can create a syllabus',
      });
    }

    const parseResult = CreateSyllabusSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const data = parseResult.data;

    const createdId = await this.db.transaction(async (tx: any) => {
      // Validation and insert share one transaction; the unique indexes are the final guard against races.
      const scope = await this.validateScope(tx, data);

      let created;
      try {
        [created] = await tx
          .insert(syllabi)
          .values({
            bookId: scope.bookId,
            bookPartId: scope.bookPartId,
            bookSegmentId: null,
          })
          .returning();
      } catch (error) {
        if (isUniqueViolation(error)) throw this.duplicateScopeError(scope.bookPartId === null);
        throw error;
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_SYLLABUS',
        entityType: 'SYLLABUS',
        entityId: created.id,
        metadata: {
          bookId: scope.bookId,
          bookPartId: scope.bookPartId,
        },
      });

      return created.id;
    });

    return this.findOne(createdId);
  }

  /**
   * PATCH /api/v1/syllabi/:id (SUPERVISOR only)
   *
   * The resulting scope must satisfy the same rules as creation. A legacy segment-scoped syllabus is moved to its
   * Part only by this explicit Supervisor action; doing so clears the legacy segment link.
   */
  async update(
    id: string,
    dto: UpdateSyllabusDto,
    user: AuthUser,
  ): Promise<SyllabusDetailDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can update a syllabus',
      });
    }

    const parseResult = UpdateSyllabusSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const existing = await this.findOne(id);
    const data = parseResult.data;

    const targetBookId = data.bookId || existing.bookId;
    const targetPartId =
      data.bookPartId !== undefined ? data.bookPartId : (existing.bookPartId ?? null);

    await this.db.transaction(async (tx: any) => {
      const scope = await this.validateScope(
        tx,
        { bookId: targetBookId, bookPartId: targetPartId, bookSegmentId: data.bookSegmentId },
        id,
      );

      try {
        await tx
          .update(syllabi)
          .set({
            bookId: scope.bookId,
            bookPartId: scope.bookPartId,
            bookSegmentId: null,
            updatedAt: new Date(),
          })
          .where(eq(syllabi.id, id));
      } catch (error) {
        if (isUniqueViolation(error)) throw this.duplicateScopeError(scope.bookPartId === null);
        throw error;
      }

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_SYLLABUS',
        entityType: 'SYLLABUS',
        entityId: id,
        metadata: {
          bookId: scope.bookId,
          bookPartId: scope.bookPartId,
          previousBookSegmentId: existing.bookSegmentId ?? null,
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * GET /api/v1/syllabi/:id/items
   */
  async findItems(syllabusId: string): Promise<SyllabusItemDto[]> {
    await this.findOne(syllabusId); // ensure syllabus exists

    const items = await this.db
      .select()
      .from(syllabusItems)
      .where(eq(syllabusItems.syllabusId, syllabusId))
      .orderBy(syllabusItems.sequenceOrder);

    return items.map((i: any) => ({
      id: i.id,
      syllabusId: i.syllabusId,
      type: i.type,
      title: i.title,
      description: i.description,
      required: i.required,
      sequenceOrder: i.sequenceOrder,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  /**
   * POST /api/v1/syllabi/:id/items (SUPERVISOR only)
   */
  async addItem(
    syllabusId: string,
    dto: CreateSyllabusItemDto,
    user: AuthUser,
  ): Promise<SyllabusItemDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can add syllabus items',
      });
    }

    const parseResult = CreateSyllabusItemSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    await this.findOne(syllabusId); // ensure syllabus exists
    const data = parseResult.data;

    return await this.db.transaction(async (tx: any) => {
      // Check duplicate sequenceOrder inside same syllabus
      const [existingSeq] = await tx
        .select()
        .from(syllabusItems)
        .where(
          and(
            eq(syllabusItems.syllabusId, syllabusId),
            eq(syllabusItems.sequenceOrder, data.sequenceOrder),
          ),
        )
        .limit(1);

      if (existingSeq) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `Sequence order ${data.sequenceOrder} is already in use for this syllabus`,
        });
      }

      const [item] = await tx
        .insert(syllabusItems)
        .values({
          syllabusId,
          type: data.type,
          title: data.title,
          description: data.description || null,
          required: data.required ?? true,
          sequenceOrder: data.sequenceOrder,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_SYLLABUS_ITEM',
        entityType: 'SYLLABUS_ITEM',
        entityId: item.id,
        metadata: {
          syllabusId,
          type: data.type,
          title: data.title,
          sequenceOrder: data.sequenceOrder,
        },
      });

      return {
        id: item.id,
        syllabusId: item.syllabusId,
        type: item.type,
        title: item.title,
        description: item.description,
        required: item.required,
        sequenceOrder: item.sequenceOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });
  }

  /**
   * PATCH /api/v1/syllabus-items/:id (SUPERVISOR only)
   */
  async updateItem(
    itemId: string,
    dto: UpdateSyllabusItemDto,
    user: AuthUser,
  ): Promise<SyllabusItemDto> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can update syllabus items',
      });
    }

    const parseResult = UpdateSyllabusItemSchema.safeParse(dto);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
    }

    const [existingItem] = await this.db
      .select()
      .from(syllabusItems)
      .where(eq(syllabusItems.id, itemId))
      .limit(1);

    if (!existingItem) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Syllabus item with id ${itemId} not found`,
      });
    }

    const data = parseResult.data;

    return await this.db.transaction(async (tx: any) => {
      // Duplicate sequenceOrder check if sequenceOrder changed
      if (
        data.sequenceOrder !== undefined &&
        data.sequenceOrder !== existingItem.sequenceOrder
      ) {
        const [dupSeq] = await tx
          .select()
          .from(syllabusItems)
          .where(
            and(
              eq(syllabusItems.syllabusId, existingItem.syllabusId),
              eq(syllabusItems.sequenceOrder, data.sequenceOrder),
            ),
          )
          .limit(1);

        if (dupSeq) {
          throw new BadRequestException({
            code: 'INVALID_INPUT',
            message: `Sequence order ${data.sequenceOrder} is already in use for this syllabus`,
          });
        }
      }

      const [updated] = await tx
        .update(syllabusItems)
        .set({
          type: data.type !== undefined ? data.type : existingItem.type,
          title: data.title !== undefined ? data.title : existingItem.title,
          description:
            data.description !== undefined ? data.description : existingItem.description,
          required:
            data.required !== undefined ? data.required : existingItem.required,
          sequenceOrder:
            data.sequenceOrder !== undefined
              ? data.sequenceOrder
              : existingItem.sequenceOrder,
          updatedAt: new Date(),
        })
        .where(eq(syllabusItems.id, itemId))
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_SYLLABUS_ITEM',
        entityType: 'SYLLABUS_ITEM',
        entityId: itemId,
        metadata: {
          syllabusId: existingItem.syllabusId,
          type: updated.type,
          title: updated.title,
          sequenceOrder: updated.sequenceOrder,
        },
      });

      return {
        id: updated.id,
        syllabusId: updated.syllabusId,
        type: updated.type,
        title: updated.title,
        description: updated.description,
        required: updated.required,
        sequenceOrder: updated.sequenceOrder,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    });
  }

  /**
   * DELETE /api/v1/syllabus-items/:id (SUPERVISOR only)
   */
  async deleteItem(
    itemId: string,
    user: AuthUser,
  ): Promise<{ id: string; deleted: boolean }> {
    const isSupervisor = user.roles.includes('SUPERVISOR');
    if (!isSupervisor) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_RESOURCE',
        message: 'Only supervisors can delete syllabus items',
      });
    }

    const [existingItem] = await this.db
      .select()
      .from(syllabusItems)
      .where(eq(syllabusItems.id, itemId))
      .limit(1);

    if (!existingItem) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Syllabus item with id ${itemId} not found`,
      });
    }

    return await this.db.transaction(async (tx: any) => {
      await tx
        .delete(syllabusItems)
        .where(eq(syllabusItems.id, itemId));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'DELETE_SYLLABUS_ITEM',
        entityType: 'SYLLABUS_ITEM',
        entityId: itemId,
        metadata: {
          syllabusId: existingItem.syllabusId,
          title: existingItem.title,
          sequenceOrder: existingItem.sequenceOrder,
        },
      });

      return {
        id: itemId,
        deleted: true,
      };
    });
  }
}
