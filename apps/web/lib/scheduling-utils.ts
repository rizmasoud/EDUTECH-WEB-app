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

export interface PastelColorDefinition {
  id: string;
  name: string;
  swatchHex: string;
  cardBg: string;
  cardBorder: string;
  hoverBorder: string;
  accentBg: string;
  accentText: string;
  accentIcon: string;
  badgeBg: string;
  dotBg: string;
  /**
   * Stronger treatment used only for Weekly Timetable blocks so neighbouring
   * pastel colors stay distinguishable (tinted fill, clear border, deeper left accent).
   */
  blockClass: string;
}

export const PASTEL_COLORS: PastelColorDefinition[] = [
  {
    id: 'blue',
    name: 'Pastel Blue',
    swatchHex: '#BAE6FD',
    cardBg: 'bg-sky-50/80',
    cardBorder: 'border-sky-200',
    hoverBorder: 'hover:border-sky-300',
    accentBg: 'bg-sky-100/90',
    accentText: 'text-sky-800',
    accentIcon: 'text-sky-600',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
    dotBg: 'bg-sky-400',
    blockClass: 'bg-sky-100 border-sky-300 border-l-4 border-l-sky-500',
  },
  {
    id: 'green',
    name: 'Pastel Green',
    swatchHex: '#BBF7D0',
    cardBg: 'bg-green-50/80',
    cardBorder: 'border-green-200',
    hoverBorder: 'hover:border-green-300',
    accentBg: 'bg-green-100/90',
    accentText: 'text-green-800',
    accentIcon: 'text-green-600',
    badgeBg: 'bg-green-100 text-green-800 border-green-200',
    dotBg: 'bg-green-400',
    blockClass: 'bg-green-100 border-green-300 border-l-4 border-l-green-500',
  },
  {
    id: 'yellow',
    name: 'Pastel Yellow',
    swatchHex: '#FEF08A',
    cardBg: 'bg-amber-50/80',
    cardBorder: 'border-amber-200',
    hoverBorder: 'hover:border-amber-300',
    accentBg: 'bg-amber-100/90',
    accentText: 'text-amber-900',
    accentIcon: 'text-amber-600',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
    dotBg: 'bg-amber-400',
    blockClass: 'bg-amber-100 border-amber-300 border-l-4 border-l-amber-500',
  },
  {
    id: 'peach',
    name: 'Pastel Peach',
    swatchHex: '#FED7AA',
    cardBg: 'bg-orange-50/80',
    cardBorder: 'border-orange-200',
    hoverBorder: 'hover:border-orange-300',
    accentBg: 'bg-orange-100/90',
    accentText: 'text-orange-900',
    accentIcon: 'text-orange-600',
    badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
    dotBg: 'bg-orange-400',
    blockClass: 'bg-orange-100 border-orange-300 border-l-4 border-l-orange-500',
  },
  {
    id: 'pink',
    name: 'Pastel Pink',
    swatchHex: '#FBCFE8',
    cardBg: 'bg-pink-50/80',
    cardBorder: 'border-pink-200',
    hoverBorder: 'hover:border-pink-300',
    accentBg: 'bg-pink-100/90',
    accentText: 'text-pink-900',
    accentIcon: 'text-pink-600',
    badgeBg: 'bg-pink-100 text-pink-800 border-pink-200',
    dotBg: 'bg-pink-400',
    blockClass: 'bg-pink-100 border-pink-300 border-l-4 border-l-pink-500',
  },
  {
    id: 'lavender',
    name: 'Pastel Lavender',
    swatchHex: '#DDD6FE',
    cardBg: 'bg-violet-50/80',
    cardBorder: 'border-violet-200',
    hoverBorder: 'hover:border-violet-300',
    accentBg: 'bg-violet-100/90',
    accentText: 'text-violet-900',
    accentIcon: 'text-violet-600',
    badgeBg: 'bg-violet-100 text-violet-800 border-violet-200',
    dotBg: 'bg-violet-400',
    blockClass: 'bg-violet-100 border-violet-300 border-l-4 border-l-violet-500',
  },
  {
    id: 'mint',
    name: 'Pastel Mint',
    swatchHex: '#A7F3D0',
    cardBg: 'bg-emerald-50/80',
    cardBorder: 'border-emerald-200',
    hoverBorder: 'hover:border-emerald-300',
    accentBg: 'bg-emerald-100/90',
    accentText: 'text-emerald-900',
    accentIcon: 'text-emerald-600',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotBg: 'bg-emerald-400',
    blockClass: 'bg-emerald-100 border-emerald-300 border-l-4 border-l-emerald-500',
  },
  {
    id: 'cyan',
    name: 'Pastel Cyan',
    swatchHex: '#A5F3FC',
    cardBg: 'bg-cyan-50/80',
    cardBorder: 'border-cyan-200',
    hoverBorder: 'hover:border-cyan-300',
    accentBg: 'bg-cyan-100/90',
    accentText: 'text-cyan-900',
    accentIcon: 'text-cyan-600',
    badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    dotBg: 'bg-cyan-400',
    blockClass: 'bg-cyan-100 border-cyan-300 border-l-4 border-l-cyan-500',
  },
  {
    id: 'coral',
    name: 'Pastel Coral',
    swatchHex: '#FECDD3',
    cardBg: 'bg-rose-50/80',
    cardBorder: 'border-rose-200',
    hoverBorder: 'hover:border-rose-300',
    accentBg: 'bg-rose-100/90',
    accentText: 'text-rose-900',
    accentIcon: 'text-rose-600',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
    dotBg: 'bg-rose-400',
    blockClass: 'bg-rose-100 border-rose-300 border-l-4 border-l-rose-500',
  },
  {
    id: 'lilac',
    name: 'Pastel Lilac',
    swatchHex: '#E9D5FF',
    cardBg: 'bg-purple-50/80',
    cardBorder: 'border-purple-200',
    hoverBorder: 'hover:border-purple-300',
    accentBg: 'bg-purple-100/90',
    accentText: 'text-purple-900',
    accentIcon: 'text-purple-600',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
    dotBg: 'bg-purple-400',
    blockClass: 'bg-purple-100 border-purple-300 border-l-4 border-l-purple-500',
  },
];

export function getPastelColor(colorId?: string | null): PastelColorDefinition {
  const found = PASTEL_COLORS.find((c) => c.id === colorId);
  return found || PASTEL_COLORS[0];
}

/**
 * Display label for a class. Uses the stored class name when one exists;
 * only classes that were never given a name fall back to the generic label.
 */
export const UNNAMED_CLASS_LABEL = 'Unnamed Class';

export function getClassDisplayName(
  cls?: { className?: string | null } | null,
  fallback: string = UNNAMED_CLASS_LABEL,
): string {
  const name = cls?.className?.trim();
  return name ? name : fallback;
}
