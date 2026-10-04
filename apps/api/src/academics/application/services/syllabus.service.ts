import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, type SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  books,
  bookParts,
  bookSegments,
  syllabi,
  syllabusItems,
} from '../../../infrastructure/database/schema/academics.schema';
import { auditLogs } from '../../../infrastructure/database/schema/system.schema';
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
   * Helper to verify book and bookSegment validity
   */
  private async validateBookAndSegment(bookId?: string, bookSegmentId?: string | null) {
    if (bookId) {
      const [book] = await this.db
        .select()
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);

      if (!book) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Book with id ${bookId} not found`,
        });
      }
    }

    if (bookSegmentId) {
      const [segment] = await this.db
        .select({
          id: bookSegments.id,
          bookPartId: bookSegments.bookPartId,
          bookId: bookParts.bookId,
        })
        .from(bookSegments)
        .innerJoin(bookParts, eq(bookSegments.bookPartId, bookParts.id))
        .where(eq(bookSegments.id, bookSegmentId))
        .limit(1);

      if (!segment) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Book segment with id ${bookSegmentId} not found`,
        });
      }

      if (bookId && segment.bookId !== bookId) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `Book segment ${bookSegmentId} does not belong to book ${bookId}`,
        });
      }
    }
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
    if (queryFilter.bookSegmentId) {
      conditions.push(eq(syllabi.bookSegmentId, queryFilter.bookSegmentId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await this.db
      .select({
        id: syllabi.id,
        bookId: syllabi.bookId,
        bookSegmentId: syllabi.bookSegmentId,
        createdAt: syllabi.createdAt,
        updatedAt: syllabi.updatedAt,
        bookName: books.name,
        bookLevel: books.level,
        bookSegmentName: bookSegments.name,
      })
      .from(syllabi)
      .innerJoin(books, eq(syllabi.bookId, books.id))
      .leftJoin(bookSegments, eq(syllabi.bookSegmentId, bookSegments.id))
      .where(whereClause);

    return list.map((s: any) => ({
      id: s.id,
      bookId: s.bookId,
      bookSegmentId: s.bookSegmentId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      book: {
        id: s.bookId,
        name: s.bookName,
        level: s.bookLevel,
      },
      bookSegment: s.bookSegmentId
        ? {
            id: s.bookSegmentId,
            name: s.bookSegmentName,
          }
        : null,
    }));
  }

  /**
   * GET /api/v1/syllabi/:id
   */
  async findOne(id: string): Promise<SyllabusDetailDto> {
    const [s] = await this.db
      .select({
        id: syllabi.id,
        bookId: syllabi.bookId,
        bookSegmentId: syllabi.bookSegmentId,
        createdAt: syllabi.createdAt,
        updatedAt: syllabi.updatedAt,
        bookName: books.name,
        bookLevel: books.level,
        bookSegmentName: bookSegments.name,
      })
      .from(syllabi)
      .innerJoin(books, eq(syllabi.bookId, books.id))
      .leftJoin(bookSegments, eq(syllabi.bookSegmentId, bookSegments.id))
      .where(eq(syllabi.id, id))
      .limit(1);

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
      id: s.id,
      bookId: s.bookId,
      bookSegmentId: s.bookSegmentId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      book: {
        id: s.bookId,
        name: s.bookName,
        level: s.bookLevel,
      },
      bookSegment: s.bookSegmentId
        ? {
            id: s.bookSegmentId,
            name: s.bookSegmentName,
          }
        : null,
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
    await this.validateBookAndSegment(data.bookId, data.bookSegmentId);

    const createdId = await this.db.transaction(async (tx: any) => {
      const [created] = await tx
        .insert(syllabi)
        .values({
          bookId: data.bookId,
          bookSegmentId: data.bookSegmentId || null,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'CREATE_SYLLABUS',
        entityType: 'SYLLABUS',
        entityId: created.id,
        metadata: {
          bookId: data.bookId,
          bookSegmentId: data.bookSegmentId || null,
        },
      });

      return created.id;
    });

    return this.findOne(createdId);
  }

  /**
   * PATCH /api/v1/syllabi/:id (SUPERVISOR only)
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
    const targetSegmentId =
      data.bookSegmentId !== undefined ? data.bookSegmentId : existing.bookSegmentId;

    await this.validateBookAndSegment(targetBookId, targetSegmentId);

    await this.db.transaction(async (tx: any) => {
      await tx
        .update(syllabi)
        .set({
          bookId: targetBookId,
          bookSegmentId: targetSegmentId || null,
          updatedAt: new Date(),
        })
        .where(eq(syllabi.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_SYLLABUS',
        entityType: 'SYLLABUS',
        entityId: id,
        metadata: {
          bookId: targetBookId,
          bookSegmentId: targetSegmentId || null,
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
