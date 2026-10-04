'use client';

import React from 'react';
import type { SchedulingProposal, AcademicTerm } from '../../lib/api-client';
import { STATUS_STYLES } from '../../lib/scheduling-utils';
import { Clock, Eye, CheckCircle2, AlertTriangle, Layers, Calendar } from 'lucide-react';

interface ProposalHistoryProps {
  proposals: SchedulingProposal[];
  terms: AcademicTerm[];
  onSelectProposal: (proposal: SchedulingProposal) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function ProposalHistory({
  proposals,
  terms,
  onSelectProposal,
  onRefresh,
  loading,
}: ProposalHistoryProps) {
  const termMap = new Map<string, AcademicTerm>();
  terms.forEach((t) => termMap.set(t.id, t));

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
            Proposal Archives ({proposals.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {loading ? 'Refreshing...' : 'Refresh History'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-4 py-3">Proposal ID</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Academic Term</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Class Statistics</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No scheduling proposals generated yet. Click &quot;Generate Term Proposal&quot; to begin.
                </td>
              </tr>
            ) : (
              proposals.map((p) => {
                const term = p.academicTermId ? termMap.get(p.academicTermId) : null;
                const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.DRAFT;
                const total = p.data?.classes?.length ?? 0;
                const validCount = p.data?.classes?.filter((c) => c.isValid).length ?? 0;
                const invalidCount = total - validCount;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* ID */}
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {p.id.slice(0, 8)}...
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(p.createdAt).toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Term */}
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {term ? term.name : 'Unspecified Term'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        <span>{p.status.replace(/_/g, ' ')}</span>
                      </span>
                    </td>

                    {/* Class Stats */}
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-2">
                        <span>{total} classes</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-emerald-700 font-medium">
                          {validCount} valid
                        </span>
                        {invalidCount > 0 && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-rose-700 font-medium">
                              {invalidCount} conflicts
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectProposal(p)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1 rounded transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review</span>
                      </button>
                    </td>
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
