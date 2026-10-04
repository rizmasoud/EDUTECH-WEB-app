/**
 * Notifications and Audit Logs Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 40, 41)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { accounts } from './auth.schema';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientAccountId: uuid('recipient_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    referenceEntityType: varchar('reference_entity_type', { length: 64 }),
    referenceEntityId: uuid('reference_entity_id'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('notifications_recipient_account_id_idx').on(
      table.recipientAccountId,
    ),
    index('notifications_is_read_idx').on(table.isRead),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 128 }).notNull(),
    entityType: varchar('entity_type', { length: 128 }).notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_entity_type_idx').on(table.entityType),
    index('audit_logs_entity_id_idx').on(table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);
