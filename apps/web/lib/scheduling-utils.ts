/**
 * Scheduling UI Utilities & Mappings
 */

export interface DayInfo {
  dayOfWeek: number;
  name: string;
  shortName: string;
  isWeekend: boolean;
  isPreferredThursday?: boolean;
}

// Ordered according to institute calendar: Saturday to Friday
export const WEEK_DAYS: DayInfo[] = [
  { dayOfWeek: 6, name: 'Saturday', shortName: 'Sat', isWeekend: false },
  { dayOfWeek: 0, name: 'Sunday', shortName: 'Sun', isWeekend: false },
  { dayOfWeek: 1, name: 'Monday', shortName: 'Mon', isWeekend: false },
  { dayOfWeek: 2, name: 'Tuesday', shortName: 'Tue', isWeekend: false },
  { dayOfWeek: 3, name: 'Wednesday', shortName: 'Wed', isWeekend: false },
  { dayOfWeek: 4, name: 'Thursday', shortName: 'Thu', isWeekend: false, isPreferredThursday: true },
  { dayOfWeek: 5, name: 'Friday', shortName: 'Fri', isWeekend: true },
];

export function getDayName(dayOfWeek: number): string {
  const day = WEEK_DAYS.find((d) => d.dayOfWeek === dayOfWeek);
  return day ? day.name : `Day ${dayOfWeek}`;
}

export function getDayShortName(dayOfWeek: number): string {
  const day = WEEK_DAYS.find((d) => d.dayOfWeek === dayOfWeek);
  return day ? day.shortName : `D${dayOfWeek}`;
}

export function formatTimeRange(start: string, end: string): string {
  if (!start && !end) return 'Unscheduled';
  const cleanStart = (start || '').slice(0, 5);
  const cleanEnd = (end || '').slice(0, 5);
  return `${cleanStart} – ${cleanEnd}`;
}

export const CONFLICT_LABELS: Record<string, { label: string; description: string }> = {
  TEACHER_DOUBLE_BOOKING: {
    label: 'Teacher Overlap',
    description: 'The assigned teacher is already scheduled for another class in this time slot.',
  },
  TEACHER_TIME_CONFLICT: {
    label: 'Teacher Conflict',
    description: 'Teacher has a conflicting schedule during this time.',
  },
  STUDENT_DOUBLE_BOOKING: {
    label: 'Student Overlap',
    description: 'One or more enrolled students have another class scheduled at this time.',
  },
  STUDENT_TIME_CONFLICT: {
    label: 'Student Conflict',
    description: 'Enrolled student has an overlapping class schedule.',
  },
  UNQUALIFIED_TEACHER: {
    label: 'Teacher Skill Mismatch',
    description: 'The teacher does not have the certified skill requirement for this book.',
  },
  TEACHER_SKILL_MISMATCH: {
    label: 'Teacher Skill Mismatch',
    description: 'Teacher lacks required skill credentials for this book/level.',
  },
  CAPACITY_EXCEEDED: {
    label: 'Capacity Exceeded',
    description: 'Class enrollment exceeds maximum allowed seating capacity.',
  },
  CLASS_CAPACITY_EXCEEDED: {
    label: 'Capacity Exceeded',
    description: 'Student count exceeds class capacity limits.',
  },
  FRIDAY_UNAVAILABLE: {
    label: 'Friday Policy Violation',
    description: 'Scheduling on Friday is not permitted under default institute policy.',
  },
  INVALID_TIME_SLOT: {
    label: 'Invalid Time Range',
    description: 'The start time must precede end time within operational working hours.',
  },
  CLASS_INACTIVE: {
    label: 'Class Inactive',
    description: 'This class has been cancelled, completed, or deactivated.',
  },
};

export function getConflictInfo(code: string): { label: string; description: string } {
  return (
    CONFLICT_LABELS[code] || {
      label: code.replace(/_/g, ' '),
      description: 'Scheduling conflict detected by validation engine.',
    }
  );
}

export const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  DRAFT: {
    dot: 'bg-slate-400',
    text: 'text-slate-700',
    bg: 'bg-slate-100',
  },
  PENDING_REVIEW: {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  ACCEPTED: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  MODIFIED: {
    dot: 'bg-sky-500',
    text: 'text-sky-700',
    bg: 'bg-sky-50',
  },
  REJECTED: {
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
  },
};
