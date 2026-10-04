/**
 * Drizzle ORM Relations Schema
 *
 * Source of Truth: /Docs/database/database-specification.md
 * Phase 1: Domain & Database Foundation
 */

import { relations } from 'drizzle-orm';
import { accounts, roles, accountRoles, sessions } from './auth.schema';
import { teachers, teacherSkills } from './teachers.schema';
import { students } from './students.schema';
import {
  books,
  bookParts,
  bookSegments,
  academicTerms,
  syllabi,
  syllabusItems,
} from './academics.schema';
import { classes, enrollments, schedules, classSessions } from './classes.schema';
import {
  attendanceRecords,
  teacherAttendanceRecords,
} from './attendance.schema';
import {
  lessonPlans,
  lessonPlanItems,
  exams,
  examResults,
  promotions,
} from './education.schema';
import {
  substitutionRequests,
  substitutionResponses,
} from './substitutions.schema';
import { payrolls, payrollItems } from './payroll.schema';
import { tickets, ticketMessages, attachments } from './support.schema';
import { importJobs, importResults } from './imports.schema';
import { notifications, auditLogs } from './system.schema';

export const accountsRelations = relations(accounts, ({ many, one }) => ({
  accountRoles: many(accountRoles),
  teacher: one(teachers, {
    fields: [accounts.id],
    references: [teachers.accountId],
  }),
  sessions: many(sessions),
  notifications: many(notifications),
  ticketsCreated: many(tickets, { relationName: 'tickets_created' }),
  ticketsAssigned: many(tickets, { relationName: 'tickets_assigned' }),
  ticketMessages: many(ticketMessages),
  auditLogs: many(auditLogs),
  importJobs: many(importJobs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  account: one(accounts, {
    fields: [sessions.accountId],
    references: [accounts.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  accountRoles: many(accountRoles),
}));

export const accountRolesRelations = relations(accountRoles, ({ one }) => ({
  account: one(accounts, {
    fields: [accountRoles.accountId],
    references: [accounts.id],
  }),
  role: one(roles, {
    fields: [accountRoles.roleId],
    references: [roles.id],
  }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  account: one(accounts, {
    fields: [teachers.accountId],
    references: [accounts.id],
  }),
  teacherSkills: many(teacherSkills),
  classes: many(classes),
  lessonPlans: many(lessonPlans),
  teacherAttendanceRecords: many(teacherAttendanceRecords),
  payrolls: many(payrolls),
  substitutionResponses: many(substitutionResponses),
}));

export const teacherSkillsRelations = relations(teacherSkills, ({ one }) => ({
  teacher: one(teachers, {
    fields: [teacherSkills.teacherId],
    references: [teachers.id],
  }),
  book: one(books, {
    fields: [teacherSkills.bookId],
    references: [books.id],
  }),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  enrollments: many(enrollments),
  attendanceRecords: many(attendanceRecords),
  examResults: many(examResults),
  promotions: many(promotions),
}));

export const booksRelations = relations(books, ({ many }) => ({
  bookParts: many(bookParts),
  syllabi: many(syllabi),
  classes: many(classes),
  teacherSkills: many(teacherSkills),
}));

export const bookPartsRelations = relations(bookParts, ({ one, many }) => ({
  book: one(books, {
    fields: [bookParts.bookId],
    references: [books.id],
  }),
  bookSegments: many(bookSegments),
}));

export const bookSegmentsRelations = relations(bookSegments, ({ one, many }) => ({
  bookPart: one(bookParts, {
    fields: [bookSegments.bookPartId],
    references: [bookParts.id],
  }),
  classes: many(classes),
  syllabi: many(syllabi),
}));

export const academicTermsRelations = relations(academicTerms, ({ many }) => ({
  classes: many(classes),
  payrolls: many(payrolls),
}));

export const syllabiRelations = relations(syllabi, ({ one, many }) => ({
  book: one(books, {
    fields: [syllabi.bookId],
    references: [books.id],
  }),
  bookSegment: one(bookSegments, {
    fields: [syllabi.bookSegmentId],
    references: [bookSegments.id],
  }),
  syllabusItems: many(syllabusItems),
}));

export const syllabusItemsRelations = relations(syllabusItems, ({ one, many }) => ({
  syllabus: one(syllabi, {
    fields: [syllabusItems.syllabusId],
    references: [syllabi.id],
  }),
  lessonPlanItems: many(lessonPlanItems),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  academicTerm: one(academicTerms, {
    fields: [classes.academicTermId],
    references: [academicTerms.id],
  }),
  book: one(books, {
    fields: [classes.bookId],
    references: [books.id],
  }),
  bookSegment: one(bookSegments, {
    fields: [classes.bookSegmentId],
    references: [bookSegments.id],
  }),
  teacher: one(teachers, {
    fields: [classes.teacherId],
    references: [teachers.id],
  }),
  enrollments: many(enrollments),
  schedules: many(schedules),
  classSessions: many(classSessions),
  lessonPlans: many(lessonPlans),
  exams: many(exams),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
  student: one(students, {
    fields: [enrollments.studentId],
    references: [students.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  class: one(classes, {
    fields: [schedules.classId],
    references: [classes.id],
  }),
  classSessions: many(classSessions),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  class: one(classes, {
    fields: [classSessions.classId],
    references: [classes.id],
  }),
  schedule: one(schedules, {
    fields: [classSessions.scheduleId],
    references: [schedules.id],
  }),
  attendanceRecords: many(attendanceRecords),
  teacherAttendanceRecords: many(teacherAttendanceRecords),
  substitutionRequests: many(substitutionRequests),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  classSession: one(classSessions, {
    fields: [attendanceRecords.classSessionId],
    references: [classSessions.id],
  }),
  student: one(students, {
    fields: [attendanceRecords.studentId],
    references: [students.id],
  }),
  recorder: one(accounts, {
    fields: [attendanceRecords.recordedBy],
    references: [accounts.id],
  }),
}));

export const teacherAttendanceRecordsRelations = relations(
  teacherAttendanceRecords,
  ({ one }) => ({
    classSession: one(classSessions, {
      fields: [teacherAttendanceRecords.classSessionId],
      references: [classSessions.id],
    }),
    teacher: one(teachers, {
      fields: [teacherAttendanceRecords.teacherId],
      references: [teachers.id],
    }),
    recorder: one(accounts, {
      fields: [teacherAttendanceRecords.recordedBy],
      references: [accounts.id],
    }),
  }),
);

export const lessonPlansRelations = relations(lessonPlans, ({ one, many }) => ({
  class: one(classes, {
    fields: [lessonPlans.classId],
    references: [classes.id],
  }),
  teacher: one(teachers, {
    fields: [lessonPlans.teacherId],
    references: [teachers.id],
  }),
  items: many(lessonPlanItems),
}));

export const lessonPlanItemsRelations = relations(lessonPlanItems, ({ one }) => ({
  lessonPlan: one(lessonPlans, {
    fields: [lessonPlanItems.lessonPlanId],
    references: [lessonPlans.id],
  }),
  syllabusItem: one(syllabusItems, {
    fields: [lessonPlanItems.syllabusItemId],
    references: [syllabusItems.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  class: one(classes, {
    fields: [exams.classId],
    references: [classes.id],
  }),
  results: many(examResults),
}));

export const examResultsRelations = relations(examResults, ({ one, many }) => ({
  exam: one(exams, {
    fields: [examResults.examId],
    references: [exams.id],
  }),
  student: one(students, {
    fields: [examResults.studentId],
    references: [students.id],
  }),
  promotions: many(promotions),
}));

export const promotionsRelations = relations(promotions, ({ one }) => ({
  student: one(students, {
    fields: [promotions.studentId],
    references: [students.id],
  }),
  fromBook: one(books, {
    fields: [promotions.fromBookId],
    references: [books.id],
    relationName: 'promotion_from_book',
  }),
  toBook: one(books, {
    fields: [promotions.toBookId],
    references: [books.id],
    relationName: 'promotion_to_book',
  }),
  examResult: one(examResults, {
    fields: [promotions.examResultId],
    references: [examResults.id],
  }),
  decider: one(accounts, {
    fields: [promotions.decidedBy],
    references: [accounts.id],
  }),
}));

export const substitutionRequestsRelations = relations(
  substitutionRequests,
  ({ one, many }) => ({
    classSession: one(classSessions, {
      fields: [substitutionRequests.classSessionId],
      references: [classSessions.id],
    }),
    requester: one(accounts, {
      fields: [substitutionRequests.requestedBy],
      references: [accounts.id],
      relationName: 'sub_requester',
    }),
    approvedTeacher: one(teachers, {
      fields: [substitutionRequests.approvedTeacherId],
      references: [teachers.id],
    }),
    approver: one(accounts, {
      fields: [substitutionRequests.approvedBy],
      references: [accounts.id],
      relationName: 'sub_approver',
    }),
    responses: many(substitutionResponses),
  }),
);

export const substitutionResponsesRelations = relations(
  substitutionResponses,
  ({ one }) => ({
    request: one(substitutionRequests, {
      fields: [substitutionResponses.requestId],
      references: [substitutionRequests.id],
    }),
    teacher: one(teachers, {
      fields: [substitutionResponses.teacherId],
      references: [teachers.id],
    }),
  }),
);

export const payrollsRelations = relations(payrolls, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [payrolls.teacherId],
    references: [teachers.id],
  }),
  academicTerm: one(academicTerms, {
    fields: [payrolls.academicTermId],
    references: [academicTerms.id],
  }),
  items: many(payrollItems),
}));

export const payrollItemsRelations = relations(payrollItems, ({ one }) => ({
  payroll: one(payrolls, {
    fields: [payrollItems.payrollId],
    references: [payrolls.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  creator: one(accounts, {
    fields: [tickets.createdBy],
    references: [accounts.id],
    relationName: 'tickets_created',
  }),
  assignee: one(accounts, {
    fields: [tickets.assignedTo],
    references: [accounts.id],
    relationName: 'tickets_assigned',
  }),
  messages: many(ticketMessages),
  attachments: many(attachments),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
  author: one(accounts, {
    fields: [ticketMessages.authorId],
    references: [accounts.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [attachments.ticketId],
    references: [tickets.id],
  }),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  creator: one(accounts, {
    fields: [importJobs.createdBy],
    references: [accounts.id],
  }),
  results: many(importResults),
}));

export const importResultsRelations = relations(importResults, ({ one }) => ({
  importJob: one(importJobs, {
    fields: [importResults.importJobId],
    references: [importJobs.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(accounts, {
    fields: [notifications.recipientAccountId],
    references: [accounts.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(accounts, {
    fields: [auditLogs.actorAccountId],
    references: [accounts.id],
  }),
}));
