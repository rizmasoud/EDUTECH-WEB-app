'use client';

import React, { useState } from 'react';
import type { SchedulingProposal, ClassItem, ProposedClassSlot } from '../../lib/api-client';
import {
  WEEK_DAYS,
  getDayName,
  getDayShortName,
  formatTimeRange,
  getConflictInfo,
  STATUS_STYLES,
} from '../../lib/scheduling-utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  BookOpen,
  Calendar,
  Check,
  RefreshCw,
  Edit2,
  Save,
  X,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

interface ProposalReviewPanelProps {
  proposal: SchedulingProposal;
  classes: ClassItem[];
  onValidate: (id: string) => Promise<void>;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onModifySlot: (
    proposalId: string,
    slotData: { classId: string; dayOfWeek: number; startTime: string; endTime: string }
  ) => Promise<void>;
  onClose: () => void;
  isActionLoading: boolean;
}

export function ProposalReviewPanel({
  proposal,
  classes,
  onValidate,
  onAccept,
  onReject,
  onModifySlot,
  onClose,
  isActionLoading,
}: ProposalReviewPanelProps) {
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editDayOfWeek, setEditDayOfWeek] = useState<number>(6);
  const [editStartTime, setEditStartTime] = useState<string>('08:30');
  const [editEndTime, setEditEndTime] = useState<string>('10:00');
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    validatedAt: string;
  } | null>(null);

  const classMap = new Map<string, ClassItem>();
  classes.forEach((c) => classMap.set(c.id, c));

  const statusStyle = STATUS_STYLES[proposal.status] || STATUS_STYLES.DRAFT;
  const isTerminal = proposal.status === 'ACCEPTED' || proposal.status === 'REJECTED';
  const allValid = proposal.data.classes.every((c) => c.isValid);

  const startEditing = (proposed: ProposedClassSlot) => {
    setEditingClassId(proposed.classId);
    setEditDayOfWeek(proposed.dayOfWeek);
    setEditStartTime(proposed.startTime.slice(0, 5));
    setEditEndTime(proposed.endTime.slice(0, 5));
    setModifyError(null);
  };

  const handleSaveSlot = async (classId: string) => {
    setModifyError(null);
    try {
      await onModifySlot(proposal.id, {
        classId,
        dayOfWeek: Number(editDayOfWeek),
        startTime: editStartTime,
        endTime: editEndTime,
      });
      setEditingClassId(null);
    } catch (err: any) {
      setModifyError(err?.message || 'Failed to modify slot suggestion');
    }
  };

  const handleValidateClick = async () => {
    setValidationResult(null);
    await onValidate(proposal.id);
    setValidationResult({
      isValid: proposal.data.classes.every((c) => c.isValid),
      validatedAt: new Date().toLocaleTimeString(),
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden space-y-0">
      {/* Top Banner & Header */}
      <div className="border-b border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                <span>{proposal.status.replace(/_/g, ' ')}</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 font-mono">
                ID: {proposal.id.slice(0, 8)}...
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                Created: {new Date(proposal.createdAt).toLocaleString()}
              </span>
            </div>

            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Scheduling Proposal Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review generated candidate slots, inspect detected conflicts, and accept or reject.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isTerminal && (
              <>
                {/* Validate Button */}
                <button
                  type="button"
                  onClick={handleValidateClick}
                  disabled={isActionLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs disabled:opacity-50 transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-slate-500 ${
                      isActionLoading ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Re-Validate</span>
                </button>

                {/* Reject Button */}
                <button
                  type="button"
                  onClick={() => onReject(proposal.id)}
                  disabled={isActionLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                {/* Accept Button */}
                <button
                  type="button"
                  onClick={() => onAccept(proposal.id)}
                  disabled={isActionLoading || !allValid}
                  title={!allValid ? 'All proposed classes must be valid before acceptance' : ''}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Accept Proposal</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-slate-600"
              title="Close proposal view"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Counters & Validation Notice */}
        <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-600">
              Total Proposed:{' '}
              <strong className="text-slate-900">{proposal.data.classes.length}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-emerald-700 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>
                Valid:{' '}
                <strong>
                  {proposal.data.classes.filter((c) => c.isValid).length}
                </strong>
              </span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-rose-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Conflicts:{' '}
                <strong>
                  {proposal.data.classes.filter((c) => !c.isValid).length}
                </strong>
              </span>
            </span>
          </div>

          {validationResult && (
            <div className="text-[11px] text-indigo-700 flex items-center gap-1">
              <span>Verified at {validationResult.validatedAt}:</span>
              <strong>{validationResult.isValid ? 'All slots clean' : 'Conflicts detected'}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Terminal State Info Banners */}
      {proposal.status === 'ACCEPTED' && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            This proposal has been <strong>ACCEPTED</strong> and committed to the official database.
            Class schedules have been updated and are reflected in the active weekly timetable.
          </span>
        </div>
      )}

      {proposal.status === 'REJECTED' && (
        <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 text-xs text-rose-800 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            This proposal was <strong>REJECTED</strong>. No database schedule changes were applied.
          </span>
        </div>
      )}

      {/* Conflict / Modification Alert if any error */}
      {modifyError && (
        <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{modifyError}</span>
        </div>
      )}

      {/* Proposed Classes List */}
      <div className="divide-y divide-slate-100">
        {proposal.data.classes.map((proposed) => {
          const cls = classMap.get(proposed.classId);
          const isEditing = editingClassId === proposed.classId;

          return (
            <div
              key={proposed.classId}
              className={`p-4 transition-colors ${
                !proposed.isValid ? 'bg-rose-50/20' : 'hover:bg-slate-50/40'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                {/* Class Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">
                      {cls?.className || `Class ID: ${proposed.classId.slice(0, 8)}`}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded ${
                        proposed.isValid
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {proposed.isValid ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Slot Valid</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          <span>Conflicted</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    {cls?.book && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {cls.book.name} ({cls.book.level})
                        </span>
                      </span>
                    )}
                    {cls?.teacher && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {cls.teacher.firstName} {cls.teacher.lastName}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Proposed Slot & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {!isEditing ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{getDayName(proposed.dayOfWeek)}</span>
                        <span className="text-slate-400">·</span>
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatTimeRange(proposed.startTime, proposed.endTime)}</span>
                      </div>

                      {!isTerminal && (
                        <button
                          type="button"
                          onClick={() => startEditing(proposed)}
                          disabled={isActionLoading}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition-colors"
                          title="Modify suggested slot"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Inline Slot Editor */
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 text-xs">
                      {/* Day select */}
                      <select
                        value={editDayOfWeek}
                        onChange={(e) => setEditDayOfWeek(Number(e.target.value))}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                      >
                        {WEEK_DAYS.filter((d) => !d.isWeekend).map((d) => (
                          <option key={d.dayOfWeek} value={d.dayOfWeek}>
                            {d.name}
                          </option>
                        ))}
                      </select>

                      {/* Start Time */}
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
                      />
                      <span className="text-slate-400">to</span>
                      {/* End Time */}
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
                      />

                      <button
                        type="button"
                        onClick={() => handleSaveSlot(proposed.classId)}
                        disabled={isActionLoading}
                        className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingClassId(null)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Conflict details if any */}
              {proposed.conflicts && proposed.conflicts.length > 0 && (
                <div className="mt-2.5 rounded-md border border-rose-200 bg-rose-50/60 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    <span>Engine Conflict Explanations:</span>
                  </div>
                  <div className="space-y-1 pl-5">
                    {proposed.conflicts.map((conf, idx) => {
                      const info = getConflictInfo(conf.code);
                      return (
                        <div key={idx} className="text-[11px] text-rose-800">
                          <span className="font-semibold">{info.label}:</span>{' '}
                          <span>{conf.explanation || info.description}</span>
                          {conf.conflictingEntityId && (
                            <span className="text-rose-600 ml-1 font-mono text-[10px]">
                              [ref: {conf.conflictingEntityId.slice(0, 8)}]
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
