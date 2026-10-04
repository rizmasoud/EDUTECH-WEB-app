'use client';

import React, { useState } from 'react';
import type { ClassItem, Schedule } from '../../lib/api-client';
import { WEEK_DAYS } from '../../lib/scheduling-utils';
import { Calendar, X, AlertTriangle, Trash2, Save } from 'lucide-react';

interface ManualScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  initialClass?: ClassItem | null;
  initialSchedule?: Schedule | null;
  defaultDayOfWeek?: number;
  onSaveSchedule: (data: {
    scheduleId?: string;
    classId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startsOn?: string | null;
    endsOn?: string | null;
  }) => Promise<void>;
  onDeleteSchedule?: (id: string) => Promise<void>;
}

function ManualScheduleDialogContent({
  onClose,
  classes,
  initialClass,
  initialSchedule,
  defaultDayOfWeek,
  onSaveSchedule,
  onDeleteSchedule,
}: Omit<ManualScheduleModalProps, 'isOpen'>) {
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialSchedule) return initialSchedule.classId;
    if (initialClass) return initialClass.id;
    return classes[0]?.id || '';
  });

  const [dayOfWeek, setDayOfWeek] = useState<number>(() => {
    if (initialSchedule) return initialSchedule.dayOfWeek;
    if (defaultDayOfWeek !== undefined) return defaultDayOfWeek;
    return 6;
  });

  const [startTime, setStartTime] = useState<string>(() => {
    if (initialSchedule) return initialSchedule.startTime.slice(0, 5);
    return '08:30';
  });

  const [endTime, setEndTime] = useState<string>(() => {
    if (initialSchedule) return initialSchedule.endTime.slice(0, 5);
    return '10:00';
  });

  const [startsOn, setStartsOn] = useState<string>(() => {
    return initialSchedule?.startsOn || '';
  });

  const [endsOn, setEndsOn] = useState<string>(() => {
    return initialSchedule?.endsOn || '';
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentClass = classes.find((c) => c.id === selectedClassId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      setError('Please select a class');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSaveSchedule({
        scheduleId: initialSchedule?.id,
        classId: selectedClassId,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        startsOn: startsOn ? startsOn : null,
        endsOn: endsOn ? endsOn : null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialSchedule || !onDeleteSchedule) return;
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    setLoading(true);
    setError(null);
    try {
      await onDeleteSchedule(initialSchedule.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete schedule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {initialSchedule ? 'Edit Class Schedule' : 'Schedule Class Manually'}
            </h2>
            <p className="text-xs text-slate-500">
              Explicit timetable entry subject to backend validation
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
            <div>
              <p className="font-semibold">Validation Rejected</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Class Select */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Class
          </label>
          {initialSchedule || initialClass ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-900">
                {currentClass?.className || 'Selected Class'}
              </span>
              {currentClass?.book && (
                <span className="text-slate-500 ml-2">
                  ({currentClass.book.name} - {currentClass.book.level})
                </span>
              )}
              {currentClass?.teacher && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Teacher: {currentClass.teacher.firstName} {currentClass.teacher.lastName}
                </div>
              )}
            </div>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} {c.teacher ? `(${c.teacher.firstName} ${c.teacher.lastName})` : '(No teacher)'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Day of Week */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Day of Week
          </label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden"
          >
            {WEEK_DAYS.map((d) => (
              <option key={d.dayOfWeek} value={d.dayOfWeek}>
                {d.name} {d.isWeekend ? '(Rest Day - Unavailable)' : d.isPreferredThursday ? '(Preferred Morning)' : ''}
              </option>
            ))}
          </select>
          {dayOfWeek === 5 && (
            <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Notice: Backend policy strictly prohibits Friday schedules.</span>
            </p>
          )}
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Dates Optional */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Starts On (optional)
            </label>
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ends On (optional)
            </label>
            <input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          {initialSchedule && onDeleteSchedule ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xs transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Validating...' : 'Save Schedule'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ManualScheduleModal(props: ManualScheduleModalProps) {
  if (!props.isOpen) return null;

  const contentKey = `${props.initialSchedule?.id || props.initialClass?.id || props.defaultDayOfWeek || 'new'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <ManualScheduleDialogContent key={contentKey} {...props} />
    </div>
  );
}
