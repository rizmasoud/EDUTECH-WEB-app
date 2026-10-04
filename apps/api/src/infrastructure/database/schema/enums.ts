/**
 * EduTech Database PostgreSQL Enums
 *
 * Source of Truth: /Docs/database/database-specification.md
 * Phase 1: Domain & Database Foundation
 */

import { pgEnum } from 'drizzle-orm/pg-core';

export const roleNameEnum = pgEnum('role_name', ['SUPERVISOR', 'TEACHER']);

export const academicTermStatusEnum = pgEnum('academic_term_status', [
  'PLANNED',
  'ACTIVE',
  'CLOSED',
]);

export const classTypeEnum = pgEnum('class_type', ['REGULAR', 'PRIVATE']);

export const classStatusEnum = pgEnum('class_status', [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'ACTIVE',
  'COMPLETED',
  'WITHDRAWN',
]);

export const classSessionStatusEnum = pgEnum('class_session_status', [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
]);

export const teacherAttendanceStatusEnum = pgEnum('teacher_attendance_status', [
  'PRESENT',
  'ABSENT',
  'EXCUSED',
]);

export const syllabusItemTypeEnum = pgEnum('syllabus_item_type', [
  'FILM',
  'WORKBOOK',
  'CONVERSATION',
  'GRAMMAR',
  'VOCABULARY',
  'OTHER',
]);

export const lessonPlanStatusEnum = pgEnum('lesson_plan_status', [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
]);

export const examTypeEnum = pgEnum('exam_type', ['FINAL', 'MIDTERM', 'OTHER']);

export const promotionStatusEnum = pgEnum('promotion_status', [
  'AUTOMATIC',
  'PENDING_DECISION',
  'PROMOTED',
  'NOT_PROMOTED',
  'TERMINAL_COMPLETION',
]);

export const promotionDecisionEnum = pgEnum('promotion_decision', [
  'PROMOTE',
  'DO_NOT_PROMOTE',
  'REPEAT',
  'REMEDIAL',
]);

export const substitutionRequestStatusEnum = pgEnum(
  'substitution_request_status',
  [
    'REQUESTED',
    'BROADCASTED',
    'RESPONDED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'COMPLETED',
  ],
);

export const substitutionResponseTypeEnum = pgEnum(
  'substitution_response_type',
  ['ACCEPT', 'DECLINE'],
);

export const payrollStatusEnum = pgEnum('payroll_status', [
  'DRAFT',
  'CALCULATED',
  'REVIEWED',
  'FINALIZED',
]);

export const payrollItemTypeEnum = pgEnum('payroll_item_type', [
  'SESSION',
  'SYLLABUS_COMPLETION',
  'PRIVATE_CLASS',
  'SUBSTITUTION',
  'ADJUSTMENT',
]);

export const ticketTypeEnum = pgEnum('ticket_type', [
  'ATTENDANCE_CORRECTION',
  'CLASS_CORRECTION',
  'LESSON_PLAN_ISSUE',
  'SUBSTITUTION_ISSUE',
  'PAYROLL_ISSUE',
  'STUDENT_DATA_CORRECTION',
  'TEACHER_DATA_CORRECTION',
  'SYSTEM_ISSUE',
  'OTHER',
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
  'CANCELLED',
]);

export const importStatusEnum = pgEnum('import_status', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
]);

export const importResultStatusEnum = pgEnum('import_result_status', [
  'SUCCESS',
  'WARNING',
  'ERROR',
  'SKIPPED',
]);

export const schedulingProposalStatusEnum = pgEnum('scheduling_proposal_status', [
  'DRAFT',
  'PENDING_REVIEW',
  'ACCEPTED',
  'MODIFIED',
  'REJECTED',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'SUBSTITUTION_REQUEST',
  'SUBSTITUTION_APPROVAL',
  'LESSON_PLAN_REVIEW',
  'LESSON_PLAN_RESULT',
  'PROMOTION_DECISION_REQUIRED',
  'PAYROLL_READY',
  'PAYROLL_FINALIZED',
  'IMPORT_COMPLETED',
  'IMPORT_COMPLETED_WITH_ERRORS',
  'SYSTEM_ALERT',
]);
