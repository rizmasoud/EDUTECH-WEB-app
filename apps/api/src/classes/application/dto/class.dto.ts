import type { ClassStatus, ClassType } from '@edutech/shared';

export interface CreateClassInput {
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  teacherId?: string | null;
  className?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
  color?: string | null;
}

export interface UpdateClassInput {
  bookSegmentId?: string | null;
  teacherId?: string | null;
  className?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
  color?: string | null;
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
  className: string | null;
  classType: ClassType;
  status: ClassStatus;
  capacity: number;
  color: string;
  activeEnrollmentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
