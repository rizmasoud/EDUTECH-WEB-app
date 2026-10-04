/**
 * Substitution Requests and Responses Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 31, 32)
 */

import {
  pgTable,
  uuid,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import {
  substitutionRequestStatusEnum,
  substitutionResponseTypeEnum,
} from './enums';
import { classSessions } from './classes.schema';
import { accounts } from './auth.schema';
import { teachers } from './teachers.schema';

export const substitutionRequests = pgTable(
  'substitution_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'restrict' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: substitutionRequestStatusEnum('status')
      .default('REQUESTED')
      .notNull(),
    approvedTeacherId: uuid('approved_teacher_id').references(
      () => teachers.id,
      { onDelete: 'set null' },
    ),
    approvedBy: uuid('approved_by').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('substitution_requests_class_session_id_idx').on(
      table.classSessionId,
    ),
    index('substitution_requests_status_idx').on(table.status),
  ],
);

export const substitutionResponses = pgTable(
  'substitution_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => substitutionRequests.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    response: substitutionResponseTypeEnum('response').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('substitution_responses_request_teacher_unique').on(
      table.requestId,
      table.teacherId,
    ),
  ],
);
