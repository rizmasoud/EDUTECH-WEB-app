/**
 * EduTech Domain Types & Enums
 *
 * Source of Truth: /Docs/database/database-specification.md
 * Phase 1: Domain & Database Foundation
 */

// ==========================================
// Domain Enums
// ==========================================

export const RoleName = {
  SUPERVISOR: 'SUPERVISOR',
  TEACHER: 'TEACHER',
} as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const AcademicTermStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
} as const;
export type AcademicTermStatus = (typeof AcademicTermStatus)[keyof typeof AcademicTermStatus];

export const ClassType = {
  REGULAR: 'REGULAR',
  PRIVATE: 'PRIVATE',
} as const;
export type ClassType = (typeof ClassType)[keyof typeof ClassType];

export const ClassStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ClassStatus = (typeof ClassStatus)[keyof typeof ClassStatus];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const ClassSessionStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ClassSessionStatus = (typeof ClassSessionStatus)[keyof typeof ClassSessionStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const TeacherAttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  EXCUSED: 'EXCUSED',
} as const;
export type TeacherAttendanceStatus = (typeof TeacherAttendanceStatus)[keyof typeof TeacherAttendanceStatus];

export const SyllabusItemType = {
  FILM: 'FILM',
  WORKBOOK: 'WORKBOOK',
  CONVERSATION: 'CONVERSATION',
  GRAMMAR: 'GRAMMAR',
  VOCABULARY: 'VOCABULARY',
  OTHER: 'OTHER',
} as const;
export type SyllabusItemType = (typeof SyllabusItemType)[keyof typeof SyllabusItemType];

export const LessonPlanStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type LessonPlanStatus = (typeof LessonPlanStatus)[keyof typeof LessonPlanStatus];

export const ExamType = {
  FINAL: 'FINAL',
  MIDTERM: 'MIDTERM',
  OTHER: 'OTHER',
} as const;
export type ExamType = (typeof ExamType)[keyof typeof ExamType];

export const AssessmentStatus = {
  PASS: 'PASS',
  CONDITIONAL: 'CONDITIONAL',
  FAIL: 'FAIL',
} as const;
export type AssessmentStatus = (typeof AssessmentStatus)[keyof typeof AssessmentStatus];

export const PromotionStatus = {
  AUTOMATIC: 'AUTOMATIC',
  PENDING_DECISION: 'PENDING_DECISION',
  PROMOTED: 'PROMOTED',
  NOT_PROMOTED: 'NOT_PROMOTED',
  TERMINAL_COMPLETION: 'TERMINAL_COMPLETION',
} as const;
export type PromotionStatus = (typeof PromotionStatus)[keyof typeof PromotionStatus];

export const PromotionDecision = {
  PROMOTE: 'PROMOTE',
  DO_NOT_PROMOTE: 'DO_NOT_PROMOTE',
  REPEAT: 'REPEAT',
  REMEDIAL: 'REMEDIAL',
} as const;
export type PromotionDecision = (typeof PromotionDecision)[keyof typeof PromotionDecision];

export const SubstitutionRequestStatus = {
  REQUESTED: 'REQUESTED',
  BROADCASTED: 'BROADCASTED',
  RESPONDED: 'RESPONDED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type SubstitutionRequestStatus = (typeof SubstitutionRequestStatus)[keyof typeof SubstitutionRequestStatus];

export const SubstitutionResponseType = {
  ACCEPT: 'ACCEPT',
  DECLINE: 'DECLINE',
} as const;
export type SubstitutionResponseType = (typeof SubstitutionResponseType)[keyof typeof SubstitutionResponseType];

export const PayrollStatus = {
  DRAFT: 'DRAFT',
  CALCULATED: 'CALCULATED',
  REVIEWED: 'REVIEWED',
  FINALIZED: 'FINALIZED',
} as const;
export type PayrollStatus = (typeof PayrollStatus)[keyof typeof PayrollStatus];

export const PayrollItemType = {
  SESSION: 'SESSION',
  SYLLABUS_COMPLETION: 'SYLLABUS_COMPLETION',
  PRIVATE_CLASS: 'PRIVATE_CLASS',
  SUBSTITUTION: 'SUBSTITUTION',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type PayrollItemType = (typeof PayrollItemType)[keyof typeof PayrollItemType];

export const TicketType = {
  ATTENDANCE_CORRECTION: 'ATTENDANCE_CORRECTION',
  CLASS_CORRECTION: 'CLASS_CORRECTION',
  LESSON_PLAN_ISSUE: 'LESSON_PLAN_ISSUE',
  SUBSTITUTION_ISSUE: 'SUBSTITUTION_ISSUE',
  PAYROLL_ISSUE: 'PAYROLL_ISSUE',
  STUDENT_DATA_CORRECTION: 'STUDENT_DATA_CORRECTION',
  TEACHER_DATA_CORRECTION: 'TEACHER_DATA_CORRECTION',
  SYSTEM_ISSUE: 'SYSTEM_ISSUE',
  OTHER: 'OTHER',
} as const;
export type TicketType = (typeof TicketType)[keyof typeof TicketType];

export const TicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const ImportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const ImportResultStatus = {
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
} as const;
export type ImportResultStatus = (typeof ImportResultStatus)[keyof typeof ImportResultStatus];

export const NotificationType = {
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_UPDATED: 'TICKET_UPDATED',
  SUBSTITUTION_REQUEST: 'SUBSTITUTION_REQUEST',
  SUBSTITUTION_APPROVAL: 'SUBSTITUTION_APPROVAL',
  LESSON_PLAN_REVIEW: 'LESSON_PLAN_REVIEW',
  LESSON_PLAN_RESULT: 'LESSON_PLAN_RESULT',
  PROMOTION_DECISION_REQUIRED: 'PROMOTION_DECISION_REQUIRED',
  PAYROLL_READY: 'PAYROLL_READY',
  PAYROLL_FINALIZED: 'PAYROLL_FINALIZED',
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  IMPORT_COMPLETED_WITH_ERRORS: 'IMPORT_COMPLETED_WITH_ERRORS',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// ==========================================
// Domain Entity Interfaces
// ==========================================

export interface AccountEntity {
  id: string;
  personnelCode: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleEntity {
  id: string;
  name: string;
}

export interface AccountRoleEntity {
  accountId: string;
  roleId: string;
}

export interface TeacherEntity {
  id: string;
  accountId: string | null;
  firstName: string;
  lastName: string;
  baseRate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentEntity {
  id: string;
  firstName: string;
  lastName: string;
  shahvarCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstituteEntity {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookEntity {
  id: string;
  name: string;
  level: string;
  sequenceOrder: number;
  sessionCount: number;
  isTerminal: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookPartEntity {
  id: string;
  bookId: string;
  name: string;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookSegmentEntity {
  id: string;
  bookPartId: string;
  name: string;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcademicTermEntity {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicTermStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassEntity {
  id: string;
  academicTermId: string;
  bookId: string;
  bookSegmentId: string | null;
  teacherId: string | null;
  classType: ClassType;
  status: ClassStatus;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentEntity {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
  joinedAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherSkillEntity {
  id: string;
  teacherId: string;
  bookId: string;
  createdAt: Date;
}

export interface ScheduleEntity {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassSessionEntity {
  id: string;
  classId: string;
  scheduleId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: ClassSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceRecordEntity {
  id: string;
  classSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  recordedBy: string;
  recordedAt: Date;
  updatedAt: Date;
}

export interface TeacherAttendanceRecordEntity {
  id: string;
  classSessionId: string;
  teacherId: string;
  status: TeacherAttendanceStatus;
  recordedBy: string;
  recordedAt: Date;
  updatedAt: Date;
}

export interface SyllabusEntity {
  id: string;
  bookId: string;
  bookSegmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyllabusItemEntity {
  id: string;
  syllabusId: string;
  type: SyllabusItemType;
  title: string;
  description: string | null;
  required: boolean;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonPlanEntity {
  id: string;
  classId: string;
  teacherId: string;
  status: LessonPlanStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonPlanItemEntity {
  id: string;
  lessonPlanId: string;
  syllabusItemId: string | null;
  title: string;
  description: string | null;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamEntity {
  id: string;
  classId: string;
  examDate: string;
  type: ExamType;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamResultEntity {
  id: string;
  examId: string;
  studentId: string;
  score: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromotionEntity {
  id: string;
  studentId: string;
  fromBookId: string;
  toBookId: string | null;
  examResultId: string;
  status: PromotionStatus;
  decision: PromotionDecision | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubstitutionRequestEntity {
  id: string;
  classSessionId: string;
  requestedBy: string;
  status: SubstitutionRequestStatus;
  approvedTeacherId: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubstitutionResponseEntity {
  id: string;
  requestId: string;
  teacherId: string;
  response: SubstitutionResponseType;
  respondedAt: Date;
}

export interface PayrollEntity {
  id: string;
  teacherId: string;
  academicTermId: string;
  status: PayrollStatus;
  totalAmount: string;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollItemEntity {
  id: string;
  payrollId: string;
  type: PayrollItemType;
  quantity: string;
  rate: string;
  amount: string;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
}

export interface TicketEntity {
  id: string;
  createdBy: string;
  assignedTo: string | null;
  type: TicketType;
  status: TicketStatus;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface TicketMessageEntity {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface AttachmentEntity {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
}

export interface ImportJobEntity {
  id: string;
  type: string;
  status: ImportStatus;
  fileName: string;
  createdBy: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ImportResultEntity {
  id: string;
  importJobId: string;
  rowNumber: number;
  status: ImportResultStatus;
  message: string;
  createdAt: Date;
}

export interface NotificationEntity {
  id: string;
  recipientAccountId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface AuditLogEntity {
  id: string;
  actorAccountId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SessionEntity {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  invalidatedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AuthUser {
  id: string;
  personnelCode: string;
  isActive: boolean;
  roles: RoleName[];
  teacherId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LoginDto {
  personnelCode: string;
  password: string;
}

export interface LoginResponseData {
  account: AuthUser;
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateAcademicTermDto {
  name: string;
  startDate: string;
  endDate: string;
  status?: AcademicTermStatus;
}

export interface UpdateAcademicTermDto {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateBookDto {
  name: string;
  level: string;
  sequenceOrder: number;
  sessionCount: number;
  isTerminal?: boolean;
  isActive?: boolean;
}

export interface UpdateBookDto {
  name?: string;
  level?: string;
  sequenceOrder?: number;
  sessionCount?: number;
  isTerminal?: boolean;
  isActive?: boolean;
}

export interface CreateBookPartDto {
  name: string;
  sequenceOrder: number;
}

export interface UpdateBookPartDto {
  name?: string;
  sequenceOrder?: number;
}

export interface CreateBookSegmentDto {
  name: string;
  sequenceOrder: number;
}

export interface UpdateBookSegmentDto {
  name?: string;
  sequenceOrder?: number;
}

export type NextBookResult =
  | { outcome: 'NEXT_BOOK'; book: BookEntity }
  | { outcome: 'TERMINAL_COMPLETION'; message: string }
  | { outcome: 'NO_NEXT_BOOK' };

export interface CreateClassDto {
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
}

export interface UpdateClassDto {
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
}

export interface ClassResponseDto {
  id: string;
  academicTermId: string;
  bookId: string;
  bookSegmentId: string | null;
  teacherId: string | null;
  classType: ClassType;
  status: ClassStatus;
  capacity: number;
  activeEnrollmentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindClassesFilter {
  academicTermId?: string;
  bookId?: string;
  teacherId?: string;
  status?: ClassStatus;
  classType?: ClassType;
  page?: number;
  pageSize?: number;
}

export interface CreateEnrollmentDto {
  studentId: string;
  status?: EnrollmentStatus;
}

export interface UpdateEnrollmentDto {
  status?: EnrollmentStatus;
}

export interface EnrollmentResponseDto {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
  joinedAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindEnrollmentsFilter {
  status?: EnrollmentStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateStudentDto {
  firstName: string;
  lastName: string;
  shahvarCode?: string | null;
  isActive?: boolean;
}

export interface UpdateStudentDto {
  firstName?: string;
  lastName?: string;
  shahvarCode?: string | null;
  isActive?: boolean;
}

export interface StudentResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  shahvarCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindStudentsFilter {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateTeacherDto {
  accountId?: string | null;
  firstName: string;
  lastName: string;
  baseRate?: string;
  isActive?: boolean;
}

export interface UpdateTeacherDto {
  firstName?: string;
  lastName?: string;
  baseRate?: string;
  isActive?: boolean;
}

export interface TeacherResponseDto {
  id: string;
  accountId: string | null;
  firstName: string;
  lastName: string;
  baseRate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindTeachersFilter {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateTeacherSkillDto {
  bookId: string;
}

export interface TeacherSkillResponseDto {
  id: string;
  teacherId: string;
  bookId: string;
  bookName?: string;
  bookLevel?: string;
  createdAt: Date;
}

export interface CreateImportJobDto {
  type: string;
  fileName: string;
}

export interface ImportJobResponseDto {
  id: string;
  type: string;
  status: ImportStatus;
  fileName: string;
  createdBy: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  resultsCount?: {
    total: number;
    success: number;
    warning: number;
    error: number;
    skipped: number;
  };
}

export interface FindImportJobsFilter {
  type?: string;
  status?: ImportStatus;
  page?: number;
  pageSize?: number;
}

export interface ImportResultResponseDto {
  id: string;
  importJobId: string;
  rowNumber: number;
  status: ImportResultStatus;
  message: string;
  createdAt: Date;
}

export interface FindImportResultsFilter {
  status?: ImportResultStatus;
  page?: number;
  pageSize?: number;
}

export interface ShahvarRawRow {
  rowNumber: number;
  shahvarStudentCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  shahvarClassName?: string | null;
  bookName?: string | null;
  bookLevel?: string | null;
}

export interface ValidateImportJobDto {
  academicTermId: string;
  bookId: string;
  rows: ShahvarRawRow[];
}

export interface ImportValidationPreviewDto {
  importJobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  results: ImportResultResponseDto[];
  studentsToCreate: Array<{ firstName: string; lastName: string; shahvarCode: string | null }>;
  studentsToMatch: Array<{ studentId: string; fullName: string; shahvarCode: string | null }>;
  enrollmentsToCreate: number;
}

export interface CommitImportJobDto {
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  className?: string | null;
  capacity?: number;
  classType?: ClassType;
  rows: ShahvarRawRow[];
}

export interface CommitImportResponseDto {
  importJobId: string;
  status: ImportStatus;
  classId: string;
  studentsCreatedCount: number;
  studentsMatchedCount: number;
  enrollmentsCreatedCount: number;
  createdStudentIds: string[];
  matchedStudentIds: string[];
  enrollmentIds: string[];
  completedAt: Date;
}

export const DayOfWeek = {
  SATURDAY: 6,
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
} as const;
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const DayPattern = {
  ODD: 'ODD',     // Sunday (0), Tuesday (2), Thursday (4)
  EVEN: 'EVEN',   // Saturday (6), Monday (1), Wednesday (3)
  CUSTOM: 'CUSTOM',
} as const;
export type DayPattern = (typeof DayPattern)[keyof typeof DayPattern];

export const SchedulingProposalStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACCEPTED: 'ACCEPTED',
  MODIFIED: 'MODIFIED',
  REJECTED: 'REJECTED',
} as const;
export type SchedulingProposalStatus =
  (typeof SchedulingProposalStatus)[keyof typeof SchedulingProposalStatus];

export const SchedulingConflictCode = {
  FRIDAY_UNAVAILABLE: 'FRIDAY_UNAVAILABLE',
  INVALID_TIME_RANGE: 'INVALID_TIME_RANGE',
  TEACHER_OVERLAP: 'TEACHER_OVERLAP',
  CLASS_OVERLAP: 'CLASS_OVERLAP',
  STUDENT_CONFLICT: 'STUDENT_CONFLICT',
  UNQUALIFIED_TEACHER: 'UNQUALIFIED_TEACHER',
  CAPACITY_VIOLATION: 'CAPACITY_VIOLATION',
  CLASS_INACTIVE: 'CLASS_INACTIVE',
  NO_ELIGIBLE_TEACHER: 'NO_ELIGIBLE_TEACHER',
  NO_VALID_TIME_SLOT: 'NO_VALID_TIME_SLOT',
} as const;
export type SchedulingConflictCode =
  (typeof SchedulingConflictCode)[keyof typeof SchedulingConflictCode];

export const ConflictSeverity = {
  HARD_CONSTRAINT: 'HARD_CONSTRAINT',
  SOFT_PREFERENCE: 'SOFT_PREFERENCE',
} as const;
export type ConflictSeverity = (typeof ConflictSeverity)[keyof typeof ConflictSeverity];

// ==========================================
// Scheduling Domain Types
// ==========================================

export interface TimeSlotDto {
  dayOfWeek: number; // 0..6 (0=Sunday, 1=Monday, ..., 6=Saturday)
  startTime: string; // HH:mm (e.g. "08:00")
  endTime: string;   // HH:mm (e.g. "09:30")
}

export interface ScheduleDto {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchedulingConflictDto {
  code: SchedulingConflictCode;
  severity: ConflictSeverity;
  classId: string;
  teacherId?: string | null;
  studentId?: string | null;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  message: string;
  details?: Record<string, any>;
}

export interface ConstraintEvaluationReport {
  constraintName: string;
  passed: boolean;
  message?: string;
  conflict?: SchedulingConflictDto;
}

export interface PreferenceEvaluationReport {
  preferenceName: string;
  applied: boolean;
  scoreContribution: number;
  reason?: string;
}

export interface SchedulingCandidateSlotDto {
  classId: string;
  teacherId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  score: number;
  hardConstraintReports: ConstraintEvaluationReport[];
  preferenceReports: PreferenceEvaluationReport[];
  isValid: boolean;
  conflicts: SchedulingConflictDto[];
}

export interface ScheduleEngineResultDto {
  classId: string;
  recommendedSlot?: SchedulingCandidateSlotDto | null;
  candidateSlots: SchedulingCandidateSlotDto[];
  evaluatedCandidatesCount: number;
  validCandidatesCount: number;
  conflicts: SchedulingConflictDto[];
  explanation: {
    passedConstraints: string[];
    failedConstraints: string[];
    satisfiedPreferences: string[];
    unsatisfiedPreferences: string[];
    summary: string;
  };
}

export interface CreateScheduleDto {
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface UpdateScheduleDto {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface FindSchedulesFilter {
  classId?: string;
  teacherId?: string;
  dayOfWeek?: number;
}

export interface GenerateSchedulingProposalDto {
  academicTermId?: string;
  classIds?: string[];
  allowFriday?: boolean;
}

export interface ProposedClassScheduleDto {
  classId: string;
  teacherId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  score: number;
  isValid: boolean;
  hardConstraintReports: ConstraintEvaluationReport[];
  preferenceReports: PreferenceEvaluationReport[];
  conflicts: SchedulingConflictDto[];
}

export interface SchedulingProposalDataDto {
  classes: ProposedClassScheduleDto[];
  conflicts: SchedulingConflictDto[];
  preferences: PreferenceEvaluationReport[];
  explanations: string[];
  evaluatedClassCount: number;
  validClassCount: number;
}

export interface SchedulingProposalDto {
  id: string;
  academicTermId?: string | null;
  createdBy?: string | null;
  status: SchedulingProposalStatus;
  data: SchedulingProposalDataDto;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
}

export interface FindSchedulingProposalsFilter {
  academicTermId?: string;
  status?: SchedulingProposalStatus;
  page?: number;
  pageSize?: number;
}

export interface ModifySchedulingProposalDto {
  classId?: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  classes?: ProposedClassScheduleDto[];
}

export interface AcceptProposalResponseDto {
  proposalId: string;
  status: SchedulingProposalStatus;
  committedSchedulesCount: number;
  scheduleIds: string[];
  acceptedAt: Date;
}

export interface ValidateProposalResponseDto {
  proposalId: string;
  status: SchedulingProposalStatus;
  isStillValid: boolean;
  conflicts: SchedulingConflictDto[];
  data: SchedulingProposalDataDto;
}

export interface GenerateClassSessionsDto {
  classId?: string;
  academicTermId?: string;
}

export interface FindClassSessionsFilterDto {
  classId?: string;
  academicTermId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ClassSessionDto {
  id: string;
  classId: string;
  scheduleId?: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: ClassSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassSessionDetailDto extends ClassSessionDto {
  class?: {
    id: string;
    academicTermId: string;
    bookId: string;
    teacherId?: string | null;
    capacity: number;
    status: string;
  };
}

export interface StudentAttendanceItemDto {
  studentId: string;
  status: AttendanceStatus;
}

export interface RecordStudentAttendanceDto {
  items: StudentAttendanceItemDto[];
}

export interface RecordTeacherAttendanceDto {
  teacherId: string;
  status: TeacherAttendanceStatus;
}

export interface CancelClassSessionDto {
  reason?: string;
}

export interface UpdateClassSessionDto {
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
}

export interface ClassSessionLifecycleResponseDto {
  id: string;
  status: ClassSessionStatus;
  updatedAt: Date | string;
}

export interface AttendanceRecordWithStudentDto extends AttendanceRecordEntity {
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    shahvarCode?: string | null;
  };
}

export interface CreateSyllabusDto {
  bookId: string;
  bookSegmentId?: string | null;
}

export interface UpdateSyllabusDto {
  bookId?: string;
  bookSegmentId?: string | null;
}

export interface FindSyllabiFilterDto {
  bookId?: string;
  bookSegmentId?: string;
}

export interface CreateSyllabusItemDto {
  type: SyllabusItemType;
  title: string;
  description?: string | null;
  required?: boolean;
  sequenceOrder: number;
}

export interface UpdateSyllabusItemDto {
  type?: SyllabusItemType;
  title?: string;
  description?: string | null;
  required?: boolean;
  sequenceOrder?: number;
}

export interface SyllabusDto {
  id: string;
  bookId: string;
  bookSegmentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyllabusItemDto {
  id: string;
  syllabusId: string;
  type: SyllabusItemType;
  title: string;
  description?: string | null;
  required: boolean;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyllabusDetailDto extends SyllabusDto {
  book?: {
    id: string;
    name: string;
    level: string;
  };
  bookSegment?: {
    id: string;
    name: string;
  } | null;
  items?: SyllabusItemDto[];
}

export interface CreateLessonPlanItemInputDto {
  title: string;
  description?: string | null;
  syllabusItemId?: string | null;
}

export interface CreateLessonPlanDto {
  teacherId?: string;
  initialItems?: CreateLessonPlanItemInputDto[];
  copySyllabusItems?: boolean;
}

export interface UpdateLessonPlanItemInputDto {
  id?: string;
  title: string;
  description?: string | null;
  syllabusItemId?: string | null;
}

export interface UpdateLessonPlanDto {
  items?: UpdateLessonPlanItemInputDto[];
}

export interface SubmitLessonPlanDto {
  comments?: string;
}

export interface ApproveLessonPlanDto {
  comments?: string;
}

export interface RejectLessonPlanDto {
  reason?: string;
}

export interface LessonPlanDto {
  id: string;
  classId: string;
  teacherId: string;
  status: LessonPlanStatus;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LessonPlanItemDto {
  id: string;
  lessonPlanId: string;
  syllabusItemId?: string | null;
  title: string;
  description?: string | null;
  completed: boolean;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LessonPlanDetailDto extends LessonPlanDto {
  class?: {
    id: string;
    academicTermId: string;
    bookId: string;
    bookSegmentId?: string | null;
    classType: string;
    status: string;
  };
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  items: LessonPlanItemDto[];
}

export interface CreateExamDto {
  examDate: string;
  type: ExamType;
}

export interface UpdateExamDto {
  examDate?: string;
  type?: ExamType;
}

export interface ExamDto {
  id: string;
  classId: string;
  examDate: string;
  type: ExamType;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ExamDetailDto extends ExamDto {
  class?: {
    id: string;
    academicTermId: string;
    bookId: string;
    bookSegmentId?: string | null;
    teacherId?: string | null;
    classType: string;
    status: string;
  };
  resultsCount?: number;
}

export interface CreateExamResultDto {
  studentId: string;
  score: number | string;
}

export interface UpdateExamResultDto {
  score: number | string;
}

export interface ExamResultDto {
  id: string;
  examId: string;
  studentId: string;
  score: number;
  status: AssessmentStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ExamResultDetailDto extends ExamResultDto {
  student?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface DecidePromotionDto {
  decision: PromotionDecision;
  reason?: string;
}

export interface PromotionDto {
  id: string;
  studentId: string;
  fromBookId: string;
  toBookId: string | null;
  examResultId: string;
  status: PromotionStatus;
  decision: PromotionDecision | null;
  decidedBy: string | null;
  decidedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PromotionDetailDto extends PromotionDto {
  student?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  fromBook?: {
    id: string;
    name: string;
    level: number;
    sequenceOrder: number;
    isTerminal: boolean;
  };
  toBook?: {
    id: string;
    name: string;
    level: number;
    sequenceOrder: number;
    isTerminal: boolean;
  } | null;
  examResult?: {
    id: string;
    examId: string;
    score: number;
  };
}

// ==========================================
// Phase 9: Substitution Management Types
// ==========================================

export interface CreateSubstitutionRequestDto {
  classSessionId: string;
}

export interface RespondSubstitutionDto {
  response: SubstitutionResponseType;
}

export interface ApproveSubstitutionDto {
  teacherId?: string;
}

export interface SubstitutionCandidateDto {
  teacherId: string;
  firstName: string;
  lastName: string;
  baseRate: string;
  isEligible: boolean;
  ineligibilityReason?: string;
}

export interface SubstitutionResponseDetailDto {
  id: string;
  requestId: string;
  teacherId: string;
  response: SubstitutionResponseType;
  respondedAt: Date | string;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface SubstitutionRequestDto {
  id: string;
  classSessionId: string;
  requestedBy: string;
  status: SubstitutionRequestStatus;
  approvedTeacherId: string | null;
  approvedBy: string | null;
  approvedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SubstitutionRequestDetailDto extends SubstitutionRequestDto {
  classSession?: {
    id: string;
    classId: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    status: string;
    class?: {
      id: string;
      academicTermId: string;
      bookId: string;
      teacherId: string | null;
      classType: string;
      status: string;
    };
  };
  requester?: {
    id: string;
    personnelCode: string;
  };
  approvedTeacher?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  responses?: SubstitutionResponseDetailDto[];
}

// ==========================================
// Phase 10: Tickets and Notifications Types
// ==========================================

export interface CreateTicketDto {
  type: TicketType;
  title: string;
  description: string;
}

export interface UpdateTicketDto {
  title?: string;
  description?: string;
}

export interface AssignTicketDto {
  assignedTo: string;
}

export interface ResolveTicketDto {
  resolutionNotes?: string;
}

export interface RejectTicketDto {
  reason?: string;
}

export interface CancelTicketDto {
  reason?: string;
}

export interface CreateTicketMessageDto {
  body: string;
}

export interface CreateAttachmentDto {
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
}

export interface TicketMessageDto {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: Date | string;
  author?: {
    id: string;
    personnelCode: string;
  };
}

export interface AttachmentDto {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date | string;
}

export interface TicketDto {
  id: string;
  createdBy: string;
  assignedTo: string | null;
  type: TicketType;
  status: TicketStatus;
  title: string;
  description: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt: Date | string | null;
}

export interface TicketDetailDto extends TicketDto {
  creator?: {
    id: string;
    personnelCode: string;
  };
  assignee?: {
    id: string;
    personnelCode: string;
  } | null;
  messages?: TicketMessageDto[];
  attachments?: AttachmentDto[];
}

export interface QueryTicketsDto {
  status?: TicketStatus;
  type?: TicketType;
  assignedTo?: string;
  createdBy?: string;
}

export interface CreateNotificationDto {
  recipientAccountId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceEntityType?: string | null;
  referenceEntityId?: string | null;
}

export interface NotificationDto {
  id: string;
  recipientAccountId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  isRead: boolean;
  createdAt: Date | string;
  readAt: Date | string | null;
}

export interface NotificationListResponseDto {
  data: NotificationDto[];
  unreadCount: number;
}

export interface QueryNotificationsDto {
  isRead?: boolean;
}

// ==========================================
// Phase 11: Payroll and Private Classes Types
// ==========================================

export interface CreatePayrollDto {
  teacherId: string;
  academicTermId: string;
}

export interface CreatePayrollAdjustmentDto {
  amount: number | string;
  description: string;
  referenceId?: string | null;
}

export interface ReviewPayrollDto {
  notes?: string;
}

export interface FinalizePayrollDto {
  notes?: string;
}

export interface QueryPayrollsDto {
  teacherId?: string;
  academicTermId?: string;
  status?: PayrollStatus;
}

export interface PayrollItemDto {
  id: string;
  payrollId: string;
  type: PayrollItemType;
  quantity: string;
  rate: string;
  amount: string;
  referenceId: string | null;
  description: string | null;
  createdAt: Date | string;
}

export interface PayrollDto {
  id: string;
  teacherId: string;
  academicTermId: string;
  status: PayrollStatus;
  totalAmount: string;
  finalizedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PayrollDetailDto extends PayrollDto {
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
    baseRate?: string | null;
    accountId?: string | null;
  };
  academicTerm?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  items?: PayrollItemDto[];
}

