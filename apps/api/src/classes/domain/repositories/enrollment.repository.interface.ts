import type { Enrollment } from '../entities/enrollment.entity';
import type { EnrollmentStatus, FindEnrollmentsFilter } from '@edutech/shared';

export interface CreateEnrollmentData {
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
}

export interface IEnrollmentRepository {
  findById(id: string): Promise<Enrollment | null>;
  findByClassAndStudent(classId: string, studentId: string): Promise<Enrollment | null>;
  findAllByClass(
    classId: string,
    filter?: FindEnrollmentsFilter,
  ): Promise<{ items: Enrollment[]; total: number }>;
  findAllByStudent(studentId: string): Promise<Enrollment[]>;
  createWithCapacityCheck(
    data: CreateEnrollmentData,
    maxCapacity: number,
  ): Promise<Enrollment>;
  updateStatus(
    id: string,
    status: EnrollmentStatus,
    leftAt?: Date | null,
  ): Promise<Enrollment>;
  countActiveByClass(classId: string): Promise<number>;
}
