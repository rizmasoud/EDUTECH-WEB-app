/**
 * Payroll and Payroll Items Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 33, 34)
 */

import {
  pgTable,
  uuid,
  numeric,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { payrollStatusEnum, payrollItemTypeEnum } from './enums';
import { teachers } from './teachers.schema';
import { academicTerms } from './academics.schema';

export const payrolls = pgTable(
  'payrolls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    academicTermId: uuid('academic_term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'restrict' }),
    status: payrollStatusEnum('status').default('DRAFT').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payrolls_teacher_id_idx').on(table.teacherId),
    index('payrolls_academic_term_id_idx').on(table.academicTermId),
    unique('payrolls_teacher_id_academic_term_id_unique').on(table.teacherId, table.academicTermId),
  ],
);

export const payrollItems = pgTable(
  'payroll_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    payrollId: uuid('payroll_id')
      .notNull()
      .references(() => payrolls.id, { onDelete: 'cascade' }),
    type: payrollItemTypeEnum('type').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
    rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    referenceId: uuid('reference_id'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payroll_items_payroll_id_idx').on(table.payrollId),
  ],
);
