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

export interface IStudentRepository {
  findById(id: string): Promise<Student | null>;
  findAll(filter?: FindStudentsFilter): Promise<{ items: Student[]; total: number }>;
  create(data: CreateStudentData): Promise<Student>;
  update(id: string, updates: UpdateStudentData): Promise<Student>;
}
