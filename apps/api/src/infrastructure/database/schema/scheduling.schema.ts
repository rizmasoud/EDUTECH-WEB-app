import { pgTable, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { schedulingProposalStatusEnum } from './enums';
import { academicTerms } from './academics.schema';
import { accounts } from './auth.schema';
import type { SchedulingProposalDataDto } from '@edutech/shared';

export const schedulingProposals = pgTable(
  'scheduling_proposals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicTermId: uuid('academic_term_id').references(() => academicTerms.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    status: schedulingProposalStatusEnum('status').default('PENDING_REVIEW').notNull(),
    data: jsonb('data').$type<SchedulingProposalDataDto>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('scheduling_proposals_academic_term_id_idx').on(table.academicTermId),
    index('scheduling_proposals_status_idx').on(table.status),
    index('scheduling_proposals_created_by_idx').on(table.createdBy),
  ],
);
