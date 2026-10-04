/**
 * Academic Foundation Schema
 * Books, Book Parts, Book Segments, Academic Terms, Syllabi, Syllabus Items
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 12, 13, 14, 15, 24, 25)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  date,
  timestamp,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { academicTermStatusEnum, syllabusItemTypeEnum } from './enums';

export const books = pgTable(
  'books',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    level: varchar('level', { length: 64 }).notNull(),
    sequenceOrder: integer('sequence_order').notNull(),
    sessionCount: integer('session_count').notNull(),
    isTerminal: boolean('is_terminal').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('books_sequence_order_idx').on(table.sequenceOrder),
    index('books_is_active_idx').on(table.isActive),
    index('books_name_idx').on(table.name),
  ],
);

export const bookParts = pgTable(
  'book_parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    sequenceOrder: integer('sequence_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('book_parts_book_id_idx').on(table.bookId),
    index('book_parts_sequence_order_idx').on(table.sequenceOrder),
    unique('book_parts_book_sequence_unique').on(table.bookId, table.sequenceOrder),
  ],
);

export const bookSegments = pgTable(
  'book_segments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookPartId: uuid('book_part_id')
      .notNull()
      .references(() => bookParts.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 255 }).notNull(),
    sequenceOrder: integer('sequence_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('book_segments_book_part_id_idx').on(table.bookPartId),
    index('book_segments_sequence_order_idx').on(table.sequenceOrder),
    unique('book_segments_part_sequence_unique').on(table.bookPartId, table.sequenceOrder),
  ],
);

export const academicTerms = pgTable(
  'academic_terms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    status: academicTermStatusEnum('status').default('PLANNED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('academic_terms_dates_check', sql`${table.startDate} < ${table.endDate}`),
    index('academic_terms_status_idx').on(table.status),
    index('academic_terms_start_date_idx').on(table.startDate),
  ],
);

export const syllabi = pgTable('syllabi', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'restrict' }),
  bookSegmentId: uuid('book_segment_id').references(() => bookSegments.id, {
    onDelete: 'restrict',
  }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const syllabusItems = pgTable('syllabus_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  syllabusId: uuid('syllabus_id')
    .notNull()
    .references(() => syllabi.id, { onDelete: 'cascade' }),
  type: syllabusItemTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  required: boolean('required').default(true).notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});
