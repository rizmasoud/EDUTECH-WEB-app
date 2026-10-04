'use client';

import React, { useState } from 'react';
import type { ClassItem, Schedule } from '../../lib/api-client';
import { getDayShortName, formatTimeRange } from '../../lib/scheduling-utils';
import {
  Calendar,
  Clock,
  User,
  BookOpen,
  Users,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Search,
  Filter,
} from 'lucide-react';

interface ClassesOverviewProps {
  classes: ClassItem[];
  schedules: Schedule[];
  isSupervisor: boolean;
  selectedClassIds: string[];
  onToggleSelectClass: (id: string) => void;
  onSelectAllClasses: (all: boolean) => void;
  onOpenGenerateModal: (classIds?: string[]) => void;
  onOpenManualSchedule: (cls: ClassItem, schedule?: Schedule) => void;
  onDeleteSchedule: (schedule: Schedule) => void;
}

export function ClassesOverview({
  classes,
  schedules,
  isSupervisor,
  selectedClassIds,
  onToggleSelectClass,
  onSelectAllClasses,
  onOpenGenerateModal,
  onOpenManualSchedule,
  onDeleteSchedule,
}: ClassesOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNSCHEDULED' | 'SCHEDULED'>('ALL');

  // Build schedule mapping: classId -> Schedule[]
  const scheduleMap = new Map<string, Schedule[]>();
  schedules.forEach((s) => {
    const list = scheduleMap.get(s.classId) || [];
    list.push(s);
    scheduleMap.set(s.classId, list);
  });

  // Filter classes
  const filteredClasses = classes.filter((cls) => {
    const classSchedules = scheduleMap.get(cls.id) || [];
    const isScheduled = classSchedules.length > 0;

    if (statusFilter === 'UNSCHEDULED' && isScheduled) return false;
    if (statusFilter === 'SCHEDULED' && !isScheduled) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = cls.className.toLowerCase().includes(q);
      const matchBook = cls.book?.name.toLowerCase().includes(q);
      const matchTeacher =
        cls.teacher &&
        `${cls.teacher.firstName} ${cls.teacher.lastName}`.toLowerCase().includes(q);
      if (!matchName && !matchBook && !matchTeacher) return false;
    }

    return true;
  });

  const allFilteredSelected =
    filteredClasses.length > 0 &&
    filteredClasses.every((c) => selectedClassIds.includes(c.id));

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by class, book, or teacher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 pl-8 pr-3 py-1.5 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({classes.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('UNSCHEDULED')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'UNSCHEDULED'
                  ? 'bg-white text-amber-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unscheduled ({classes.filter((c) => (scheduleMap.get(c.id) || []).length === 0).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('SCHEDULED')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'SCHEDULED'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scheduled ({classes.filter((c) => (scheduleMap.get(c.id) || []).length > 0).length})
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        {isSupervisor && (
          <div className="flex items-center gap-2">
            {selectedClassIds.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenGenerateModal(selectedClassIds)}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Generate for Selected ({selectedClassIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenGenerateModal()}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded shadow-2xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Generate Term Proposal</span>
            </button>
          </div>
        )}
      </div>

      {/* Classes Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              {isSupervisor && (
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => onSelectAllClasses(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    title="Select all filtered classes"
                  />
                </th>
              )}
              <th className="px-4 py-3">Class Name</th>
              <th className="px-4 py-3">Book & Level</th>
              <th className="px-4 py-3">Assigned Teacher</th>
              <th className="px-4 py-3">Students / Capacity</th>
              <th className="px-4 py-3">Current Schedule</th>
              {isSupervisor && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClasses.length === 0 ? (
              <tr>
                <td
                  colSpan={isSupervisor ? 7 : 6}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No classes match the active filters or search criteria.
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls) => {
                const classSchedules = scheduleMap.get(cls.id) || [];
                const isScheduled = classSchedules.length > 0;
                const isSelected = selectedClassIds.includes(cls.id);

                return (
                  <tr
                    key={cls.id}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      isSelected ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    {isSupervisor && (
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectClass(cls.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}

                    {/* Class Name */}
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{cls.className}</span>
                        {cls.classType === 'PRIVATE' && (
                          <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1 rounded font-normal">
                            Private
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Book */}
                    <td className="px-4 py-3 text-slate-600">
                      {cls.book ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{cls.book.name}</span>
                          <span className="text-slate-400">({cls.book.level})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Teacher */}
                    <td className="px-4 py-3">
                      {cls.teacher ? (
                        <div className="flex items-center gap-1 text-slate-700">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {cls.teacher.firstName} {cls.teacher.lastName}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3 text-amber-500" />
                          <span>Unassigned</span>
                        </span>
                      )}
                    </td>

                    {/* Capacity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {cls.enrolledCount ?? 0} / {cls.capacity}
                        </span>
                      </div>
                    </td>

                    {/* Schedule */}
                    <td className="px-4 py-3">
                      {isScheduled ? (
                        <div className="flex flex-wrap gap-1">
                          {classSchedules.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded"
                            >
                              <Clock className="w-3 h-3 text-indigo-500" />
                              <span>
                                {getDayShortName(s.dayOfWeek)}{' '}
                                {formatTimeRange(s.startTime, s.endTime)}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3 text-slate-400" />
                          <span>Unscheduled</span>
                        </span>
                      )}
                    </td>

                    {/* Supervisor Actions */}
                    {isSupervisor && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isScheduled ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenManualSchedule(cls, classSchedules[0])}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded"
                                title="Edit schedule"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSchedule(classSchedules[0])}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Remove schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenManualSchedule(cls)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Set Slot</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
