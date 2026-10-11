'use client';

import React, { useState, useEffect } from 'react';
import {
  apiClient,
  ClassItem,
  EnrollmentItem,
  StudentItem,
} from '../../lib/api-client';
import { formatPersianDate } from '../../../../lib/utils';
import { getClassDisplayName } from '../../lib/scheduling-utils';
import {
  Users,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  UserMinus,
  Check,
  Search,
} from 'lucide-react';

interface ClassEnrollmentsModalProps {
  classItem: ClassItem | null;
  onClose: () => void;
  onEnrollmentChanged?: () => void;
  isSupervisor?: boolean;
}

export function ClassEnrollmentsModal({
  classItem,
  onClose,
  onEnrollmentChanged,
  isSupervisor = true,
}: ClassEnrollmentsModalProps) {
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [availableStudents, setAvailableStudents] = useState<StudentItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');

  const fetchEnrollmentsAndStudents = async () => {
    if (!classItem) return;
    setLoading(true);
    setError(null);
    try {
      const [enrollmentRes, studentsRes] = await Promise.all([
        apiClient.getClassEnrollments(classItem.id),
        apiClient.getStudents({ pageSize: 100, isActive: true }),
      ]);
      setEnrollments(enrollmentRes.items);
      setAvailableStudents(studentsRes.items);
      if (studentsRes.items.length > 0 && !selectedStudentId) {
        setSelectedStudentId(studentsRes.items[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch enrollment roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollmentsAndStudents();
  }, [classItem?.id]);

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classItem || !selectedStudentId) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.createEnrollment(classItem.id, {
        studentId: selectedStudentId,
        status: 'ACTIVE',
      });
      setSuccessMsg('Student successfully enrolled in class.');
      await fetchEnrollmentsAndStudents();
      if (onEnrollmentChanged) onEnrollmentChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to enroll student');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to withdraw this student from the class?')) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.withdrawEnrollment(enrollmentId);
      setSuccessMsg('Enrollment marked as WITHDRAWN.');
      await fetchEnrollmentsAndStudents();
      if (onEnrollmentChanged) onEnrollmentChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw student');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (enrollmentId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.completeEnrollment(enrollmentId);
      setSuccessMsg('Enrollment marked as COMPLETED.');
      await fetchEnrollmentsAndStudents();
      if (onEnrollmentChanged) onEnrollmentChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to complete enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  if (!classItem) return null;

  const activeEnrollmentsCount = enrollments.filter((e) => e.status === 'ACTIVE').length;
  const enrolledStudentIds = new Set(enrollments.filter((e) => e.status === 'ACTIVE').map((e) => e.studentId));
  const candidateStudents = availableStudents.filter(
    (s) =>
      !enrolledStudentIds.has(s.id) &&
      (studentSearch === '' ||
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (s.shahvarCode && s.shahvarCode.toLowerCase().includes(studentSearch.toLowerCase())))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">
                Class Roster: {getClassDisplayName(classItem)}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Course: {classItem.book?.name || 'Book'} • Teacher:{' '}
              {classItem.teacher ? `${classItem.teacher.firstName} ${classItem.teacher.lastName}` : 'Unassigned'} •{' '}
              <span className="font-semibold text-emerald-400">
                {activeEnrollmentsCount} / {classItem.capacity} Active Students
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center justify-between">
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
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Enroll Student Form */}
        {isSupervisor && classItem.status !== 'CANCELLED' && classItem.status !== 'COMPLETED' && (
          <form
            onSubmit={handleEnrollStudent}
            className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-indigo-400" />
                Enroll New Student
              </span>
              {activeEnrollmentsCount >= classItem.capacity && (
                <span className="text-[10px] text-amber-400 font-medium">
                  Class is at capacity ({classItem.capacity} max)
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="flex-1 w-full">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a student to enroll...</option>
                  {candidateStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} {s.shahvarCode ? `(${s.shahvarCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading || !selectedStudentId || activeEnrollmentsCount >= classItem.capacity}
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {actionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Enroll</span>
              </button>
            </div>
          </form>
        )}

        {/* Current Roster Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Enrolled Students ({enrollments.length} Total Records)</span>
            <button
              onClick={fetchEnrollmentsAndStudents}
              disabled={loading}
              className="text-slate-400 hover:text-white inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="border border-slate-800 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                <span className="text-xs">Loading roster...</span>
              </div>
            ) : enrollments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40">
                No students enrolled in this class yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Shahvar Code</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Joined Date</th>
                    {isSupervisor && <th className="p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {enrollments.map((enr) => (
                    <tr key={enr.id} className="hover:bg-slate-900/60 transition">
                      <td className="p-3 font-semibold text-white">
                        {enr.student ? `${enr.student.firstName} ${enr.student.lastName}` : `Student ID: ${enr.studentId.substring(0, 8)}`}
                      </td>
                      <td className="p-3 font-mono text-slate-400 text-[11px]">
                        {enr.student?.shahvarCode || '—'}
                      </td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {formatPersianDate(enr.joinedAt)}
                      </td>
                      {isSupervisor && (
                        <td className="p-3 text-right space-x-1">
                          {enr.status === 'ACTIVE' && (
                            <>
                              <button
                                onClick={() => handleComplete(enr.id)}
                                disabled={actionLoading}
                                className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] font-medium transition"
                                title="Mark Completed"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => handleWithdraw(enr.id)}
                                disabled={actionLoading}
                                className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[10px] font-medium transition"
                                title="Withdraw Student"
                              >
                                Withdraw
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs font-semibold"
          >
            Close Roster
          </button>
        </div>
      </div>
    </div>
  );
}
