import type { AcademicTermStatus } from '@edutech/shared';

export interface CreateAcademicTermInput {
  name: string;
  startDate: string;
  endDate: string;
  status?: AcademicTermStatus;
}

export interface UpdateAcademicTermInput {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface QueryAcademicTermsInput {
  status?: AcademicTermStatus;
  search?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface AcademicTermResponseDto {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicTermStatus;
  createdAt: Date;
  updatedAt: Date;
}
