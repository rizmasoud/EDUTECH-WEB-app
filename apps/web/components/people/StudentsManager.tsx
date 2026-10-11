'use client';

import React, { useState, useEffect } from 'react';
import { apiClient, StudentItem, EnrollmentItem } from '../../lib/api-client';
import { formatPersianDate } from '../../../../lib/utils';
import { getClassDisplayName } from '../../lib/scheduling-utils';
import {
  Users,
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Calendar,
} from 'lucide-react';

interface StudentsManagerProps {
  isSupervisor?: boolean;
}

export function StudentsManager({ isSupervisor = true }: StudentsManagerProps) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [inspectingStudent, setInspectingStudent] = useState<StudentItem | null>(null);
  const [studentEnrollments, setStudentEnrollments] = useState<EnrollmentItem[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);

  // Form states
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formShahvarCode, setFormShahvarCode] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getStudents({
        search: search.trim() || undefined,
        page,
        pageSize,
      });
      setStudents(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  const openCreateModal = () => {
    setEditingStudent(null);
    setFormFirstName('');
    setFormLastName('');
    setFormShahvarCode('');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (student: StudentItem) => {
    setEditingStudent(student);
    setFormFirstName(student.firstName);
    setFormLastName(student.lastName);
    setFormShahvarCode(student.shahvarCode || '');
    setFormIsActive(student.isActive);
    setIsModalOpen(true);
  };

  const openInspectModal = async (student: StudentItem) => {
    setInspectingStudent(student);
    setEnrollmentsLoading(true);
    try {
      const enrollments = await apiClient.getStudentEnrollments(student.id);
      setStudentEnrollments(enrollments);
    } catch (err: any) {
      console.error('Failed to load student enrollments:', err);
    } finally {
      setEnrollmentsLoading(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName || !formLastName) {
      setError('First and last name are required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (editingStudent) {
        await apiClient.updateStudent(editingStudent.id, {
          firstName: formFirstName,
          lastName: formLastName,
          shahvarCode: formShahvarCode.trim() || null,
          isActive: formIsActive,
        });
        setSuccessMsg(`Student "${formFirstName} ${formLastName}" updated successfully.`);
      } else {
        await apiClient.createStudent({
          firstName: formFirstName,
          lastName: formLastName,
          shahvarCode: formShahvarCode.trim() || null,
          isActive: formIsActive,
        });
        setSuccessMsg(`Student "${formFirstName} ${formLastName}" registered successfully.`);
      }
      setIsModalOpen(false);
      fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Failed to save student record');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Students Management</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Register students, manage Shahvar external student codes, and inspect class enrollments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Students"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isSupervisor && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Register Student</span>
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

      {/* Filter / Search Bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name or code..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-semibold">{students.length}</span> of{' '}
          <span className="text-white font-semibold">{total}</span> students
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading students roster...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <GraduationCap className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No Students Found</p>
            <p className="text-xs text-slate-600 mt-1">
              {search ? 'Try adjusting your search filter.' : 'Register students to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="p-4">Full Name</th>
                  <th className="p-4">Shahvar Code</th>
                  <th className="p-4">Account Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 font-bold text-white">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="p-4 font-mono text-slate-300">
                      {student.shahvarCode ? (
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                          {student.shahvarCode}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">None</span>
                      )}
                    </td>
                    <td className="p-4">
                      {student.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => openInspectModal(student)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium transition"
                      >
                        Enrollments
                      </button>
                      {isSupervisor && (
                        <button
                          onClick={() => openEditModal(student)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Edit Student"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingStudent ? 'Edit Student Record' : 'Register New Student'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Shahvar Student Code</label>
                <input
                  type="text"
                  value={formShahvarCode}
                  onChange={(e) => setFormShahvarCode(e.target.value)}
                  placeholder="Optional Shahvar ID / External Code"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {editingStudent && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="studentIsActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="studentIsActive" className="text-slate-300 text-xs cursor-pointer">
                    Active Student Status
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  <span>{editingStudent ? 'Save Changes' : 'Register Student'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Student Enrollments Modal */}
      {inspectingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {inspectingStudent.firstName} {inspectingStudent.lastName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Shahvar Code: {inspectingStudent.shahvarCode || 'N/A'} • Enrolled Classes History
                </p>
              </div>
              <button onClick={() => setInspectingStudent(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {enrollmentsLoading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                  <span className="text-xs">Loading enrollment records...</span>
                </div>
              ) : studentEnrollments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/60 rounded-lg border border-slate-800">
                  Student is not currently enrolled in any class.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  {studentEnrollments.map((enr) => (
                    <div key={enr.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                          <span>{getClassDisplayName(enr.class, `Class ID: ${enr.classId.substring(0, 8)}...`)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Enrolled on {formatPersianDate(enr.joinedAt)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          enr.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : enr.status === 'COMPLETED'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {enr.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingStudent(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
