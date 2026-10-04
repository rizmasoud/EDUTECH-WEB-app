'use client';

import React from 'react';
import type { ClassItem, Schedule, UserAccount } from '../../lib/api-client';
import { WeeklyTimetable } from './WeeklyTimetable';
import { User, BookOpen, Clock, Users, Shield, Calendar, CheckCircle2 } from 'lucide-react';
import { formatTimeRange, getDayName } from '../../lib/scheduling-utils';

interface TeacherScheduleViewProps {
  user: UserAccount | null;
  classes: ClassItem[];
  schedules: Schedule[];
}

export function TeacherScheduleView({
  user,
  classes,
  schedules,
}: TeacherScheduleViewProps) {
  // Filter classes assigned to this teacher
  // If user has a teacherId, filter by it; otherwise if teacher has classes, filter accordingly
  const teacherClasses = classes.filter(
    (c) => (user?.teacherId && c.teacherId === user.teacherId) || !user?.teacherId
  );
  const teacherClassIds = new Set(teacherClasses.map((c) => c.id));
  const teacherSchedules = schedules.filter((s) => teacherClassIds.has(s.classId));

  return (
    <div className="space-y-6">
      {/* Teacher Role Banner */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-xs text-indigo-900 flex items-start gap-3">
        <div className="p-1 rounded bg-indigo-100 text-indigo-700 mt-0.5">
          <User className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">
              Teacher Schedule Portal (Read-Only)
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
              Authorized Teacher
            </span>
          </div>
          <p className="text-slate-600 mt-0.5 leading-relaxed">
            You are viewing your authorized academic assignments and weekly timetable.
            Schedule changes, proposal generation, and manual overrides are managed exclusively
            by the Academic Supervisor.
          </p>
        </div>
      </div>

      {/* Assigned Classes Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            My Assigned Classes ({teacherClasses.length})
          </h3>
          <span className="text-xs text-slate-500">
            {teacherSchedules.length} active weekly sessions
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {teacherClasses.length === 0 ? (
            <div className="col-span-full rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
              No classes currently assigned to your teacher account.
            </div>
          ) : (
            teacherClasses.map((cls) => {
              const clsSchedules = teacherSchedules.filter((s) => s.classId === cls.id);
              const isScheduled = clsSchedules.length > 0;

              return (
                <div
                  key={cls.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900">{cls.className}</h4>
                      {cls.book && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <BookOpen className="w-3 h-3 text-slate-400" />
                          <span>
                            {cls.book.name} ({cls.book.level})
                          </span>
                        </p>
                      )}
                    </div>
                    {cls.classType === 'PRIVATE' && (
                      <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        Private
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>
                        {cls.enrolledCount ?? 0} / {cls.capacity} students
                      </span>
                    </span>
                    <span
                      className={`font-medium ${
                        isScheduled ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {isScheduled ? 'Scheduled' : 'Pending Scheduling'}
                    </span>
                  </div>

                  {/* Scheduled slots */}
                  {isScheduled && (
                    <div className="space-y-1 pt-1">
                      {clsSchedules.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700"
                        >
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          <span className="font-medium">{getDayName(s.dayOfWeek)}</span>
                          <span className="text-slate-400">·</span>
                          <Clock className="w-3 h-3 text-indigo-500" />
                          <span>{formatTimeRange(s.startTime, s.endTime)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Read-Only Weekly Timetable */}
      <div className="pt-2">
        <WeeklyTimetable
          classes={teacherClasses}
          schedules={teacherSchedules}
          isSupervisor={false}
        />
      </div>
    </div>
  );
}
