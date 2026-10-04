/**
 * Student and Teacher Attendance Records Schema
 *
 * Source of Truth: /Docs/database/database-specification.md (Sections 22, 23)
 */

import {
  pgTable,
  uuid,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { attendanceStatusEnum, teacherAttendanceStatusEnum } from './enums';
import { classSessions } from './classes.schema';
import { students } from './students.schema';
import { teachers } from './teachers.schema';
import { accounts } from './auth.schema';

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: attendanceStatusEnum('status').notNull(),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('attendance_records_session_student_unique').on(
      table.classSessionId,
      table.studentId,
    ),
    index('attendance_records_class_session_id_idx').on(table.classSessionId),
    index('attendance_records_student_id_idx').on(table.studentId),
  ],
);

export const teacherAttendanceRecords = pgTable(
  'teacher_attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    status: teacherAttendanceStatusEnum('status').notNull(),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('teacher_attendance_records_session_teacher_unique').on(
      table.classSessionId,
      table.teacherId,
    ),
    index('teacher_attendance_records_class_session_id_idx').on(
      table.classSessionId,
    ),
    index('teacher_attendance_records_teacher_id_idx').on(table.teacherId),
  ],
);
