'use client';

import React from 'react';
import type { AcademicTerm, UserAccount } from '../../lib/api-client';
import { Calendar, User, RefreshCw, Eye, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface SchedulingHeaderProps {
  user: UserAccount | null;
  activeTerm: AcademicTerm | null;
  terms: AcademicTerm[];
  onSelectTerm: (term: AcademicTerm) => void;
  onSwitchRole: (role: 'SUPERVISOR' | 'TEACHER') => void;
  onRefresh: () => void;
  loading: boolean;
  totalClasses: number;
  scheduledCount: number;
  unscheduledCount: number;
}

export function SchedulingHeader({
  user,
  activeTerm,
  terms,
  onSelectTerm,
  onSwitchRole,
  onRefresh,
  loading,
  totalClasses,
  scheduledCount,
  unscheduledCount,
}: SchedulingHeaderProps) {
  const isSupervisor = user?.roles.includes('SUPERVISOR');
  const isTeacher = user?.roles.includes('TEACHER') && !isSupervisor;

  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Title and Academic Term Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                  Academic Scheduling
                </h1>
                <span className="text-xs text-slate-500 font-medium">·</span>
                <span className="text-xs font-medium text-slate-600">
                  Phase 5 Timetable Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic candidate generation, conflict validation, and timetable management
              </p>
            </div>
          </div>

          {/* Term Selector */}
          <div className="flex items-center gap-2 sm:ml-4 sm:border-l sm:border-slate-200 sm:pl-4">
            <label htmlFor="term-select" className="text-xs font-medium text-slate-600">
              Term:
            </label>
            <select
              id="term-select"
              value={activeTerm?.id || ''}
              onChange={(e) => {
                const found = terms.find((t) => t.id === e.target.value);
                if (found) onSelectTerm(found);
              }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* User Role & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Metrics summary */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-600 mr-2 border-r border-slate-200 pr-4">
            <span>
              Total: <strong className="text-slate-900">{totalClasses}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Scheduled: <strong>{scheduledCount}</strong></span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-amber-700">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Unscheduled: <strong>{unscheduledCount}</strong></span>
            </span>
          </div>

          {/* Role Indicator & Quick Switcher */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-slate-700">
              {isSupervisor ? (
                <Shield className="h-3.5 w-3.5 text-indigo-600" />
              ) : (
                <User className="h-3.5 w-3.5 text-emerald-600" />
              )}
              <span>{user?.personnelCode || 'User'}</span>
              <span className="text-slate-400">({isSupervisor ? 'Supervisor' : 'Teacher'})</span>
            </div>

            {process.env.NODE_ENV !== 'production' && (
              <button
                type="button"
                onClick={() => onSwitchRole(isSupervisor ? 'TEACHER' : 'SUPERVISOR')}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-slate-900 border border-slate-200 transition-colors"
                title="Toggle role view to verify supervisor workflow vs teacher read-only view"
              >
                <Eye className="h-3 w-3 text-slate-500" />
                <span>{isSupervisor ? 'View as Teacher' : 'Back to Supervisor'}</span>
              </button>
            )}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
}
