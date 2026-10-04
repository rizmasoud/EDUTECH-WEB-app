'use client';

import React, { useState } from 'react';
import type { AcademicTerm, ClassItem } from '../../lib/api-client';
import { Sparkles, X, AlertTriangle, ShieldCheck, Check, Info } from 'lucide-react';

interface ProposalGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTerm: AcademicTerm | null;
  selectedClassIds: string[];
  classes: ClassItem[];
  onGenerate: (params: {
    academicTermId?: string;
    classIds?: string[];
    allowFriday: boolean;
  }) => Promise<void>;
}

export function ProposalGeneratorModal({
  isOpen,
  onClose,
  activeTerm,
  selectedClassIds,
  classes,
  onGenerate,
}: ProposalGeneratorModalProps) {
  const [allowFriday, setAllowFriday] = useState(false);
  const [mode, setMode] = useState<'TERM' | 'SELECTED'>(
    selectedClassIds.length > 0 ? 'SELECTED' : 'TERM'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'SELECTED' && selectedClassIds.length === 0) {
        throw new Error('Please select at least one class or switch to Full Term mode.');
      }

      await onGenerate({
        academicTermId: mode === 'TERM' ? activeTerm?.id : undefined,
        classIds: mode === 'SELECTED' ? selectedClassIds : undefined,
        allowFriday,
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate proposal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Generate Scheduling Proposal
              </h2>
              <p className="text-xs text-slate-500">
                Deterministic candidate engine with hard & soft constraint checks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <div>
                <p className="font-semibold">Generation Failed</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Scope Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Target Scope
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('TERM')}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  mode === 'TERM'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-semibold text-slate-900">
                  Full Academic Term
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {activeTerm ? activeTerm.name : 'Active Term'} ({classes.length} classes)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode('SELECTED')}
                disabled={selectedClassIds.length === 0}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  selectedClassIds.length === 0
                    ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                    : mode === 'SELECTED'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-semibold text-slate-900">
                  Selected Classes Only
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {selectedClassIds.length > 0
                    ? `${selectedClassIds.length} classes chosen`
                    : 'No classes selected'}
                </span>
              </button>
            </div>
          </div>

          {/* Selected classes list preview if in SELECTED mode */}
          {mode === 'SELECTED' && selectedClasses.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 max-h-28 overflow-y-auto space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                Included Classes:
              </span>
              {selectedClasses.map((c) => (
                <div key={c.id} className="text-xs text-slate-700 flex items-center justify-between">
                  <span className="font-medium">{c.className}</span>
                  <span className="text-slate-400 text-[10px]">
                    {c.book ? `${c.book.name} (${c.book.level})` : 'No book'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Friday Policy Toggle */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowFriday}
                onChange={(e) => setAllowFriday(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-900 block">
                  Permit Friday Scheduling
                </span>
                <span className="text-slate-500 text-[11px] block mt-0.5 leading-relaxed">
                  By default, Friday is designated as institute rest day and rejected by constraint
                  policies. Check this only for exceptional weekend workshops.
                </span>
              </div>
            </label>
          </div>

          {/* Business Rules Explanation Card */}
          <div className="rounded-lg bg-indigo-50/50 border border-indigo-100 p-3 text-[11px] text-indigo-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Automated Constraint Validation</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-indigo-800 text-[10.5px]">
              <li>Zero teacher double-booking across concurrent classes</li>
              <li>Zero enrolled student overlapping session commitments</li>
              <li>Verification of teacher skill credentials against assigned book level</li>
              <li>Adherence to odd-day (Sat/Mon/Wed) & even-day (Sun/Tue) cadence</li>
              <li>Preferential placement of single sessions in Thursday morning slots</li>
            </ul>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating Slots...' : 'Generate Proposal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
