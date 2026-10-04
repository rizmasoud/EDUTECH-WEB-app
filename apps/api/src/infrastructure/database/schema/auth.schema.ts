/**
 * Accounts and Roles Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 6, 7, 8)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { roleNameEnum } from './enums';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  personnelCode: varchar('personnel_code', { length: 64 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: roleNameEnum('name').notNull().unique(),
});

export const accountRoles = pgTable(
  'account_roles',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.roleId] }),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'date' }),
    userAgent: varchar('user_agent', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 64 }),
  },
  (table) => [
    index('sessions_account_id_idx').on(table.accountId),
    index('sessions_token_hash_idx').on(table.tokenHash),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);
