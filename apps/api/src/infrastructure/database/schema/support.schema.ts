/**
 * Support Tickets, Messages, and Attachments Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 35, 36, 37)
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
import { ticketTypeEnum, ticketStatusEnum } from './enums';
import { accounts } from './auth.schema';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    assignedTo: uuid('assigned_to').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    type: ticketTypeEnum('type').notNull(),
    status: ticketStatusEnum('status').default('OPEN').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('tickets_created_by_idx').on(table.createdBy),
    index('tickets_assigned_to_idx').on(table.assignedTo),
    index('tickets_status_idx').on(table.status),
  ],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ticket_messages_ticket_id_idx').on(table.ticketId),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    size: integer('size').notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('attachments_ticket_id_idx').on(table.ticketId),
  ],
);
