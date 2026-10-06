'use client';

import React, { useState, useEffect } from 'react';
import { apiClient, Teacher, TeacherSkillItem, BookItem } from '../../lib/api-client';
import {
  GraduationCap,
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Award,
  Trash2,
  DollarSign,
  UserCheck,
} from 'lucide-react';

interface TeachersManagerProps {
  isSupervisor?: boolean;
}

export function TeachersManager({ isSupervisor = true }: TeachersManagerProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
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
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [skillsTeacher, setSkillsTeacher] = useState<Teacher | null>(null);
  const [teacherSkills, setTeacherSkills] = useState<TeacherSkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Form states - Teacher
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formBaseRate, setFormBaseRate] = useState('35.00');
  const [formIsActive, setFormIsActive] = useState(true);

  // Form states - Skill
  const [selectedBookIdForSkill, setSelectedBookIdForSkill] = useState('');

  const fetchTeachersAndBooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const [teachersRes, booksRes] = await Promise.all([
        apiClient.getTeachers({
          search: search.trim() || undefined,
          page,
          pageSize,
        }),
        apiClient.getBooks(),
      ]);
      setTeachers(teachersRes.items);
      setTotal(teachersRes.total);
      setBooks(booksRes);
      if (booksRes.length > 0 && !selectedBookIdForSkill) {
        setSelectedBookIdForSkill(booksRes[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch teachers or books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachersAndBooks();
  }, [page, search]);

  const openCreateModal = () => {
    setEditingTeacher(null);
    setFormFirstName('');
    setFormLastName('');
    setFormBaseRate('35.00');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormFirstName(teacher.firstName);
    setFormLastName(teacher.lastName);
    setFormBaseRate(teacher.baseRate || '35.00');
    setFormIsActive(teacher.isActive);
    setIsModalOpen(true);
  };

  const openSkillsModal = async (teacher: Teacher) => {
    setSkillsTeacher(teacher);
    setSkillsLoading(true);
    try {
      const skills = await apiClient.getTeacherSkills(teacher.id);
      setTeacherSkills(skills);
    } catch (err: any) {
      console.error('Failed to load teacher skills:', err);
    } finally {
      setSkillsLoading(false);
    }
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName || !formLastName) {
      setError('First and last name are required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (editingTeacher) {
        await apiClient.updateTeacher(editingTeacher.id, {
          firstName: formFirstName,
          lastName: formLastName,
          baseRate: formBaseRate,
          isActive: formIsActive,
        });
        setSuccessMsg(`Teacher "${formFirstName} ${formLastName}" updated successfully.`);
      } else {
        await apiClient.createTeacher({
          firstName: formFirstName,
          lastName: formLastName,
          baseRate: formBaseRate,
          isActive: formIsActive,
        });
        setSuccessMsg(`Teacher "${formFirstName} ${formLastName}" registered successfully.`);
      }
      setIsModalOpen(false);
      fetchTeachersAndBooks();
    } catch (err: any) {
      setError(err.message || 'Failed to save teacher');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillsTeacher || !selectedBookIdForSkill) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.addTeacherSkill(skillsTeacher.id, {
        bookId: selectedBookIdForSkill,
      });
      setSuccessMsg(`Skill assigned to ${skillsTeacher.firstName} ${skillsTeacher.lastName}.`);
      const updatedSkills = await apiClient.getTeacherSkills(skillsTeacher.id);
      setTeacherSkills(updatedSkills);
    } catch (err: any) {
      setError(err.message || 'Failed to add teacher skill qualification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!skillsTeacher) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiClient.deleteTeacherSkill(skillsTeacher.id, skillId);
      setSuccessMsg('Skill qualification removed.');
      const updatedSkills = await apiClient.getTeacherSkills(skillsTeacher.id);
      setTeacherSkills(updatedSkills);
    } catch (err: any) {
      setError(err.message || 'Failed to remove skill');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Teachers & Skills Qualification</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage teacher profiles, hourly payroll base rates, and curriculum book skill qualifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTeachersAndBooks}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Teachers"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isSupervisor && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Register Teacher</span>
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
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teachers by name..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-semibold">{teachers.length}</span> of{' '}
          <span className="text-white font-semibold">{total}</span> teachers
        </div>
      </div>

      {/* Teachers Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading teachers list...</span>
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <GraduationCap className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No Teachers Found</p>
            <p className="text-xs text-slate-600 mt-1">Register teachers to begin building your faculty roster.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="p-4">Teacher Name</th>
                  <th className="p-4">Base Hourly Rate</th>
                  <th className="p-4">Account Linked</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 font-bold text-white">
                      {teacher.firstName} {teacher.lastName}
                    </td>
                    <td className="p-4 text-emerald-400 font-mono font-medium">
                      ${parseFloat(teacher.baseRate || '35').toFixed(2)}/hr
                    </td>
                    <td className="p-4">
                      {teacher.accountId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Linked (Login active)</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Unlinked</span>
                      )}
                    </td>
                    <td className="p-4">
                      {teacher.isActive ? (
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
                        onClick={() => openSkillsModal(teacher)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium transition inline-flex items-center gap-1"
                      >
                        <Award className="h-3 w-3" />
                        <span>Skills</span>
                      </button>
                      {isSupervisor && (
                        <button
                          onClick={() => openEditModal(teacher)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Edit Teacher"
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
      </div>

      {/* Create / Edit Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingTeacher ? 'Edit Teacher Record' : 'Register New Teacher'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="space-y-4 text-xs">
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
                <label className="block text-slate-300 font-semibold mb-1">Base Hourly Rate ($) *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={formBaseRate}
                    onChange={(e) => setFormBaseRate(e.target.value)}
                    placeholder="35.00"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {editingTeacher && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="teacherIsActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="teacherIsActive" className="text-slate-300 text-xs cursor-pointer">
                    Active Faculty Status
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
                  <span>{editingTeacher ? 'Save Changes' : 'Register Teacher'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skills Qualification Modal */}
      {skillsTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Skill Qualifications: {skillsTeacher.firstName} {skillsTeacher.lastName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Authorized course books this teacher is qualified to teach.
                </p>
              </div>
              <button onClick={() => setSkillsTeacher(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add Skill Form */}
            {isSupervisor && (
              <form
                onSubmit={handleAddSkill}
                className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center gap-2"
              >
                <div className="flex-1">
                  <select
                    value={selectedBookIdForSkill}
                    onChange={(e) => setSelectedBookIdForSkill(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.level})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedBookIdForSkill}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Assign Skill</span>
                </button>
              </form>
            )}

            {/* Current Skills List */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 block">Assigned Qualifications</span>
              {skillsLoading ? (
                <div className="p-6 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                  <span className="text-xs">Loading skills...</span>
                </div>
              ) : teacherSkills.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800">
                  No skill qualifications assigned yet. Assign a book above.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {teacherSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="p-3 bg-slate-950/40 flex items-center justify-between text-xs hover:bg-slate-950/60"
                    >
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-indigo-400" />
                        <div>
                          <span className="font-semibold text-white">
                            {skill.book?.name || 'Book Skill'}
                          </span>
                          {skill.book?.level && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold border border-indigo-500/20">
                              {skill.book.level}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSupervisor && (
                        <button
                          onClick={() => handleDeleteSkill(skill.id)}
                          disabled={actionLoading}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                          title="Remove Skill Qualification"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSkillsTeacher(null)}
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
