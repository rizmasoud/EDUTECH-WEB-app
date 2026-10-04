/**
 * Excel Import Jobs and Results Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 38, 39)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { importStatusEnum, importResultStatusEnum } from './enums';
import { accounts } from './auth.schema';

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 64 }).notNull(),
    status: importStatusEnum('status').default('PENDING').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('import_jobs_created_by_idx').on(table.createdBy),
    index('import_jobs_status_idx').on(table.status),
  ],
);

export const importResults = pgTable(
  'import_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importJobId: uuid('import_job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    status: importResultStatusEnum('status').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('import_results_import_job_id_idx').on(table.importJobId),
  ],
);
