import type { ClassStatus, ClassType } from '@edutech/shared';

export interface CreateClassInput {
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
}

export interface UpdateClassInput {
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
}

export interface QueryClassesInput {
  academicTermId?: string;
  bookId?: string;
  teacherId?: string;
  status?: ClassStatus;
  classType?: ClassType;
  page?: number | string;
  pageSize?: number | string;
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
