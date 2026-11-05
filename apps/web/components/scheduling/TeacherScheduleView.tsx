'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClassItem, Schedule, UserAccount, StudentItem, EnrollmentItem } from '../../lib/api-client';
import { apiClient } from '../../lib/api-client';
import { WeeklyTimetable } from './WeeklyTimetable';
import {
  User, BookOpen, Clock, Users, Calendar, ClipboardCheck, RefreshCw,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { formatTimeRange, getDayName, getClassDisplayName } from '../../lib/scheduling-utils';
import { createLatestRequestGuard, hasSessionOccurred } from '../../lib/attendance-session-utils';

interface TeacherScheduleViewProps {
  user: UserAccount | null;
  classes: ClassItem[];
  schedules: Schedule[];
}

type ClassSession = {
  id: string;
  classId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
};

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type AttendanceRecord = {
  studentId: string;
  status: AttendanceStatus;
  student?: Pick<StudentItem, 'id' | 'firstName' | 'lastName' | 'shahvarCode'>;
};

type RosterStudent = Pick<StudentItem, 'id' | 'firstName' | 'lastName' | 'shahvarCode'>;

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'EXCUSED', label: 'Excused' },
];

function localDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function sessionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    throw new Error(body?.message || body?.error?.message || `Request failed (${response.status})`);
  }
  return (body && typeof body === 'object' && 'data' in body && Object.keys(body).length === 1
    ? body.data
    : body) as T;
}

function TeacherAttendancePanel({ classes }: { classes: ClassItem[] }) {
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | ''>>({});
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Only the most recent roster/attendance request may update the panel; older responses are discarded.
  const requestGuard = useRef(createLatestRequestGuard()).current;

  const classById = useMemo(() => new Map(classes.map((cls) => [cls.id, cls])), [classes]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const params = new URLSearchParams({
        startDate: localDateOffset(-7),
        endDate: localDateOffset(45),
      });
      const result = await sessionRequest<ClassSession[]>(`/sessions?${params.toString()}`);
      setSessions(Array.isArray(result) ? result : []);
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : 'Could not load class sessions.');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openAttendance = async (session: ClassSession) => {
    const token = requestGuard.begin();
    setSelectedSession(session);
    setAttendanceLoading(true);
    setPanelError(null);
    setSuccessMessage(null);
    setRoster([]);
    setStatuses({});
    setAlreadyRecorded(false);
    try {
      const [enrollmentResult, attendance] = await Promise.all([
        apiClient.getClassEnrollments(session.classId, { status: 'ACTIVE', page: 1, pageSize: 100 }),
        sessionRequest<AttendanceRecord[]>(`/sessions/${session.id}/attendance`),
      ]);
      const activeEnrollments: EnrollmentItem[] = enrollmentResult.items;
      const classRoster = await Promise.all(
        activeEnrollments.map(async (enrollment) => {
          // The API enforces that a teacher can read only students currently enrolled in their own class.
          const student = await sessionRequest<StudentItem>(`/students/${enrollment.studentId}`);
          return {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            shahvarCode: student.shahvarCode,
          };
        }),
      );

      if (!requestGuard.isLatest(token)) return;
      setRoster(classRoster);
      const saved = new Map(attendance.map((record) => [record.studentId, record.status]));
      setAlreadyRecorded(attendance.length > 0);
      setStatuses(Object.fromEntries(classRoster.map((student) => [
        student.id,
        saved.get(student.id) ?? '',
      ])));
    } catch (error) {
      if (!requestGuard.isLatest(token)) return;
      setPanelError(error instanceof Error ? error.message : 'Could not load the class roster and attendance.');
    } finally {
      if (requestGuard.isLatest(token)) setAttendanceLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSession || roster.length === 0) return;
    if (!hasSessionOccurred(selectedSession)) {
      setPanelError('Attendance can be submitted only after the session has started.');
      return;
    }
    if (roster.some((student) => !statuses[student.id])) {
      setPanelError('Select an attendance status for every student before saving.');
      return;
    }
    setSaving(true);
    setPanelError(null);
    setSuccessMessage(null);
    try {
      const result = await sessionRequest<{ recordedCount: number; sessionStatus: string }>(
        `/sessions/${selectedSession.id}/attendance`,
        {
          method: 'POST',
          body: JSON.stringify({
            items: roster.map((student) => ({
              studentId: student.id,
              status: statuses[student.id],
            })),
          }),
        },
      );
      setAlreadyRecorded(true);
      setSuccessMessage(`Attendance saved for ${result.recordedCount} students.`);
      await openAttendance(selectedSession);
      setSuccessMessage(`Attendance saved for ${result.recordedCount} students.`);
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const sessionOccurred = selectedSession ? hasSessionOccurred(selectedSession) : false;

  const upcoming = sessions
    .filter((session) => classById.has(session.classId))
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            Class sessions & attendance
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Your sessions from the last 7 days through the next 45 days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={sessionsLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {sessionsError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> {sessionsError}
        </div>
      )}

      {sessionsLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
        </div>
      ) : upcoming.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
          No generated sessions were found for your assigned classes in this date range.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {upcoming.map((session) => {
            const cls = classById.get(session.classId)!;
            const selected = selectedSession?.id === session.id;
            return (
              <button
                type="button"
                key={session.id}
                onClick={() => void openAttendance(session)}
                disabled={saving}
                className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{getClassDisplayName(cls)}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${session.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : session.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                    {session.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(`${session.sessionDate}T00:00:00`).toLocaleDateString()}
                  <Clock className="ml-1 h-3.5 w-3.5" />
                  {formatTimeRange(session.startTime, session.endTime)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedSession && (
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900">Student attendance</h4>
              <p className="text-[11px] text-slate-500">
                {classById.get(selectedSession.classId) ? getClassDisplayName(classById.get(selectedSession.classId)!) : 'Class'} · {new Date(`${selectedSession.sessionDate}T00:00:00`).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                requestGuard.invalidate();
                setAttendanceLoading(false);
                setSelectedSession(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50">
              Close
            </button>
          </div>

          {panelError && <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{panelError}</p>}
          {successMessage && <p role="status" className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />{successMessage}</p>}

          {attendanceLoading ? (
            <div className="flex items-center gap-2 py-5 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading roster…</div>
          ) : roster.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">No active students were found in this class.</p>
          ) : (
            <>
              {alreadyRecorded && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Attendance has already been submitted. Teachers can view it but cannot overwrite it. Contact the supervisor if a correction is needed.
                </p>
              )}
              {!sessionOccurred && !alreadyRecorded && (
                <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  This session has not started yet. You can view the roster, but attendance can be submitted only after the session has started.
                </p>
              )}
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {roster.map((student) => (
                  <div key={student.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-900">{student.firstName} {student.lastName}</p>
                      {student.shahvarCode && <p className="text-[10px] text-slate-500">{student.shahvarCode}</p>}
                    </div>
                    <select
                      aria-label={`Attendance for ${student.firstName} ${student.lastName}`}
                      value={statuses[student.id] ?? ''}
                      disabled={alreadyRecorded || saving || !sessionOccurred}
                      onChange={(event) => setStatuses((current) => ({ ...current, [student.id]: event.target.value as AttendanceStatus | '' }))}
                      className="min-w-36 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                    >
                      <option value="">Select status</option>
                      {ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!alreadyRecorded && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || attendanceLoading || roster.length === 0 || !sessionOccurred}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save attendance
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function TeacherScheduleView({ user, classes, schedules }: TeacherScheduleViewProps) {
  // The API already scopes teacher class data. This client-side filter is an additional presentation boundary.
  const teacherClasses = classes.filter((cls) => Boolean(user?.teacherId) && cls.teacherId === user?.teacherId);
  const teacherClassIds = new Set(teacherClasses.map((cls) => cls.id));
  const teacherSchedules = schedules.filter((schedule) => teacherClassIds.has(schedule.classId));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-xs text-indigo-900">
        <div className="mt-0.5 rounded bg-indigo-100 p-1 text-indigo-700"><User className="h-4 w-4" /></div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">Teacher Portal</h3>
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Authorized Teacher</span>
          </div>
          <p className="mt-0.5 leading-relaxed text-slate-600">
            View your assigned classes and weekly timetable, then record attendance for your generated class sessions.
            Schedule changes remain managed by the Academic Supervisor.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">My Assigned Classes ({teacherClasses.length})</h3>
          <span className="text-xs text-slate-500">{teacherSchedules.length} active weekly sessions</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {teacherClasses.length === 0 ? (
            <div className="col-span-full rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
              No classes currently assigned to your teacher account.
            </div>
          ) : teacherClasses.map((cls) => {
            const classSchedules = teacherSchedules.filter((schedule) => schedule.classId === cls.id);
            return (
              <div key={cls.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-slate-900">{getClassDisplayName(cls)}</h4>
                    {cls.book && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><BookOpen className="h-3 w-3 text-slate-400" />{cls.book.name} ({cls.book.level})</p>}
                  </div>
                  {cls.classType === 'PRIVATE' && <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">Private</span>}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3 text-slate-400" />{cls.enrolledCount ?? 0} / {cls.capacity} students</span>
                  <span className={`font-medium ${classSchedules.length ? 'text-emerald-700' : 'text-amber-700'}`}>{classSchedules.length ? 'Scheduled' : 'Pending Scheduling'}</span>
                </div>
                {classSchedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-center gap-1.5 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                    <Calendar className="h-3 w-3 text-indigo-500" /><span className="font-medium">{getDayName(schedule.dayOfWeek)}</span>
                    <span className="text-slate-400">·</span><Clock className="h-3 w-3 text-indigo-500" /><span>{formatTimeRange(schedule.startTime, schedule.endTime)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <TeacherAttendancePanel classes={teacherClasses} />

      <div className="pt-2">
        <WeeklyTimetable classes={teacherClasses} schedules={teacherSchedules} isSupervisor={false} />
      </div>
    </div>
  );
}
