/**
 * EduTech Domain Contracts & Zod Schemas
 *
 * Source of Truth: /Docs/database/database-specification.md
 * Phase 1: Domain & Database Foundation
 */

import { z } from 'zod';
import {
  RoleName,
  AcademicTermStatus,
  ClassType,
  ClassStatus,
  EnrollmentStatus,
  ClassSessionStatus,
  AttendanceStatus,
  TeacherAttendanceStatus,
  SyllabusItemType,
  LessonPlanStatus,
  ExamType,
  AssessmentStatus,
  PromotionStatus,
  PromotionDecision,
  SubstitutionRequestStatus,
  SubstitutionResponseType,
  PayrollStatus,
  PayrollItemType,
  TicketType,
  TicketStatus,
  ImportStatus,
  ImportResultStatus,
  NotificationType,
} from '../types/domain.types';

// ==========================================
// Zod Enum Schemas
// ==========================================

export const RoleNameSchema = z.nativeEnum(RoleName);
export const AcademicTermStatusSchema = z.nativeEnum(AcademicTermStatus);
export const ClassTypeSchema = z.nativeEnum(ClassType);
export const ClassStatusSchema = z.nativeEnum(ClassStatus);
export const EnrollmentStatusSchema = z.nativeEnum(EnrollmentStatus);
export const ClassSessionStatusSchema = z.nativeEnum(ClassSessionStatus);
export const AttendanceStatusSchema = z.nativeEnum(AttendanceStatus);
export const TeacherAttendanceStatusSchema = z.nativeEnum(TeacherAttendanceStatus);
export const SyllabusItemTypeSchema = z.nativeEnum(SyllabusItemType);
export const LessonPlanStatusSchema = z.nativeEnum(LessonPlanStatus);
export const ExamTypeSchema = z.nativeEnum(ExamType);
export const AssessmentStatusSchema = z.nativeEnum(AssessmentStatus);
export const PromotionStatusSchema = z.nativeEnum(PromotionStatus);
export const PromotionDecisionSchema = z.nativeEnum(PromotionDecision);
export const SubstitutionRequestStatusSchema = z.nativeEnum(SubstitutionRequestStatus);
export const SubstitutionResponseTypeSchema = z.nativeEnum(SubstitutionResponseType);
export const PayrollStatusSchema = z.nativeEnum(PayrollStatus);
export const PayrollItemTypeSchema = z.nativeEnum(PayrollItemType);
export const TicketTypeSchema = z.nativeEnum(TicketType);
export const TicketStatusSchema = z.nativeEnum(TicketStatus);
export const ImportStatusSchema = z.nativeEnum(ImportStatus);
export const ImportResultStatusSchema = z.nativeEnum(ImportResultStatus);
export const NotificationTypeSchema = z.nativeEnum(NotificationType);

// ==========================================
// Zod Entity Schemas
// ==========================================

export const AccountSchema = z.object({
  id: z.string().uuid(),
  personnelCode: z.string().min(1),
  passwordHash: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const RoleSchema = z.object({
  id: z.string().uuid(),
  name: RoleNameSchema,
});

export const AccountRoleSchema = z.object({
  accountId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const TeacherSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  baseRate: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const StudentSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  shahvarCode: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const InstituteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const BookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  level: z.string().min(1),
  sequenceOrder: z.number().int(),
  sessionCount: z.number().int().positive(),
  isTerminal: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const BookPartSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  name: z.string().min(1),
  sequenceOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const BookSegmentSchema = z.object({
  id: z.string().uuid(),
  bookPartId: z.string().uuid(),
  name: z.string().min(1),
  sequenceOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const AcademicTermSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  status: AcademicTermStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ClassSchema = z.object({
  id: z.string().uuid(),
  academicTermId: z.string().uuid(),
  bookId: z.string().uuid(),
  bookSegmentId: z.string().uuid().nullable(),
  teacherId: z.string().uuid().nullable(),
  classType: ClassTypeSchema,
  status: ClassStatusSchema,
  capacity: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EnrollmentSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: EnrollmentStatusSchema,
  joinedAt: z.date(),
  leftAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TeacherSkillSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  bookId: z.string().uuid(),
  createdAt: z.date(),
});

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ClassSessionSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
  sessionDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: ClassSessionStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const AttendanceRecordSchema = z.object({
  id: z.string().uuid(),
  classSessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: AttendanceStatusSchema,
  recordedBy: z.string().uuid(),
  recordedAt: z.date(),
  updatedAt: z.date(),
});

export const TeacherAttendanceRecordSchema = z.object({
  id: z.string().uuid(),
  classSessionId: z.string().uuid(),
  teacherId: z.string().uuid(),
  status: TeacherAttendanceStatusSchema,
  recordedBy: z.string().uuid(),
  recordedAt: z.date(),
  updatedAt: z.date(),
});

export const SyllabusSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  bookSegmentId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SyllabusItemSchema = z.object({
  id: z.string().uuid(),
  syllabusId: z.string().uuid(),
  type: SyllabusItemTypeSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  required: z.boolean(),
  sequenceOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const LessonPlanSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  teacherId: z.string().uuid(),
  status: LessonPlanStatusSchema,
  submittedAt: z.date().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const LessonPlanItemSchema = z.object({
  id: z.string().uuid(),
  lessonPlanId: z.string().uuid(),
  syllabusItemId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  completed: z.boolean(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ExamSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  examDate: z.string(),
  type: ExamTypeSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ExamResultSchema = z.object({
  id: z.string().uuid(),
  examId: z.string().uuid(),
  studentId: z.string().uuid(),
  score: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PromotionSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  fromBookId: z.string().uuid(),
  toBookId: z.string().uuid().nullable(),
  examResultId: z.string().uuid(),
  status: PromotionStatusSchema,
  decision: PromotionDecisionSchema.nullable(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SubstitutionRequestSchema = z.object({
  id: z.string().uuid(),
  classSessionId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  status: SubstitutionRequestStatusSchema,
  approvedTeacherId: z.string().uuid().nullable(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SubstitutionResponseSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  teacherId: z.string().uuid(),
  response: SubstitutionResponseTypeSchema,
  respondedAt: z.date(),
});

export const PayrollSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  status: PayrollStatusSchema,
  totalAmount: z.string(),
  finalizedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PayrollItemSchema = z.object({
  id: z.string().uuid(),
  payrollId: z.string().uuid(),
  type: PayrollItemTypeSchema,
  quantity: z.string(),
  rate: z.string(),
  amount: z.string(),
  referenceId: z.string().uuid().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
});

export const TicketSchema = z.object({
  id: z.string().uuid(),
  createdBy: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  type: TicketTypeSchema,
  status: TicketStatusSchema,
  title: z.string().min(1),
  description: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().nullable(),
});

export const TicketMessageSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  authorId: z.string().uuid(),
  body: z.string().min(1),
  createdAt: z.date(),
});

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  createdAt: z.date(),
});

export const ImportJobSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  status: ImportStatusSchema,
  fileName: z.string().min(1),
  createdBy: z.string().uuid(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
});

export const ImportResultSchema = z.object({
  id: z.string().uuid(),
  importJobId: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  status: ImportResultStatusSchema,
  message: z.string(),
  createdAt: z.date(),
});

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  recipientAccountId: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string().min(1),
  message: z.string(),
  referenceEntityType: z.string().nullable(),
  referenceEntityId: z.string().uuid().nullable(),
  isRead: z.boolean(),
  createdAt: z.date(),
  readAt: z.date().nullable(),
});

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actorAccountId: z.string().uuid().nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  tokenHash: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  invalidatedAt: z.date().nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
});

export const LoginSchema = z.object({
  personnelCode: z.string().min(1, 'Personnel code is required'),
  password: z.string().min(1, 'Password is required'),
});

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  personnelCode: z.string(),
  isActive: z.boolean(),
  roles: z.array(RoleNameSchema),
  teacherId: z.string().uuid().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateAcademicTermSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format'),
  status: AcademicTermStatusSchema.optional(),
});

export const UpdateAcademicTermSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format').optional(),
});

export const CreateBookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  level: z.string().min(1, 'Level is required').max(64),
  sequenceOrder: z.number().int().nonnegative('sequenceOrder must be non-negative'),
  sessionCount: z.number().int().positive('sessionCount must be positive'),
  isTerminal: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateBookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  level: z.string().min(1).max(64).optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),
  sessionCount: z.number().int().positive().optional(),
  isTerminal: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const CreateBookPartSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  sequenceOrder: z.number().int().nonnegative('sequenceOrder must be non-negative'),
});

export const UpdateBookPartSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),
});

export const CreateBookSegmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  sequenceOrder: z.number().int().nonnegative('sequenceOrder must be non-negative'),
});

export const UpdateBookSegmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),
});

export const CreateClassSchema = z.object({
  academicTermId: z.string().uuid('academicTermId must be a valid UUID'),
  bookId: z.string().uuid('bookId must be a valid UUID'),
  bookSegmentId: z.string().uuid('bookSegmentId must be a valid UUID').nullable().optional(),
  teacherId: z.string().uuid('teacherId must be a valid UUID').nullable().optional(),
  classType: ClassTypeSchema.optional(),
  status: ClassStatusSchema.optional(),
  capacity: z
    .number()
    .int('capacity must be an integer')
    .min(1, 'capacity must be at least 1')
    .max(15, 'capacity must not exceed 15')
    .optional(),
});

export const UpdateClassSchema = z.object({
  bookSegmentId: z.string().uuid('bookSegmentId must be a valid UUID').nullable().optional(),
  teacherId: z.string().uuid('teacherId must be a valid UUID').nullable().optional(),
  classType: ClassTypeSchema.optional(),
  status: ClassStatusSchema.optional(),
  capacity: z
    .number()
    .int('capacity must be an integer')
    .min(1, 'capacity must be at least 1')
    .max(15, 'capacity must not exceed 15')
    .optional(),
});

export const CreateEnrollmentSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID'),
  status: EnrollmentStatusSchema.optional(),
});

export const UpdateEnrollmentSchema = z.object({
  status: EnrollmentStatusSchema,
});

export const CreateStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(128),
  lastName: z.string().min(1, 'Last name is required').max(128),
  shahvarCode: z.string().max(64).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateStudentSchema = z.object({
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional(),
  shahvarCode: z.string().max(64).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const CreateTeacherSchema = z.object({
  accountId: z.string().uuid('accountId must be a valid UUID').nullable().optional(),
  firstName: z.string().min(1, 'First name is required').max(128),
  lastName: z.string().min(1, 'Last name is required').max(128),
  baseRate: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateTeacherSchema = z.object({
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional(),
  baseRate: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const CreateTeacherSkillSchema = z.object({
  bookId: z.string().uuid('bookId must be a valid UUID'),
});

export const CreateImportJobSchema = z.object({
  type: z.string().min(1, 'Import type is required').max(64),
  fileName: z.string().min(1, 'File name is required').max(255),
});

export const ShahvarRawRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  shahvarStudentCode: z.string().max(64).nullable().optional(),
  firstName: z.string().max(128).nullable().optional(),
  lastName: z.string().max(128).nullable().optional(),
  shahvarClassName: z.string().max(128).nullable().optional(),
  bookName: z.string().max(128).nullable().optional(),
  bookLevel: z.string().max(64).nullable().optional(),
});

export const ValidateImportJobSchema = z.object({
  academicTermId: z.string().uuid('academicTermId must be a valid UUID'),
  bookId: z.string().uuid('bookId must be a valid UUID'),
  rows: z.array(ShahvarRawRowSchema).min(1, 'At least one row must be provided for validation'),
});

export const CommitImportJobSchema = z.object({
  academicTermId: z.string().uuid('academicTermId must be a valid UUID'),
  bookId: z.string().uuid('bookId must be a valid UUID'),
  bookSegmentId: z.string().uuid('bookSegmentId must be a valid UUID').nullable().optional(),
  className: z.string().min(1).max(128).optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').max(15, 'Capacity cannot exceed 15').optional(),
  classType: ClassTypeSchema.optional(),
  rows: z.array(ShahvarRawRowSchema).min(1, 'At least one row must be provided for commit'),
});

export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must be in HH:mm or HH:mm:ss format');

export const TimeSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: TimeStringSchema,
  endTime: TimeStringSchema,
});

export const CreateScheduleSchema = z.object({
  classId: z.string().uuid('classId must be a valid UUID'),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: TimeStringSchema,
  endTime: TimeStringSchema,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startsOn must be YYYY-MM-DD').nullable().optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endsOn must be YYYY-MM-DD').nullable().optional(),
});

export const UpdateScheduleSchema = CreateScheduleSchema.partial().omit({ classId: true });

export const GenerateSchedulingProposalSchema = z.object({
  academicTermId: z.string().uuid('academicTermId must be a valid UUID').optional(),
  classIds: z.array(z.string().uuid('classId must be a valid UUID')).min(1).optional(),
  allowFriday: z.boolean().optional(),
});

export const FindSchedulesFilterSchema = z.object({
  classId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

export const FindSchedulingProposalsFilterSchema = z.object({
  academicTermId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACCEPTED', 'MODIFIED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const ModifySchedulingProposalSchema = z.object({
  classId: z.string().uuid('classId must be a valid UUID').optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: TimeStringSchema.optional(),
  endTime: TimeStringSchema.optional(),
  classes: z.array(z.any()).optional(),
});

export const GenerateClassSessionsSchema = z.object({
  classId: z.string().uuid('classId must be a valid UUID').optional(),
  academicTermId: z.string().uuid('academicTermId must be a valid UUID').optional(),
}).refine(data => data.classId || data.academicTermId, {
  message: "Either classId or academicTermId must be specified"
});

export const FindClassSessionsFilterSchema = z.object({
  classId: z.string().uuid().optional(),
  academicTermId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
});

export const StudentAttendanceItemSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID'),
  status: AttendanceStatusSchema,
});

export const RecordStudentAttendanceSchema = z
  .object({
    items: z.array(StudentAttendanceItemSchema).min(1, 'At least one student attendance record must be provided'),
  })
  .refine(
    (data) => {
      const studentIds = data.items.map((i) => i.studentId);
      return new Set(studentIds).size === studentIds.length;
    },
    {
      message: 'Duplicate student IDs are not allowed in the same attendance payload',
    },
  );

export const RecordTeacherAttendanceSchema = z.object({
  teacherId: z.string().uuid('teacherId must be a valid UUID'),
  status: TeacherAttendanceStatusSchema,
});

export const CancelClassSessionSchema = z.object({
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional(),
});

export const UpdateClassSessionSchema = z
  .object({
    sessionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'sessionDate must be YYYY-MM-DD')
      .optional(),
    startTime: TimeStringSchema.optional(),
    endTime: TimeStringSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.sessionDate !== undefined || data.startTime !== undefined || data.endTime !== undefined,
    {
      message:
        'At least one field (sessionDate, startTime, or endTime) must be provided for session update',
    },
  );

export const CreateSyllabusSchema = z.object({
  bookId: z.string().uuid('bookId must be a valid UUID'),
  bookSegmentId: z.string().uuid('bookSegmentId must be a valid UUID').nullable().optional(),
});

export const UpdateSyllabusSchema = z.object({
  bookId: z.string().uuid('bookId must be a valid UUID').optional(),
  bookSegmentId: z.string().uuid('bookSegmentId must be a valid UUID').nullable().optional(),
});

export const FindSyllabiFilterSchema = z.object({
  bookId: z.string().uuid().optional(),
  bookSegmentId: z.string().uuid().optional(),
});

export const CreateSyllabusItemSchema = z.object({
  type: SyllabusItemTypeSchema,
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  sequenceOrder: z.number().int().min(1, 'sequenceOrder must be at least 1'),
});

export const UpdateSyllabusItemSchema = z.object({
  type: SyllabusItemTypeSchema.optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  sequenceOrder: z.number().int().min(1).optional(),
});

export const CreateLessonPlanItemInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().nullable().optional(),
  syllabusItemId: z.string().uuid('syllabusItemId must be a valid UUID').nullable().optional(),
});

export const CreateLessonPlanSchema = z.object({
  teacherId: z.string().uuid('teacherId must be a valid UUID').optional(),
  initialItems: z.array(CreateLessonPlanItemInputSchema).optional(),
  copySyllabusItems: z.boolean().optional(),
});

export const UpdateLessonPlanItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  syllabusItemId: z.string().uuid().nullable().optional(),
});

export const UpdateLessonPlanSchema = z.object({
  items: z.array(UpdateLessonPlanItemInputSchema).optional(),
});

export const SubmitLessonPlanSchema = z.object({
  comments: z.string().max(500).optional(),
}).optional();

export const ApproveLessonPlanSchema = z.object({
  comments: z.string().max(500).optional(),
}).optional();

export const RejectLessonPlanSchema = z.object({
  reason: z.string().max(500).optional(),
}).optional();

// ==========================================
// Phase 7.3: Exam & Assessment Schemas
// ==========================================

export function deriveAssessmentStatus(score: number | string): AssessmentStatus {
  const numericScore = typeof score === 'string' ? parseFloat(score) : score;
  if (numericScore >= 70.0) {
    return AssessmentStatus.PASS;
  }
  if (numericScore >= 60.0) {
    return AssessmentStatus.CONDITIONAL;
  }
  return AssessmentStatus.FAIL;
}

export const CreateExamSchema = z.object({
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'examDate must be in YYYY-MM-DD format'),
  type: ExamTypeSchema,
});

export const UpdateExamSchema = z
  .object({
    examDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'examDate must be in YYYY-MM-DD format')
      .optional(),
    type: ExamTypeSchema.optional(),
  })
  .refine(
    (data) => data.examDate !== undefined || data.type !== undefined,
    { message: 'At least one field (examDate or type) must be provided for update' },
  );

export const CreateExamResultSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID'),
  score: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num >= 0 && num <= 100;
    }, { message: 'score must be between 0 and 100' }),
});

export const UpdateExamResultSchema = z.object({
  score: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num >= 0 && num <= 100;
    }, { message: 'score must be between 0 and 100' }),
});

// ==========================================
// Phase 7.4: Promotion Management Schemas
// ==========================================

export const DecidePromotionSchema = z.object({
  decision: PromotionDecisionSchema,
  reason: z.string().max(500).optional(),
});

// ==========================================
// Phase 9: Substitution Management Schemas
// ==========================================

export const CreateSubstitutionRequestSchema = z.object({
  classSessionId: z.string().uuid('classSessionId must be a valid UUID'),
});

export const RespondSubstitutionSchema = z.object({
  response: SubstitutionResponseTypeSchema,
});

export const ApproveSubstitutionSchema = z.object({
  teacherId: z.string().uuid('teacherId must be a valid UUID').optional(),
});

// ==========================================
// Phase 10: Tickets and Notifications Schemas
// ==========================================

export const CreateTicketSchema = z.object({
  type: TicketTypeSchema,
  title: z.string().min(1, 'title is required').max(255, 'title cannot exceed 255 characters'),
  description: z.string().min(1, 'description is required'),
});

export const UpdateTicketSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
}).refine(data => data.title !== undefined || data.description !== undefined, {
  message: 'At least one field (title or description) must be provided for update',
});

export const AssignTicketSchema = z.object({
  assignedTo: z.string().uuid('assignedTo must be a valid UUID'),
});

export const ResolveTicketSchema = z.object({
  resolutionNotes: z.string().max(1000).optional(),
});

export const RejectTicketSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const CancelTicketSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const CreateTicketMessageSchema = z.object({
  body: z.string().min(1, 'body is required'),
});

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const CreateAttachmentSchema = z.object({
  fileName: z.string().min(1, 'fileName is required').max(255),
  mimeType: z.string().refine(
    (mime) => ALLOWED_ATTACHMENT_MIME_TYPES.includes(mime as any),
    { message: 'Unsupported MIME type. Allowed types: Images, PDF, Word documents, Plain text' },
  ),
  size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES, {
    message: 'File size exceeds maximum allowed size of 5 MB',
  }),
  storageKey: z.string().min(1, 'storageKey is required').max(512),
});

export const QueryTicketsSchema = z.object({
  status: TicketStatusSchema.optional(),
  type: TicketTypeSchema.optional(),
  assignedTo: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});

export const QueryNotificationsSchema = z.object({
  isRead: z.union([z.boolean(), z.enum(['true', 'false'])]).transform(val => {
    if (typeof val === 'boolean') return val;
    return val === 'true';
  }).optional(),
});

// ==========================================
// Phase 11: Payroll and Private Classes Schemas
// ==========================================

export const CreatePayrollSchema = z.object({
  teacherId: z.string().uuid('teacherId must be a valid UUID'),
  academicTermId: z.string().uuid('academicTermId must be a valid UUID'),
});

export const CreatePayrollAdjustmentSchema = z.object({
  amount: z.union([
    z.number(),
    z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'amount must be a valid decimal number'),
  ]),
  description: z
    .string()
    .min(1, 'description is required')
    .max(500, 'description cannot exceed 500 characters'),
  referenceId: z.string().uuid('referenceId must be a valid UUID').optional().nullable(),
});

export const ReviewPayrollSchema = z.object({
  notes: z.string().max(500).optional(),
}).optional();

export const FinalizePayrollSchema = z.object({
  notes: z.string().max(500).optional(),
}).optional();

export const QueryPayrollsSchema = z.object({
  teacherId: z.string().uuid().optional(),
  academicTermId: z.string().uuid().optional(),
  status: PayrollStatusSchema.optional(),
});












