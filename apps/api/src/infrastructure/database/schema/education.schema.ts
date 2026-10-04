/**
 * Educational Workflows Schema
 * Lesson Plans, Lesson Plan Items, Exams, Exam Results, Promotions
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 26, 27, 28, 29, 30)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  date,
  timestamp,
  check,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  lessonPlanStatusEnum,
  examTypeEnum,
  promotionStatusEnum,
  promotionDecisionEnum,
} from './enums';
import { classes } from './classes.schema';
import { teachers } from './teachers.schema';
import { syllabusItems, books } from './academics.schema';
import { students } from './students.schema';
import { accounts } from './auth.schema';

export const lessonPlans = pgTable(
  'lesson_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    status: lessonPlanStatusEnum('status').default('DRAFT').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('lesson_plans_class_id_idx').on(table.classId),
    index('lesson_plans_teacher_id_idx').on(table.teacherId),
  ],
);

export const lessonPlanItems = pgTable('lesson_plan_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  lessonPlanId: uuid('lesson_plan_id')
    .notNull()
    .references(() => lessonPlans.id, { onDelete: 'cascade' }),
  syllabusItemId: uuid('syllabus_item_id').references(
    () => syllabusItems.id,
    { onDelete: 'set null' },
  ),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  completed: boolean('completed').default(false).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const exams = pgTable(
  'exams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    examDate: date('exam_date', { mode: 'string' }).notNull(),
    type: examTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('exams_class_id_idx').on(table.classId),
  ],
);

export const examResults = pgTable(
  'exam_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('exam_results_exam_student_unique').on(table.examId, table.studentId),
    check(
      'exam_results_score_range_check',
      sql`${table.score} >= 0 AND ${table.score} <= 100`,
    ),
    index('exam_results_exam_id_idx').on(table.examId),
    index('exam_results_student_id_idx').on(table.studentId),
  ],
);

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    fromBookId: uuid('from_book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'restrict' }),
    toBookId: uuid('to_book_id').references(() => books.id, {
      onDelete: 'restrict',
    }),
    examResultId: uuid('exam_result_id')
      .notNull()
      .references(() => examResults.id, { onDelete: 'restrict' }),
    status: promotionStatusEnum('status').notNull(),
    decision: promotionDecisionEnum('decision'),
    decidedBy: uuid('decided_by').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('promotions_student_id_idx').on(table.studentId),
    index('promotions_exam_result_id_idx').on(table.examResultId),
  ],
);
