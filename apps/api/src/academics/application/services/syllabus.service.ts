import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../../infrastructure/database/drizzle.provider';
import {
  books,
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
   * The Book is the only scope of a canonical Syllabus. Parts and Segments are never consulted here.
   */
  private async validateBook(bookId: string) {
    const [book] = await this.db.select().from(books).where(eq(books.id, bookId)).limit(1);

    if (!book) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Book with id ${bookId} not found`,
      });
    }
  }

  private duplicateBookError(bookId: string) {
    return new ConflictException({
      code: 'CONFLICT',
      message: `Book ${bookId} already has a syllabus. Each book has exactly one syllabus.`,
    });
  }

  private isUniqueViolation(err: any): boolean {
    return err?.code === '23505' || err?.cause?.code === '23505';
  }

  private toDetail(s: any): Omit<SyllabusDetailDto, 'items'> {
    return {
      id: s.id,
      bookId: s.bookId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      book: {
        id: s.bookId,
        name: s.bookName,
        level: s.bookLevel,
      },
    };
  }

  /**
   * GET /api/v1/syllabi
   * Filters by book only; any segment/part filter is ignored (stripped by the schema).
   */
  async findAll(filter?: FindSyllabiFilterDto): Promise<SyllabusDetailDto[]> {
    const parseResult = FindSyllabiFilterSchema.safeParse(filter || {});
    const queryFilter = parseResult.success ? parseResult.data : {};

    const whereClause = queryFilter.bookId ? eq(syllabi.bookId, queryFilter.bookId) : undefined;

    const list = await this.db
      .select({
        id: syllabi.id,
        bookId: syllabi.bookId,
        createdAt: syllabi.createdAt,
        updatedAt: syllabi.updatedAt,
        bookName: books.name,
        bookLevel: books.level,
      })
      .from(syllabi)
      .innerJoin(books, eq(syllabi.bookId, books.id))
      .where(whereClause);

    return list.map((s: any) => this.toDetail(s));
  }

  /**
   * GET /api/v1/syllabi/:id
   */
  async findOne(id: string): Promise<SyllabusDetailDto> {
    const [s] = await this.db
      .select({
        id: syllabi.id,
        bookId: syllabi.bookId,
        createdAt: syllabi.createdAt,
        updatedAt: syllabi.updatedAt,
        bookName: books.name,
        bookLevel: books.level,
      })
      .from(syllabi)
      .innerJoin(books, eq(syllabi.bookId, books.id))
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
   * Creates the Book's one canonical Syllabus; 409 if it already has one.
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
    await this.validateBook(data.bookId);

    const [existing] = await this.db
      .select({ id: syllabi.id })
      .from(syllabi)
      .where(eq(syllabi.bookId, data.bookId))
      .limit(1);
    if (existing) throw this.duplicateBookError(data.bookId);

    let createdId: string;
    try {
      createdId = await this.db.transaction(async (tx: any) => {
        // book_segment_id is deliberately not written: new Syllabi are Book-scoped only.
        const [created] = await tx.insert(syllabi).values({ bookId: data.bookId }).returning();

        await tx.insert(auditLogs).values({
          actorAccountId: user.id,
          action: 'CREATE_SYLLABUS',
          entityType: 'SYLLABUS',
          entityId: created.id,
          metadata: { bookId: data.bookId },
        });

        return created.id;
      });
    } catch (err) {
      // A concurrent request created the Syllabus between the check above and the insert.
      if (this.isUniqueViolation(err)) throw this.duplicateBookError(data.bookId);
      throw err;
    }

    return this.findOne(createdId);
  }

  /**
   * PATCH /api/v1/syllabi/:id (SUPERVISOR only)
   * A canonical Syllabus cannot move to another Book (that would give one of the Books two or none), so the
   * only accepted bookId is the current one; the Syllabus is otherwise left as is apart from `updatedAt`.
   * Segment/part fields are ignored and the stored legacy `book_segment_id` is never touched.
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

    if (data.bookId && data.bookId !== existing.bookId) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'A syllabus belongs to one book and cannot be moved to another book',
      });
    }

    await this.db.transaction(async (tx: any) => {
      await tx.update(syllabi).set({ updatedAt: new Date() }).where(eq(syllabi.id, id));

      await tx.insert(auditLogs).values({
        actorAccountId: user.id,
        action: 'UPDATE_SYLLABUS',
        entityType: 'SYLLABUS',
        entityId: id,
        metadata: { bookId: existing.bookId },
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
