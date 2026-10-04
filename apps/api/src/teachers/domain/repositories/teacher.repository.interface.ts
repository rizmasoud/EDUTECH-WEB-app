import type { Teacher } from '../entities/teacher.entity';
import type { TeacherSkill } from '../entities/teacher-skill.entity';
import type { FindTeachersFilter } from '@edutech/shared';

export interface CreateTeacherData {
  accountId?: string | null;
  firstName: string;
  lastName: string;
  baseRate?: string;
  isActive?: boolean;
}

export interface UpdateTeacherData {
  firstName?: string;
  lastName?: string;
  baseRate?: string;
  isActive?: boolean;
}

export interface ITeacherRepository {
  findById(id: string): Promise<Teacher | null>;
  findAll(filter?: FindTeachersFilter): Promise<{ items: Teacher[]; total: number }>;
  create(data: CreateTeacherData): Promise<Teacher>;
  update(id: string, updates: UpdateTeacherData): Promise<Teacher>;
  findSkills(teacherId: string): Promise<TeacherSkill[]>;
  addSkill(teacherId: string, bookId: string): Promise<TeacherSkill>;
  deleteSkill(teacherId: string, skillId: string): Promise<void>;
  findSkillByTeacherAndBook(teacherId: string, bookId: string): Promise<TeacherSkill | null>;
  verifyBookExistsAndActive(bookId: string): Promise<boolean>;
}
