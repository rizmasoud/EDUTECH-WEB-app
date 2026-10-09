'use client';

import React, { useState, useEffect } from 'react';
import type { ClassItem, Schedule } from '../../lib/api-client';
import { WEEK_DAYS, getDayShortName } from '../../lib/scheduling-utils';
import {
  Calendar,
  X,
  AlertTriangle,
  Trash2,
  Save,
  Clock,
  Plus,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

export interface WeeklySessionSlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface ManualScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  initialClass?: ClassItem | null;
  initialSchedule?: Schedule | null;
  existingSchedules?: Schedule[];
  defaultDayOfWeek?: number;
  onSaveClassSchedules?: (params: {
    classId: string;
    sessions: WeeklySessionSlot[];
  }) => Promise<void>;
  onDeleteClassSchedules?: (classId: string) => Promise<void>;
  onSaveSchedule?: (data: {
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

function computeNextDay(existingDays: number[], baseDay: number): number {
  // Odd cycle: Sun (0) -> Tue (2) -> Thu (4) -> Sat (6) -> Mon (1) -> Wed (3)
  // Even cycle: Sat (6) -> Mon (1) -> Wed (3) -> Sun (0) -> Tue (2) -> Thu (4)
  const oddSequence = [0, 2, 4, 6, 1, 3];
  const evenSequence = [6, 1, 3, 0, 2, 4];
  const seq = baseDay === 6 || baseDay === 1 || baseDay === 3 ? evenSequence : oddSequence;
  for (const d of seq) {
    if (!existingDays.includes(d)) return d;
  }
  return (baseDay + 1) % 7;
}

function ManualScheduleDialogContent({
  onClose,
  classes,
  initialClass,
  initialSchedule,
  existingSchedules = [],
  defaultDayOfWeek,
  onSaveClassSchedules,
  onDeleteClassSchedules,
  onSaveSchedule,
  onDeleteSchedule,
}: Omit<ManualScheduleModalProps, 'isOpen'>) {
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (initialSchedule) return initialSchedule.classId;
    if (initialClass) return initialClass.id;
    return classes[0]?.id || '';
  });

  // Find all current schedules for selected class
  const classSchedules = existingSchedules.filter((s) => s.classId === selectedClassId);

  // Initialize Sessions per Week and slots
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(() => {
    if (classSchedules.length > 0) return classSchedules.length;
    if (initialSchedule) return 1;
    return 1;
  });

  const [sessions, setSessions] = useState<WeeklySessionSlot[]>(() => {
    if (classSchedules.length > 0) {
      return classSchedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        startsOn: s.startsOn || null,
        endsOn: s.endsOn || null,
      }));
    }
    if (initialSchedule) {
      return [
        {
          id: initialSchedule.id,
          dayOfWeek: initialSchedule.dayOfWeek,
          startTime: initialSchedule.startTime.slice(0, 5),
          endTime: initialSchedule.endTime.slice(0, 5),
          startsOn: initialSchedule.startsOn || null,
          endsOn: initialSchedule.endsOn || null,
        },
      ];
    }
    return [
      {
        dayOfWeek: defaultDayOfWeek !== undefined ? defaultDayOfWeek : 0, // Default to Sunday (0)
        startTime: '17:00',
        endTime: '18:30',
        startsOn: null,
        endsOn: null,
      },
    ];
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentClass = classes.find((c) => c.id === selectedClassId);

  // When class selection changes (if multiple classes allowed)
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    setError(null);
    const related = existingSchedules.filter((s) => s.classId === newClassId);
    if (related.length > 0) {
      setSessionsPerWeek(related.length);
      setSessions(
        related.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime.slice(0, 5),
          endTime: s.endTime.slice(0, 5),
          startsOn: s.startsOn || null,
          endsOn: s.endsOn || null,
        }))
      );
    } else {
      setSessionsPerWeek(1);
      setSessions([
        {
          dayOfWeek: 0, // Sunday
          startTime: '17:00',
          endTime: '18:30',
          startsOn: null,
          endsOn: null,
        },
      ]);
    }
  };

  // Adjust number of sessions per week
  const handleSessionsPerWeekChange = (newCount: number) => {
    const validCount = Math.max(1, Math.min(7, Math.floor(newCount)));
    setSessionsPerWeek(validCount);
    setError(null);

    setSessions((prev) => {
      if (prev.length === validCount) return prev;
      if (prev.length > validCount) {
        // Truncate to new count
        return prev.slice(0, validCount);
      }
      // Expand: generate intelligent subsequent session slots
      const result = [...prev];
      const baseStart = prev[0]?.startTime || '17:00';
      const baseEnd = prev[0]?.endTime || '18:30';
      const baseStartsOn = prev[0]?.startsOn || null;
      const baseEndsOn = prev[0]?.endsOn || null;

      while (result.length < validCount) {
        const existingDays = result.map((s) => s.dayOfWeek);
        const lastDay = result[result.length - 1]?.dayOfWeek ?? 0;
        const nextDay = computeNextDay(existingDays, lastDay);
        result.push({
          dayOfWeek: nextDay,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: baseStartsOn,
          endsOn: baseEndsOn,
        });
      }
      return result;
    });
  };

  // Derived preset active states strictly based on current configured weekly sessions
  const isOddCycleActive = React.useMemo(() => {
    if (sessions.length !== 3) return false;
    const days = new Set(sessions.map((s) => Number(s.dayOfWeek)));
    return days.size === 3 && days.has(0) && days.has(2) && days.has(4);
  }, [sessions]);

  const isEvenCycleActive = React.useMemo(() => {
    if (sessions.length !== 3) return false;
    const days = new Set(sessions.map((s) => Number(s.dayOfWeek)));
    return days.size === 3 && days.has(6) && days.has(1) && days.has(3);
  }, [sessions]);

  // Apply quick schedule presets
  const applyPreset = (pattern: 'ODD' | 'EVEN') => {
    const baseStart = sessions[0]?.startTime || '17:00';
    const baseEnd = sessions[0]?.endTime || '18:30';
    setError(null);

    if (pattern === 'ODD') {
      // Sunday (0), Tuesday (2), Thursday (4)
      setSessionsPerWeek(3);
      setSessions([
        {
          id: sessions[0]?.id,
          dayOfWeek: 0,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
        {
          id: sessions[1]?.id,
          dayOfWeek: 2,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
        {
          id: sessions[2]?.id,
          dayOfWeek: 4,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
      ]);
    } else {
      // Saturday (6), Monday (1), Wednesday (3)
      setSessionsPerWeek(3);
      setSessions([
        {
          id: sessions[0]?.id,
          dayOfWeek: 6,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
        {
          id: sessions[1]?.id,
          dayOfWeek: 1,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
        {
          id: sessions[2]?.id,
          dayOfWeek: 3,
          startTime: baseStart,
          endTime: baseEnd,
          startsOn: sessions[0]?.startsOn,
          endsOn: sessions[0]?.endsOn,
        },
      ]);
    }
  };

  const handleUpdateSession = (
    index: number,
    field: keyof WeeklySessionSlot,
    value: any
  ) => {
    setSessions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveSession = (index: number) => {
    if (sessions.length <= 1) return;
    setSessions((prev) => prev.filter((_, i) => i !== index));
    setSessionsPerWeek((prev) => Math.max(1, prev - 1));
  };

  const handleAddSession = () => {
    if (sessions.length >= 7) return;
    handleSessionsPerWeekChange(sessions.length + 1);
  };

  const validateSessions = (): string | null => {
    if (!selectedClassId) return 'Please select a class.';
    if (sessions.length === 0) return 'At least one session is required.';

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s.startTime || !s.endTime) {
        return `Session ${i + 1}: Start time and End time are required.`;
      }
      if (s.startTime >= s.endTime) {
        return `Session ${i + 1}: End time (${s.endTime}) must be strictly after start time (${s.startTime}).`;
      }
    }

    // Check for internal collisions within the same class
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const s1 = sessions[i];
        const s2 = sessions[j];
        if (s1.dayOfWeek === s2.dayOfWeek) {
          // Check time overlap: (start1 < end2) && (start2 < end1)
          if (s1.startTime < s2.endTime && s2.startTime < s1.endTime) {
            return `Session ${i + 1} and Session ${j + 1} conflict: overlapping schedule slots on the same day.`;
          }
        }
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateSessions();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (onSaveClassSchedules) {
        await onSaveClassSchedules({
          classId: selectedClassId,
          sessions,
        });
      } else if (onSaveSchedule) {
        // Fallback for single-slot handler
        for (const s of sessions) {
          await onSaveSchedule({
            scheduleId: s.id,
            classId: selectedClassId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            startsOn: s.startsOn || null,
            endsOn: s.endsOn || null,
          });
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save class schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to remove all weekly schedule slots for this class?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (onDeleteClassSchedules) {
        await onDeleteClassSchedules(selectedClassId);
      } else if (onDeleteSchedule) {
        for (const s of classSchedules) {
          await onDeleteSchedule(s.id);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete class schedule');
    } finally {
      setLoading(false);
    }
  };

  const hasFriday = sessions.some((s) => s.dayOfWeek === 5);

  return (
    <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
      {/* Modal Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shadow-2xs">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {classSchedules.length > 0 ? 'Edit Weekly Schedule' : 'Configure Weekly Schedule'}
            </h2>
            <p className="text-xs text-slate-500">
              Define recurring weekly session slots and times for this class
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
            <div>
              <p className="font-semibold">Schedule Validation Error</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Target Class Info / Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Class
          </label>
          {initialClass ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">
                  {currentClass?.className || 'Selected Class'}
                </span>
                {currentClass?.book && (
                  <span className="text-slate-500 ml-2">
                    ({currentClass.book.name} - {currentClass.book.level})
                  </span>
                )}
                {currentClass?.teacher && (
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Assigned Teacher: {currentClass.teacher.firstName} {currentClass.teacher.lastName}
                  </div>
                )}
              </div>
              {currentClass?.classType === 'PRIVATE' && (
                <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                  Private
                </span>
              )}
            </div>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} {c.teacher ? `(${c.teacher.firstName} ${c.teacher.lastName})` : '(No teacher)'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2 Requirement: Sessions per Week explicitly defined */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label
                htmlFor="sessions-per-week"
                className="block text-xs font-bold text-slate-800"
              >
                Sessions per Week
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Number of recurring sessions held each week (1–7)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSessionsPerWeekChange(sessionsPerWeek - 1)}
                disabled={sessionsPerWeek <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition"
                title="Decrease sessions per week"
              >
                –
              </button>

              <select
                id="sessions-per-week"
                value={sessionsPerWeek}
                onChange={(e) => handleSessionsPerWeekChange(Number(e.target.value))}
                className="h-8 rounded-md border border-indigo-300 bg-white px-3 text-xs font-bold text-indigo-700 shadow-2xs focus:border-indigo-600 focus:outline-hidden"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'session / week' : 'sessions / week'}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleSessionsPerWeekChange(sessionsPerWeek + 1)}
                disabled={sessionsPerWeek >= 7}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition"
                title="Increase sessions per week"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick cycle preset helpers */}
          <div className="pt-2 border-t border-indigo-100/80 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-indigo-900/70 uppercase tracking-wider">
              Common Patterns:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('ODD')}
              aria-pressed={isOddCycleActive}
              data-active={isOddCycleActive ? 'true' : 'false'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                isOddCycleActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs border border-indigo-700 hover:bg-indigo-700'
                  : 'bg-white text-slate-700 font-medium border border-slate-300 hover:bg-slate-50 hover:border-slate-400'
              }`}
            >
              <Sparkles className={`w-3 h-3 ${isOddCycleActive ? 'text-indigo-200' : 'text-slate-400'}`} />
              <span>Odd Cycle (Sun / Tue / Thu · 3x)</span>
              {isOddCycleActive && (
                <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-white shadow-2xs" />
              )}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('EVEN')}
              aria-pressed={isEvenCycleActive}
              data-active={isEvenCycleActive ? 'true' : 'false'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                isEvenCycleActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs border border-indigo-700 hover:bg-indigo-700'
                  : 'bg-white text-slate-700 font-medium border border-slate-300 hover:bg-slate-50 hover:border-slate-400'
              }`}
            >
              <Sparkles className={`w-3 h-3 ${isEvenCycleActive ? 'text-indigo-200' : 'text-slate-400'}`} />
              <span>Even Cycle (Sat / Mon / Wed · 3x)</span>
              {isEvenCycleActive && (
                <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-white shadow-2xs" />
              )}
            </button>
          </div>
        </div>

        {/* Step 3 Requirement: Weekly Schedule Slot Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Weekly Schedule Slots ({sessions.length})</span>
            </h3>
            {sessions.length < 7 && (
              <button
                type="button"
                onClick={handleAddSession}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Session</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {sessions.map((session, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-200 bg-slate-50/40 p-3.5 space-y-3 transition-colors hover:border-slate-300"
              >
                {/* Session Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                      Session {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {WEEK_DAYS.find((d) => d.dayOfWeek === session.dayOfWeek)?.name ||
                        `Day ${session.dayOfWeek}`}
                    </span>
                  </div>

                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSession(index)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                      title={`Remove Session ${index + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Session Form Inputs: Day of Week, Start Time, End Time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Day of Week */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Day of Week
                    </label>
                    <select
                      value={session.dayOfWeek}
                      onChange={(e) =>
                        handleUpdateSession(index, 'dayOfWeek', Number(e.target.value))
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                    >
                      {WEEK_DAYS.map((d) => (
                        <option key={d.dayOfWeek} value={d.dayOfWeek}>
                          {d.name}{' '}
                          {d.isWeekend
                            ? '(Rest Day)'
                            : d.isPreferredThursday
                            ? '(Preferred)'
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Start Time */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={session.startTime}
                      onChange={(e) =>
                        handleUpdateSession(index, 'startTime', e.target.value)
                      }
                      required
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden font-mono"
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={session.endTime}
                      onChange={(e) =>
                        handleUpdateSession(index, 'endTime', e.target.value)
                      }
                      required
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden font-mono"
                    />
                  </div>
                </div>

                {session.dayOfWeek === 5 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Friday is institute rest day and requires exception policy.</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Optional Term Date Range */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Effective Starts On (optional)
            </label>
            <input
              type="date"
              value={sessions[0]?.startsOn || ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setSessions((prev) => prev.map((s) => ({ ...s, startsOn: val })));
              }}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Effective Ends On (optional)
            </label>
            <input
              type="date"
              value={sessions[0]?.endsOn || ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setSessions((prev) => prev.map((s) => ({ ...s, endsOn: val })));
              }}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs"
            />
          </div>
        </div>
      </form>

      {/* Modal Actions Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/70 shrink-0">
        {classSchedules.length > 0 && (onDeleteClassSchedules || onDeleteSchedule) ? (
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Slots</span>
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {loading
                ? 'Saving Slots...'
                : `Save Weekly Schedule (${sessions.length} Session${sessions.length > 1 ? 's' : ''})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualScheduleModal(props: ManualScheduleModalProps) {
  if (!props.isOpen) return null;

  const contentKey = `${props.initialClass?.id || props.initialSchedule?.id || props.defaultDayOfWeek || 'new'}-${(props.existingSchedules || []).length}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <ManualScheduleDialogContent key={contentKey} {...props} />
    </div>
  );
}
