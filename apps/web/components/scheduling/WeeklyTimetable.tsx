'use client';

import React, { useState } from 'react';
import type { ClassItem, Schedule } from '../../lib/api-client';
import { WEEK_DAYS, formatTimeRange, getDayName } from '../../lib/scheduling-utils';
import { Clock, User, BookOpen, Edit2, Trash2, Users, Plus, AlertCircle } from 'lucide-react';

interface WeeklyTimetableProps {
  classes: ClassItem[];
  schedules: Schedule[];
  isSupervisor: boolean;
  onEditSchedule?: (schedule: Schedule, cls?: ClassItem) => void;
  onDeleteSchedule?: (schedule: Schedule) => void;
  onAddSchedule?: (dayOfWeek?: number) => void;
}

export function WeeklyTimetable({
  classes,
  schedules,
  isSupervisor,
  onEditSchedule,
  onDeleteSchedule,
  onAddSchedule,
}: WeeklyTimetableProps) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('ALL');

  // Map classId to class object for quick lookup
  const classMap = new Map<string, ClassItem>();
  classes.forEach((c) => classMap.set(c.id, c));

  // Extract unique teachers for filter
  const uniqueTeachers = Array.from(
    new Map(
      classes
        .filter((c) => c.teacher)
        .map((c) => [c.teacherId, c.teacher!])
    ).values()
  );

  // Filter schedules by teacher if selected
  const filteredSchedules = schedules.filter((s) => {
    if (selectedTeacherId === 'ALL') return true;
    const cls = classMap.get(s.classId);
    return cls?.teacherId === selectedTeacherId;
  });

  // Group schedules by day of week (0 to 6)
  const schedulesByDay = new Map<number, Schedule[]>();
  WEEK_DAYS.forEach((d) => schedulesByDay.set(d.dayOfWeek, []));

  filteredSchedules.forEach((s) => {
    const list = schedulesByDay.get(s.dayOfWeek) || [];
    list.push(s);
    // Sort chronologically by startTime
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    schedulesByDay.set(s.dayOfWeek, list);
  });

  return (
    <div className="space-y-4">
      {/* Timetable Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Weekly Timetable
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">
            {filteredSchedules.length} active sessions
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Teacher Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="teacher-filter" className="text-xs text-slate-500">
              Teacher:
            </label>
            <select
              id="teacher-filter"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="text-xs rounded border border-slate-300 bg-white px-2 py-1 text-slate-700"
            >
              <option value="ALL">All Teachers ({uniqueTeachers.length})</option>
              {uniqueTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Add Schedule button if supervisor */}
          {isSupervisor && onAddSchedule && (
            <button
              type="button"
              onClick={() => onAddSchedule()}
              className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Schedule</span>
            </button>
          )}
        </div>
      </div>

      {/* Timetable Grid (Cal.com inspired) */}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 min-w-[900px]">
          {WEEK_DAYS.map((day) => {
            const daySchedules = schedulesByDay.get(day.dayOfWeek) || [];
            const isFriday = day.isWeekend;
            const isThursday = day.isPreferredThursday;

            return (
              <div
                key={day.dayOfWeek}
                className={`flex flex-col rounded-lg border transition-colors ${
                  isFriday
                    ? 'border-slate-200 bg-slate-100/60 opacity-90'
                    : 'border-slate-200 bg-white shadow-2xs'
                }`}
              >
                {/* Day Header */}
                <div
                  className={`px-3 py-2.5 border-b flex items-center justify-between ${
                    isFriday
                      ? 'border-slate-200 bg-slate-200/50 text-slate-600'
                      : isThursday
                      ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                      : 'border-slate-100 bg-slate-50/80 text-slate-800'
                  }`}
                >
                  <div>
                    <h3 className="text-xs font-bold tracking-tight">
                      {day.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-normal">
                      {isFriday
                        ? 'Institute Rest Day'
                        : isThursday
                        ? 'Thu Morning Preferred'
                        : day.dayOfWeek === 6 || day.dayOfWeek === 1 || day.dayOfWeek === 3
                        ? 'Odd Day Cycle'
                        : 'Even Day Cycle'}
                    </p>
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-600">
                    {daySchedules.length}
                  </span>
                </div>

                {/* Day Content Area */}
                <div className="p-2 flex-1 flex flex-col gap-2 min-h-[300px]">
                  {isFriday && daySchedules.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                      <div className="w-8 h-8 rounded-full bg-slate-200/70 flex items-center justify-center mb-1 text-slate-400">
                        ✕
                      </div>
                      <p className="text-[11px] font-medium text-slate-500">Weekend</p>
                      <p className="text-[10px] text-slate-400">No scheduled sessions</p>
                    </div>
                  ) : daySchedules.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded text-slate-400">
                      <p className="text-[11px]">No classes scheduled</p>
                      {isSupervisor && onAddSchedule && (
                        <button
                          type="button"
                          onClick={() => onAddSchedule(day.dayOfWeek)}
                          className="mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          + Add slot
                        </button>
                      )}
                    </div>
                  ) : (
                    daySchedules.map((schedule) => {
                      const cls = classMap.get(schedule.classId);
                      return (
                        <div
                          key={schedule.id}
                          className="group relative rounded-md border border-slate-200 bg-white p-2.5 hover:border-indigo-300 hover:shadow-xs transition-all text-xs"
                        >
                          {/* Time tag */}
                          <div className="flex items-center justify-between text-[11px] font-medium text-indigo-700 bg-indigo-50/70 px-1.5 py-0.5 rounded mb-1.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-indigo-500" />
                              <span>{formatTimeRange(schedule.startTime, schedule.endTime)}</span>
                            </span>
                            {cls?.classType === 'PRIVATE' && (
                              <span className="text-[9px] uppercase tracking-wider text-purple-700 bg-purple-100 px-1 rounded">
                                Private
                              </span>
                            )}
                          </div>

                          {/* Class Name */}
                          <h4 className="font-semibold text-slate-900 truncate" title={cls?.className}>
                            {cls?.className || 'Unnamed Class'}
                          </h4>

                          {/* Book info */}
                          {cls?.book && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1 truncate">
                              <BookOpen className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{cls.book.name} ({cls.book.level})</span>
                            </div>
                          )}

                          {/* Teacher */}
                          <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-1 truncate">
                            <User className="w-3 h-3 shrink-0 text-slate-400" />
                            <span className="truncate">
                              {cls?.teacher
                                ? `${cls.teacher.firstName} ${cls.teacher.lastName}`
                                : 'No teacher assigned'}
                            </span>
                          </div>

                          {/* Capacity / Enrolled */}
                          {cls && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                              <Users className="w-3 h-3 shrink-0 text-slate-400" />
                              <span>
                                {cls.enrolledCount ?? 0} / {cls.capacity} students
                              </span>
                            </div>
                          )}

                          {/* Supervisor Action Buttons */}
                          {isSupervisor && (
                            <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {onEditSchedule && (
                                <button
                                  type="button"
                                  onClick={() => onEditSchedule(schedule, cls)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-50 transition-colors"
                                  title="Edit schedule slot"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {onDeleteSchedule && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteSchedule(schedule)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                                  title="Delete schedule"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
