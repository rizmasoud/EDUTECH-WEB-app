/**
 * Classes, Enrollments, Schedules, and Class Sessions Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 16, 17, 18, 20, 21)
 */

import {
  pgTable,
  uuid,
  integer,
  time,
  date,
  timestamp,
  check,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  classTypeEnum,
  classStatusEnum,
  enrollmentStatusEnum,
  classSessionStatusEnum,
} from './enums';
import { academicTerms, books, bookSegments } from './academics.schema';
import { teachers } from './teachers.schema';
import { students } from './students.schema';

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicTermId: uuid('academic_term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'restrict' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'restrict' }),
    bookSegmentId: uuid('book_segment_id').references(() => bookSegments.id, {
      onDelete: 'restrict',
    }),
    teacherId: uuid('teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    classType: classTypeEnum('class_type').default('REGULAR').notNull(),
    status: classStatusEnum('status').default('DRAFT').notNull(),
    capacity: integer('capacity').default(12).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'classes_capacity_check',
      sql`${table.capacity} > 0 AND ${table.capacity} <= 15`,
    ),
    index('classes_academic_term_id_idx').on(table.academicTermId),
    index('classes_book_id_idx').on(table.bookId),
    index('classes_teacher_id_idx').on(table.teacherId),
    index('classes_status_idx').on(table.status),
    index('classes_class_type_idx').on(table.classType),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: enrollmentStatusEnum('status').default('ACTIVE').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('enrollments_class_student_unique').on(
      table.classId,
      table.studentId,
    ),
    index('enrollments_student_id_idx').on(table.studentId),
    index('enrollments_class_id_idx').on(table.classId),
    index('enrollments_status_idx').on(table.status),
  ],
);

export const schedules = pgTable(
  'schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('schedules_time_check', sql`${table.startTime} < ${table.endTime}`),
    index('schedules_class_id_idx').on(table.classId),
  ],
);

export const classSessions = pgTable(
  'class_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    scheduleId: uuid('schedule_id').references(() => schedules.id, {
      onDelete: 'set null',
    }),
    sessionDate: date('session_date', { mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    status: classSessionStatusEnum('status').default('SCHEDULED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('class_sessions_class_schedule_date_unique').on(
      table.classId,
      table.scheduleId,
      table.sessionDate,
    ),
    index('class_sessions_class_id_idx').on(table.classId),
    index('class_sessions_session_date_idx').on(table.sessionDate),
  ],
);
