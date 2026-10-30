'use client';

import React, { useState, useEffect } from 'react';
import { apiClient, AcademicTerm } from '../../lib/api-client';
import { useNotifications } from '../ui/NotificationProvider';
import { InlineError } from '../ui/InlineError';
import { formatPersianDate } from '../../../../lib/utils';
import {
  Calendar,
  Plus,
  Edit2,
  Lock,
  Clock,
  AlertCircle,
  RefreshCw,
  X,
  Play,
  Archive,
} from 'lucide-react';

interface AcademicTermsManagerProps {
  onSelectTerm?: (term: AcademicTerm) => void;
  selectedTermId?: string;
  isSupervisor?: boolean;
}

export function AcademicTermsManager({
  onSelectTerm,
  selectedTermId,
  isSupervisor = true,
}: AcademicTermsManagerProps) {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errors of the create/edit dialog live inside it; `error` is only the list-load failure. A failed
  // activate/close has no dialog, so it is reported as a notification.
  const [formError, setFormError] = useState<string | null>(null);
  const notifier = useNotifications();

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStatus, setFormStatus] = useState<'PLANNED' | 'ACTIVE' | 'CLOSED'>('PLANNED');

  const fetchTerms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getAcademicTerms();
      setTerms(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch academic terms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  const openCreateModal = () => {
    setFormError(null);
    setFormName('');
    setFormStartDate('');
    setFormEndDate('');
    setFormStatus('PLANNED');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (term: AcademicTerm) => {
    setFormError(null);
    setEditingTerm(term);
    setFormName(term.name);
    setFormStartDate(term.startDate);
    setFormEndDate(term.endDate);
    setFormStatus(term.status);
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formStartDate || !formEndDate) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.createAcademicTerm({
        name: formName,
        startDate: formStartDate,
        endDate: formEndDate,
        status: formStatus,
      });
      notifier.success(`Academic term "${formName}" created successfully.`);
      setIsCreateModalOpen(false);
      fetchTerms();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create academic term');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTerm) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.updateAcademicTerm(editingTerm.id, {
        name: formName,
        startDate: formStartDate,
        endDate: formEndDate,
      });
      notifier.success(`Academic term "${formName}" updated successfully.`);
      setEditingTerm(null);
      fetchTerms();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update academic term');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateTerm = async (term: AcademicTerm) => {
    if (!confirm(`Are you sure you want to activate "${term.name}"? Only PLANNED terms can become ACTIVE.`)) {
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.activateAcademicTerm(term.id);
      notifier.success(`Term "${term.name}" is now ACTIVE.`);
      fetchTerms();
    } catch (err: any) {
      notifier.error(err.message || 'Failed to activate academic term');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseTerm = async (term: AcademicTerm) => {
    if (
      !confirm(
        `Are you sure you want to CLOSE "${term.name}"? This is an irreversible lifecycle transition representing historical archival.`
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.closeAcademicTerm(term.id);
      notifier.success(`Term "${term.name}" is now CLOSED.`);
      fetchTerms();
    } catch (err: any) {
      notifier.error(err.message || 'Failed to close academic term');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ACTIVE
          </span>
        );
      case 'PLANNED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="h-3 w-3" />
            PLANNED
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Lock className="h-3 w-3" />
            CLOSED
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Academic Terms Management</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Define academic terms, operational date boundaries, and manage term lifecycles (Planned → Active → Closed).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTerms}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Terms"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isSupervisor && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Create Academic Term</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}


      {/* Terms Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading academic terms...</span>
          </div>
        ) : terms.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Calendar className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No Academic Terms Found</p>
            <p className="text-xs text-slate-600 mt-1">Get started by creating your first academic term.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="p-4">Term Name</th>
                  <th className="p-4">Start Date</th>
                  <th className="p-4">End Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {terms.map((term) => {
                  const isSelected = selectedTermId === term.id;
                  return (
                    <tr
                      key={term.id}
                      className={`hover:bg-slate-800/40 transition ${
                        isSelected ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <td className="p-4 font-bold text-white flex items-center gap-2">
                        <span>{term.name}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                            Current Scope
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-300">{formatPersianDate(term.startDate)}</td>
                      <td className="p-4 text-slate-300">{formatPersianDate(term.endDate)}</td>
                      <td className="p-4">{getStatusBadge(term.status)}</td>
                      <td className="p-4 text-right space-x-2">
                        {onSelectTerm && (
                          <button
                            onClick={() => onSelectTerm(term)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition"
                          >
                            Select
                          </button>
                        )}
                        {isSupervisor && term.status !== 'CLOSED' && (
                          <button
                            onClick={() => openEditModal(term)}
                            disabled={actionLoading}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="Edit Term"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isSupervisor && term.status === 'PLANNED' && (
                          <button
                            onClick={() => handleActivateTerm(term)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition inline-flex items-center gap-1"
                            title="Activate Term"
                          >
                            <Play className="h-3 w-3" />
                            <span>Activate</span>
                          </button>
                        )}
                        {isSupervisor && term.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleCloseTerm(term)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition inline-flex items-center gap-1"
                            title="Close Term (Irreversible)"
                          >
                            <Archive className="h-3 w-3" />
                            <span>Close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Term Modal */}
      {(isCreateModalOpen || editingTerm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingTerm ? 'Edit Academic Term' : 'Create Academic Term'}
              </h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingTerm(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={editingTerm ? handleUpdateTerm : handleCreateTerm} className="space-y-4 text-xs">
              <InlineError message={formError} />
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Term Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Fall 2026, Term 1"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Start Date (YYYY-MM-DD) *</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">End Date (YYYY-MM-DD) *</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {!editingTerm && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PLANNED">PLANNED (Default)</option>
                    <option value="ACTIVE">ACTIVE</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingTerm(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingTerm ? 'Save Changes' : 'Create Term'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
