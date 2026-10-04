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
}

export interface UpdateClassData {
  bookSegmentId?: string | null;
  teacherId?: string | null;
  classType?: ClassType;
  status?: ClassStatus;
  capacity?: number;
}

export interface IClassRepository {
  findById(id: string): Promise<Class | null>;
  findAll(filter?: FindClassesFilter): Promise<{ items: Class[]; total: number }>;
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
