import type { Class } from '../entities/class.entity';
import type { ClassStatus, ClassType, FindClassesFilter } from '@edutech/shared';

export interface CreateClassData {
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType: ClassType;
  status: ClassStatus;
  capacity: number;
  color?: string | null;
  name?: string | null;
}

export interface UpdateClassData {
  bookSegmentId?: string | null;
  teacherId?: string | null;
  name?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
  color?: string | null;
}

export interface IClassRepository {
  findById(id: string): Promise<Class | null>;
  /** `currentOnly` restricts to ACTIVE classes of the ACTIVE academic term (what teachers may see). */
  findAll(filter?: FindClassesFilter, options?: { currentOnly?: boolean }): Promise<{ items: Class[]; total: number }>;
  /** True when the academic term's status is ACTIVE (the current term). */
  isTermActive(termId: string): Promise<boolean>;
  create(data: CreateClassData): Promise<Class>;
  update(id: string, updates: UpdateClassData): Promise<Class>;
  countActiveEnrollments(classId: string): Promise<number>;
  verifyTeacherSkill(teacherId: string, bookId: string): Promise<boolean>;
  verifyTeacherExistsAndActive(teacherId: string): Promise<boolean>;
  verifyStudentExistsAndActive(studentId: string): Promise<boolean>;
  verifyTermExistsAndNotClosed(termId: string): Promise<boolean>;
  verifyBookExistsAndActive(bookId: string): Promise<boolean>;
  verifySegmentBelongsToBook(segmentId: string, bookId: string): Promise<boolean>;
  hasHistoricalRecords(classId: string): Promise<boolean>;
  deleteClass(id: string): Promise<void>;
}
