import type { ClassStatus, ClassType, TimeSlotDto } from '@edutech/shared';
import { TimeSlot } from '../value-objects/time-slot.vo';

export interface SchedulingClassInfo {
  id: string;
  academicTermId: string;
  bookId: string;
  bookSegmentId?: string | null;
  teacherId?: string | null;
  capacity: number;
  classType: ClassType;
  status: ClassStatus;
  enrolledStudentIds: string[];
}

export interface ExistingClassSchedule {
  id: string;
  classId: string;
  teacherId?: string | null;
  slot: TimeSlot;
  enrolledStudentIds?: string[];
}

export interface TeacherSkillInfo {
  teacherId: string;
  bookId: string;
}

export interface SchedulingClassContext {
  classInfo: SchedulingClassInfo;
  existingClassSchedules: ExistingClassSchedule[];
  existingTeacherSchedules: ExistingClassSchedule[];
  existingStudentSchedules: Map<string, ExistingClassSchedule[]>; // studentId -> their schedules in other classes
  teacherSkills: TeacherSkillInfo[];
  teacherPreferredTimeSlots?: TimeSlotDto[];
}

export interface SchedulingGlobalContext {
  classes: SchedulingClassInfo[];
  allExistingSchedules: ExistingClassSchedule[];
  teacherSkills: TeacherSkillInfo[];
  teacherPreferences?: Map<string, TimeSlotDto[]>;
}
