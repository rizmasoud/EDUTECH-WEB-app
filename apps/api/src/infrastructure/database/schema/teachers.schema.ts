/**
 * Teachers and Teacher Skills Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 9, 19)
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  numeric,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { accounts } from './auth.schema';
import { books } from './academics.schema';

export const teachers = pgTable('teachers', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .unique()
    .references(() => accounts.id, { onDelete: 'set null' }),
  firstName: varchar('first_name', { length: 128 }).notNull(),
  lastName: varchar('last_name', { length: 128 }).notNull(),
  baseRate: numeric('base_rate', { precision: 12, scale: 2 })
    .default('0')
    .notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const teacherSkills = pgTable(
  'teacher_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('teacher_skills_teacher_book_unique').on(
      table.teacherId,
      table.bookId,
    ),
  ],
);
