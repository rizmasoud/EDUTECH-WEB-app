import type { EnrollmentStatus } from '@edutech/shared';

export interface CreateEnrollmentInput {
  studentId: string;
  status?: EnrollmentStatus;
}

export interface UpdateEnrollmentInput {
  status: EnrollmentStatus;
}

export interface QueryEnrollmentsInput {
  status?: EnrollmentStatus;
  page?: number | string;
  pageSize?: number | string;
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
