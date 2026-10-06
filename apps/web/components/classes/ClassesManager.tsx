'use client';

import React, { useState, useEffect } from 'react';
import {
  apiClient,
  ClassItem,
  AcademicTerm,
  BookItem,
  Teacher,
  BookSegmentItem,
} from '../../lib/api-client';
import { ClassEnrollmentsModal } from './ClassEnrollmentsModal';
import {
  Layers,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Users,
  Calendar,
  BookOpen,
  Filter,
  Play,
  CheckCheck,
  Ban,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface ClassesManagerProps {
  activeTerm: AcademicTerm | null;
  terms: AcademicTerm[];
  onSelectTerm?: (term: AcademicTerm) => void;
  onGoToScheduling?: (classItem: ClassItem) => void;
  isSupervisor?: boolean;
}

export function ClassesManager({
  activeTerm,
  terms,
  onSelectTerm,
  onGoToScheduling,
  isSupervisor = true,
}: ClassesManagerProps) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedTermId, setSelectedTermId] = useState<string>(activeTerm?.id || '');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [rosterClass, setRosterClass] = useState<ClassItem | null>(null);

  // Form states
  const [formTermId, setFormTermId] = useState(activeTerm?.id || '');
  const [formBookId, setFormBookId] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formClassName, setFormClassName] = useState('');
  const [formClassType, setFormClassType] = useState<'REGULAR' | 'PRIVATE'>('REGULAR');
  const [formCapacity, setFormCapacity] = useState(12);

  // Book Segments state for selected Book
  const [availableSegments, setAvailableSegments] = useState<BookSegmentItem[]>([]);
  const [formSegmentId, setFormSegmentId] = useState('');

  const fetchClassesAndMetadata = async () => {
    setLoading(true);
    setError(null);
    try {
      const [classesList, booksList, teachersRes] = await Promise.all([
        apiClient.getClasses({
          academicTermId: selectedTermId || undefined,
          teacherId: selectedTeacherFilter || undefined,
          status: selectedStatusFilter || undefined,
        }),
        apiClient.getBooks(),
        apiClient.getTeachers({ pageSize: 100 }),
      ]);
      setClasses(classesList);
      setBooks(booksList);
      setTeachers(teachersRes.items);
      if (booksList.length > 0 && !formBookId) {
        setFormBookId(booksList[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch classes data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTerm?.id && !selectedTermId) {
      setSelectedTermId(activeTerm.id);
      setFormTermId(activeTerm.id);
    }
  }, [activeTerm?.id]);

  useEffect(() => {
    fetchClassesAndMetadata();
  }, [selectedTermId, selectedTeacherFilter, selectedStatusFilter]);

  // When book changes in form, fetch parts and segments
  useEffect(() => {
    if (!formBookId) {
      setAvailableSegments([]);
      return;
    }
    const loadSegments = async () => {
      try {
        const parts = await apiClient.getBookParts(formBookId);
        if (parts.length > 0) {
          const segmentsArrays = await Promise.all(parts.map((p) => apiClient.getBookSegments(p.id)));
          setAvailableSegments(segmentsArrays.flat());
        } else {
          setAvailableSegments([]);
        }
      } catch (err) {
        console.warn('Failed to load book segments:', err);
      }
    };
    loadSegments();
  }, [formBookId]);

  const openCreateModal = () => {
    setEditingClass(null);
    setFormTermId(selectedTermId || activeTerm?.id || (terms[0]?.id || ''));
    setFormBookId(books[0]?.id || '');
    setFormTeacherId('');
    setFormClassName('');
    setFormClassType('REGULAR');
    setFormCapacity(12);
    setFormSegmentId('');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (classItem: ClassItem) => {
    setEditingClass(classItem);
    setFormTermId(classItem.academicTermId);
    setFormBookId(classItem.bookId);
    setFormTeacherId(classItem.teacherId || '');
    setFormClassName(classItem.className);
    setFormClassType(classItem.classType);
    setFormCapacity(classItem.capacity);
    setFormSegmentId(classItem.bookSegmentId || '');
    setIsCreateModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTermId || !formBookId) {
      setError('Academic term and book are required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (editingClass) {
        await apiClient.updateClass(editingClass.id, {
          teacherId: formTeacherId || null,
          bookSegmentId: formSegmentId || null,
          classType: formClassType,
          capacity: Number(formCapacity),
        });
        setSuccessMsg(`Class "${editingClass.className}" updated successfully.`);
      } else {
        const created = await apiClient.createClass({
          academicTermId: formTermId,
          bookId: formBookId,
          bookSegmentId: formSegmentId || null,
          teacherId: formTeacherId || null,
          className: formClassName.trim() || undefined,
          classType: formClassType,
          capacity: Number(formCapacity),
        });
        setSuccessMsg(`Class "${created.className}" created successfully.`);
      }
      setIsCreateModalOpen(false);
      fetchClassesAndMetadata();
    } catch (err: any) {
      setError(err.message || 'Failed to save class');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (classItem: ClassItem) => {
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.activateClass(classItem.id);
      setSuccessMsg(`Class "${classItem.className}" is now ACTIVE.`);
      fetchClassesAndMetadata();
    } catch (err: any) {
      setError(err.message || 'Failed to activate class');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (classItem: ClassItem) => {
    if (!confirm(`Mark class "${classItem.className}" as COMPLETED?`)) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.completeClass(classItem.id);
      setSuccessMsg(`Class "${classItem.className}" marked as COMPLETED.`);
      fetchClassesAndMetadata();
    } catch (err: any) {
      setError(err.message || 'Failed to complete class');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (classItem: ClassItem) => {
    if (!confirm(`Are you sure you want to CANCEL class "${classItem.className}"?`)) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.cancelClass(classItem.id);
      setSuccessMsg(`Class "${classItem.className}" has been CANCELLED.`);
      fetchClassesAndMetadata();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel class');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ACTIVE
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="h-3 w-3" />
            DRAFT
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <CheckCheck className="h-3 w-3" />
            COMPLETED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Ban className="h-3 w-3" />
            CANCELLED
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Class Sections & Course Management</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Create class sections, assign instructors, manage rosters, and transition class states.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchClassesAndMetadata}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Classes"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isSupervisor && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Create Class Section</span>
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

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Academic Term</label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Academic Terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Instructor</label>
          <select
            value={selectedTeacherFilter}
            onChange={(e) => setSelectedTeacherFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Instructors</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Status</label>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div className="flex items-end justify-between sm:justify-end pb-1 text-xs text-slate-400">
          <span>
            Total Classes: <strong className="text-white">{classes.length}</strong>
          </span>
        </div>
      </div>

      {/* Classes Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading class sections...</span>
          </div>
        ) : classes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Layers className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No Classes Found</p>
            <p className="text-xs text-slate-600 mt-1">Create a class section to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="p-4">Class Name</th>
                  <th className="p-4">Course Book & Level</th>
                  <th className="p-4">Assigned Teacher</th>
                  <th className="p-4">Roster Capacity</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {classes.map((cls) => {
                  const enrolled = cls.enrolledCount || 0;
                  return (
                    <tr key={cls.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4">
                        <div className="font-bold text-white text-sm">{cls.className}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {cls.classType === 'PRIVATE' ? 'Private 1-on-1' : 'Regular Group'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-slate-200">{cls.book?.name || 'Book'}</div>
                        <div className="text-[10px] text-indigo-400 mt-0.5">{cls.book?.level}</div>
                      </td>
                      <td className="p-4">
                        {cls.teacher ? (
                          <span className="font-medium text-slate-200">
                            {cls.teacher.firstName} {cls.teacher.lastName}
                          </span>
                        ) : (
                          <span className="text-amber-400/80 italic text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white">
                            {enrolled} / {cls.capacity}
                          </span>
                          <span className="text-[10px] text-slate-400">students</span>
                        </div>
                        <div className="w-24 bg-slate-950 rounded-full h-1.5 overflow-hidden mt-1 border border-slate-800">
                          <div
                            className={`h-full ${
                              enrolled >= cls.capacity
                                ? 'bg-amber-400'
                                : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, (enrolled / cls.capacity) * 100)}%` }}
                          ></div>
                        </div>
                      </td>
                      <td className="p-4">{getStatusBadge(cls.status)}</td>
                      <td className="p-4 text-right space-x-1.5">
                        <button
                          onClick={() => setRosterClass(cls)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium transition inline-flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          <span>Roster</span>
                        </button>

                        {onGoToScheduling && (
                          <button
                            onClick={() => onGoToScheduling(cls)}
                            className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition inline-flex items-center gap-1"
                            title="Open in Timetable"
                          >
                            <Calendar className="h-3 w-3" />
                            <span>Schedule</span>
                          </button>
                        )}

                        {isSupervisor && (
                          <>
                            <button
                              onClick={() => openEditModal(cls)}
                              disabled={actionLoading}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              title="Edit Class"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            {cls.status === 'DRAFT' && (
                              <button
                                onClick={() => handleActivate(cls)}
                                disabled={actionLoading}
                                className="p-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition"
                                title="Activate Class"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {cls.status === 'ACTIVE' && (
                              <>
                                <button
                                  onClick={() => handleComplete(cls)}
                                  disabled={actionLoading}
                                  className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition"
                                  title="Mark Completed"
                                >
                                  <CheckCheck className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCancel(cls)}
                                  disabled={actionLoading}
                                  className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                                  title="Cancel Class"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </>
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

      {/* Create / Edit Class Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingClass ? 'Edit Class Details' : 'Create New Class Section'}
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Academic Term *</label>
                <select
                  value={formTermId}
                  disabled={!!editingClass}
                  onChange={(e) => setFormTermId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Course Book *</label>
                <select
                  value={formBookId}
                  disabled={!!editingClass}
                  onChange={(e) => setFormBookId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.level})
                    </option>
                  ))}
                </select>
              </div>

              {availableSegments.length > 0 && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Book Segment (Optional)</label>
                  <select
                    value={formSegmentId}
                    onChange={(e) => setFormSegmentId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Full Book Course</option>
                    {availableSegments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assigned Instructor</label>
                <select
                  value={formTeacherId}
                  onChange={(e) => setFormTeacherId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned (Assign later)</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {!editingClass && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Class Section Custom Name</label>
                  <input
                    type="text"
                    value={formClassName}
                    onChange={(e) => setFormClassName(e.target.value)}
                    placeholder="Auto-generated if empty (e.g. Touchstone 1 - A)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Class Type</label>
                  <select
                    value={formClassType}
                    onChange={(e) => setFormClassType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="REGULAR">Regular Group</option>
                    <option value="PRIVATE">Private (1-on-1)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Capacity (Max 15)</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(parseInt(e.target.value) || 12)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
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
                  <span>{editingClass ? 'Save Changes' : 'Create Class'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Class Enrollments Roster Modal */}
      {rosterClass && (
        <ClassEnrollmentsModal
          classItem={rosterClass}
          onClose={() => setRosterClass(null)}
          onEnrollmentChanged={() => fetchClassesAndMetadata()}
          isSupervisor={isSupervisor}
        />
      )}
    </div>
  );
}
