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
  /** Roster of one class for its teacher: empty unless the class is ACTIVE in the ACTIVE term; ACTIVE enrollments only. */
  findCurrentByClassAndTeacher(
    classId: string,
    teacherId: string,
    filter?: FindEnrollmentsFilter,
  ): Promise<{ items: Enrollment[]; total: number }>;
  /** Only the student's current enrollments in `teacherId`'s classes (ACTIVE class, ACTIVE term, ACTIVE enrollment). */
  findCurrentByStudentAndTeacher(studentId: string, teacherId: string): Promise<Enrollment[]>;
  /** One enrollment, only if it is current for `teacherId` (ACTIVE class of this teacher, ACTIVE term, ACTIVE enrollment). */
  findCurrentByIdAndTeacher(id: string, teacherId: string): Promise<Enrollment | null>;
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
