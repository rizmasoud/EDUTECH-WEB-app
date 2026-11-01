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

/** Restricts a student query to the students a teacher currently teaches (ACTIVE class, ACTIVE term, ACTIVE enrollment). */
export interface StudentScope {
  teacherId: string;
}

export interface IStudentRepository {
  findById(id: string): Promise<Student | null>;
  findAll(
    filter?: FindStudentsFilter,
    scope?: StudentScope,
  ): Promise<{ items: Student[]; total: number }>;
  /** True when the student currently has a class with `teacherId` in the current (ACTIVE) term. */
  hasCurrentClassWithTeacher(studentId: string, teacherId: string): Promise<boolean>;
  create(data: CreateStudentData): Promise<Student>;
  update(id: string, updates: UpdateStudentData): Promise<Student>;
}
