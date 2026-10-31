import type { Student } from '../entities/student.entity';
import type { FindStudentsFilter } from '@edutech/shared';

export interface CreateStudentData {
  firstName: string;
  lastName: string;
  shahvarCode?: string | null;
  isActive?: boolean;
}

export interface UpdateStudentData {
  firstName?: string;
  lastName?: string;
  shahvarCode?: string | null;
  isActive?: boolean;
}

/** Restricts a student query to a teacher's own students (ACTIVE enrollment in one of that teacher's classes). */
export interface StudentScope {
  teacherId: string;
}

export interface IStudentRepository {
  findById(id: string): Promise<Student | null>;
  findAll(
    filter?: FindStudentsFilter,
    scope?: StudentScope,
  ): Promise<{ items: Student[]; total: number }>;
  /** True when the student has an ACTIVE enrollment in a class taught by `teacherId`. */
  isActivelyEnrolledWithTeacher(studentId: string, teacherId: string): Promise<boolean>;
  create(data: CreateStudentData): Promise<Student>;
  update(id: string, updates: UpdateStudentData): Promise<Student>;
}
