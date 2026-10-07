'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import type {
  UserAccount,
  AcademicTerm,
  ClassItem,
  Schedule,
  SchedulingProposal,
} from '../lib/api-client';
import { SchedulingHeader } from '../components/scheduling/SchedulingHeader';
import { WeeklyTimetable } from '../components/scheduling/WeeklyTimetable';
import { ClassesOverview } from '../components/scheduling/ClassesOverview';
import { ProposalGeneratorModal } from '../components/scheduling/ProposalGeneratorModal';
import { ProposalReviewPanel } from '../components/scheduling/ProposalReviewPanel';
import { ManualScheduleModal } from '../components/scheduling/ManualScheduleModal';
import { ProposalHistory } from '../components/scheduling/ProposalHistory';
import { TeacherScheduleView } from '../components/scheduling/TeacherScheduleView';
import { AcademicTermsManager } from '../components/academic/AcademicTermsManager';
import { BooksManager } from '../components/academic/BooksManager';
import { StudentsManager } from '../components/people/StudentsManager';
import { TeachersManager } from '../components/people/TeachersManager';
import { ClassesManager } from '../components/classes/ClassesManager';
import {
  Calendar,
  Layers,
  Sparkles,
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Plus,
  BookOpen,
  Users,
  GraduationCap,
  LayoutGrid,
  X,
  Shield,
  LogOut,
} from 'lucide-react';

export default function SchedulingAppPage() {
  // Authentication & Role State - RBAC strictly derived from authenticated session
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginPersonnelCode, setLoginPersonnelCode] = useState('SUP-01');
  const [loginPassword, setLoginPassword] = useState('SupervisorPass123!');
  const [authError, setAuthError] = useState<string | null>(null);

  // Main Section Navigation
  const [mainSection, setMainSection] = useState<
    'SCHEDULING' | 'TERMS' | 'BOOKS' | 'STUDENTS' | 'TEACHERS' | 'CLASSES'
  >('CLASSES');

  // Academic Reference & Entity State
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [proposals, setProposals] = useState<SchedulingProposal[]>([]);
  const [activeProposal, setActiveProposal] = useState<SchedulingProposal | null>(null);

  // UI Navigation State (Scheduling Subtabs)
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'TIMETABLE' | 'PROPOSAL' | 'ARCHIVE' | 'HEALTH'
  >('OVERVIEW');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Modals State
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualModalClass, setManualModalClass] = useState<ClassItem | null>(null);
  const [manualModalSchedule, setManualModalSchedule] = useState<Schedule | null>(null);
  const [manualModalDay, setManualModalDay] = useState<number | undefined>(undefined);

  // Health State (Preserving Phase 0)
  const [healthStatus, setHealthStatus] = useState<any>(null);

  // Flash notification helper
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Real Authentication Logout
  const handleLogout = async () => {
    setLoading(true);
    try {
      await apiClient.logout();
      setCurrentUser(null);
      setIsLoginModalOpen(true);
      showNotification('info', 'Logged out successfully.');
    } catch {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Real Authentication Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPersonnelCode || !loginPassword) {
      setAuthError('Please enter both personnel code and password.');
      return;
    }
    setActionLoading(true);
    setAuthError(null);
    try {
      const res = await apiClient.login(loginPersonnelCode, loginPassword);
      setCurrentUser(res.account);
      setIsLoginModalOpen(false);
      showNotification('success', `Signed in as ${res.account.personnelCode} (${res.account.roles.join(', ')}).`);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setActionLoading(false);
    }
  };

  // Initial Authentication & Session Setup
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      setAuthLoading(true);
      try {
        const me = await apiClient.getMe();
        if (isMounted) {
          setCurrentUser(me);
        }
      } catch {
        // Attempt default Supervisor login for seamless dev/testing
        try {
          const res = await apiClient.login('SUP-01', 'SupervisorPass123!');
          if (isMounted) {
            setCurrentUser(res.account);
          }
        } catch {
          if (isMounted) {
            setCurrentUser(null);
            setIsLoginModalOpen(true);
          }
        }
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch all domain data
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Terms
      const termsList = await apiClient.getAcademicTerms();
      setTerms(termsList);

      const chosenTerm =
        activeTerm && termsList.find((t) => t.id === activeTerm.id)
          ? activeTerm
          : termsList.find((t) => t.status === 'ACTIVE') || termsList[0] || null;
      setActiveTerm(chosenTerm);

      // 2. Fetch Classes for Term
      const classesList = await apiClient.getClasses({
        academicTermId: chosenTerm?.id,
      });
      setClasses(classesList);

      // 3. Fetch Schedules
      const schedulesList = await apiClient.getSchedules();
      setSchedules(schedulesList);

      // 4. Fetch Proposals
      const proposalsList = await apiClient.getProposals({
        academicTermId: chosenTerm?.id,
      });
      setProposals(proposalsList);

      // If active proposal exists, update it with fresh data
      if (activeProposal) {
        const fresh = proposalsList.find((p) => p.id === activeProposal.id);
        if (fresh) setActiveProposal(fresh);
      }

      // 5. Query health endpoint
      try {
        const hRes = await fetch('/api/health');
        if (hRes.ok) setHealthStatus(await hRes.json());
      } catch {
        // ignore
      }
    } catch (err: any) {
      showNotification('error', `Failed to load scheduling data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [activeTerm, activeProposal]);

  // Load data once auth is ready
  useEffect(() => {
    if (!authLoading) {
      refreshData();
    }
  }, [authLoading, refreshData]);

  // Handle Academic Term Change
  const handleSelectTerm = async (term: AcademicTerm) => {
    setActiveTerm(term);
    setSelectedClassIds([]);
    setLoading(true);
    try {
      const [termClasses, termProposals] = await Promise.all([
        apiClient.getClasses({ academicTermId: term.id }),
        apiClient.getProposals({ academicTermId: term.id }),
      ]);
      setClasses(termClasses);
      setProposals(termProposals);
      setActiveProposal(termProposals[0] || null);
    } catch (err: any) {
      showNotification('error', `Failed to load data for term: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Class selection for proposal generation
  const handleToggleSelectClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllClasses = (all: boolean) => {
    if (all) {
      setSelectedClassIds(classes.map((c) => c.id));
    } else {
      setSelectedClassIds([]);
    }
  };

  // Proposal Generation Handler
  const handleGenerateProposal = async (params: {
    academicTermId?: string;
    classIds?: string[];
    allowFriday: boolean;
  }) => {
    setActionLoading(true);
    try {
      const newProposal = await apiClient.generateProposal(params);
      setActiveProposal(newProposal);
      setActiveTab('PROPOSAL');
      showNotification(
        'success',
        `Proposal generated successfully! Evaluated ${newProposal.data.classes.length} classes (${newProposal.data.validClassesCount} valid, ${newProposal.data.invalidClassesCount} conflicted).`
      );
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Generation failed: ${err.message}`);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Proposal Validation Handler
  const handleValidateProposal = async (proposalId: string) => {
    setActionLoading(true);
    try {
      const res = await apiClient.validateProposal(proposalId);
      // Re-fetch proposal
      const updated = await apiClient.getProposalById(proposalId);
      setActiveProposal(updated);
      showNotification(
        res.isValid ? 'success' : 'info',
        res.isValid
          ? 'Proposal revalidated cleanly! All proposed slots meet constraints.'
          : `Revalidation complete: ${res.conflicts.length} conflict(s) detected.`
      );
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Validation check failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Proposal Acceptance Handler
  const handleAcceptProposal = async (proposalId: string) => {
    setActionLoading(true);
    try {
      const res = await apiClient.acceptProposal(proposalId);
      showNotification(
        'success',
        `Proposal ACCEPTED! ${res.createdSchedulesCount} schedule slot(s) committed to the database.`
      );
      // Update proposal state
      const updated = await apiClient.getProposalById(proposalId);
      setActiveProposal(updated);
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Failed to accept proposal: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Proposal Rejection Handler
  const handleRejectProposal = async (proposalId: string) => {
    setActionLoading(true);
    try {
      const res = await apiClient.rejectProposal(proposalId);
      setActiveProposal(res);
      showNotification('info', 'Proposal marked as REJECTED.');
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Failed to reject proposal: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Proposal Slot Modification Handler
  const handleModifySlot = async (
    proposalId: string,
    slotData: { classId: string; dayOfWeek: number; startTime: string; endTime: string }
  ) => {
    setActionLoading(true);
    try {
      const updated = await apiClient.modifyProposal(proposalId, slotData);
      setActiveProposal(updated);
      showNotification(
        'success',
        `Slot modified! Proposal updated to status ${updated.status}.`
      );
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Slot modification failed: ${err.message}`);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Manual Schedule Save Handler
  const handleSaveManualSchedule = async (data: {
    scheduleId?: string;
    classId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startsOn?: string | null;
    endsOn?: string | null;
  }) => {
    if (data.scheduleId) {
      await apiClient.updateSchedule(data.scheduleId, {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
      });
      showNotification('success', 'Class schedule updated successfully.');
    } else {
      await apiClient.createSchedule({
        classId: data.classId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
      });
      showNotification('success', 'New schedule slot created successfully.');
    }
    await refreshData();
  };

  // Manual Schedule Delete Handler
  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (!confirm('Are you sure you want to remove this schedule slot?')) return;
    try {
      await apiClient.deleteSchedule(schedule.id);
      showNotification('success', 'Schedule slot removed.');
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Failed to delete schedule: ${err.message}`);
    }
  };

  // Open manual schedule modal helpers
  const handleOpenManualFromOverview = (cls: ClassItem, sched?: Schedule) => {
    setManualModalClass(cls);
    setManualModalSchedule(sched || null);
    setManualModalDay(undefined);
    setIsManualModalOpen(true);
  };

  const handleOpenManualFromTimetable = (dayOfWeek?: number) => {
    setManualModalClass(null);
    setManualModalSchedule(null);
    setManualModalDay(dayOfWeek);
    setIsManualModalOpen(true);
  };

  const handleEditFromTimetable = (schedule: Schedule, cls?: ClassItem) => {
    setManualModalClass(cls || null);
    setManualModalSchedule(schedule);
    setManualModalDay(schedule.dayOfWeek);
    setIsManualModalOpen(true);
  };

  // Derived counts
  const scheduledClassIds = new Set(schedules.map((s) => s.classId));
  const scheduledCount = classes.filter((c) => scheduledClassIds.has(c.id)).length;
  const unscheduledCount = classes.length - scheduledCount;
  const isSupervisor = currentUser?.roles?.includes('SUPERVISOR') ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. Header with Role & Stats */}
      <SchedulingHeader
        user={currentUser}
        activeTerm={activeTerm}
        terms={terms}
        onSelectTerm={handleSelectTerm}
        onLogout={handleLogout}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onRefresh={refreshData}
        loading={loading}
        totalClasses={classes.length}
        scheduledCount={scheduledCount}
        unscheduledCount={unscheduledCount}
      />

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-xs font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
          {notification.type === 'info' && <Clock className="w-4 h-4 text-indigo-600" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* If in Teacher Role: display specialized Teacher Schedule View */}
        {!isSupervisor ? (
          <TeacherScheduleView
            user={currentUser}
            classes={classes}
            schedules={schedules}
          />
        ) : (
          /* Supervisor Workflow View */
          <div className="space-y-6">
            {/* Top-Level Domain Section Navigation */}
            <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
              <nav className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMainSection('CLASSES')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'CLASSES'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Classes & Rosters</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      mainSection === 'CLASSES' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {classes.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainSection('TERMS')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'TERMS'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Academic Terms</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainSection('BOOKS')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'BOOKS'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Books & Curriculum</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainSection('STUDENTS')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'STUDENTS'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Students</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainSection('TEACHERS')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'TEACHERS'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Teachers & Skills</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainSection('SCHEDULING')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                    mainSection === 'SCHEDULING'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Timetable Engine</span>
                </button>
              </nav>
            </div>

            {/* View 1: Academic Terms */}
            {mainSection === 'TERMS' && (
              <AcademicTermsManager
                onSelectTerm={(term) => {
                  handleSelectTerm(term);
                  setMainSection('CLASSES');
                }}
                selectedTermId={activeTerm?.id}
                isSupervisor={isSupervisor}
              />
            )}

            {/* View 2: Books & Curriculum Hierarchy */}
            {mainSection === 'BOOKS' && <BooksManager isSupervisor={isSupervisor} />}

            {/* View 3: Students Management */}
            {mainSection === 'STUDENTS' && <StudentsManager isSupervisor={isSupervisor} />}

            {/* View 4: Teachers & Skills */}
            {mainSection === 'TEACHERS' && <TeachersManager isSupervisor={isSupervisor} />}

            {/* View 5: Classes & Rosters */}
            {mainSection === 'CLASSES' && (
              <ClassesManager
                activeTerm={activeTerm}
                terms={terms}
                onSelectTerm={handleSelectTerm}
                onGoToScheduling={(classItem) => {
                  setMainSection('SCHEDULING');
                  setActiveTab('OVERVIEW');
                }}
                isSupervisor={isSupervisor}
              />
            )}

            {/* View 6: Scheduling Timetable Engine (Preserving Phase 7 intact) */}
            {mainSection === 'SCHEDULING' && (
              <div className="space-y-6">
                {/* Primary Tab Navigation */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <nav className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveTab('OVERVIEW')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeTab === 'OVERVIEW'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Classes & Schedules ({classes.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('TIMETABLE')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeTab === 'TIMETABLE'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Weekly Timetable ({schedules.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('PROPOSAL')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeTab === 'PROPOSAL'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      <span>
                        Proposal Review{' '}
                        {activeProposal && `(${activeProposal.status.replace(/_/g, ' ')})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('ARCHIVE')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        activeTab === 'ARCHIVE'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Proposal Archive ({proposals.length})</span>
                    </button>
                  </nav>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenManualFromTimetable()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md shadow-2xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Schedule Class</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsGeneratorOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-md shadow-xs transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Proposal</span>
                    </button>
                  </div>
                </div>

                {/* Tab 1: Classes Overview */}
                {activeTab === 'OVERVIEW' && (
                  <ClassesOverview
                    classes={classes}
                    schedules={schedules}
                    isSupervisor={isSupervisor}
                    selectedClassIds={selectedClassIds}
                    onToggleSelectClass={handleToggleSelectClass}
                    onSelectAllClasses={handleSelectAllClasses}
                    onOpenGenerateModal={(ids) => {
                      if (ids && ids.length > 0) setSelectedClassIds(ids);
                      setIsGeneratorOpen(true);
                    }}
                    onOpenManualSchedule={handleOpenManualFromOverview}
                    onDeleteSchedule={handleDeleteSchedule}
                  />
                )}

                {/* Tab 2: Weekly Timetable (Cal.com inspired) */}
                {activeTab === 'TIMETABLE' && (
                  <WeeklyTimetable
                    classes={classes}
                    schedules={schedules}
                    isSupervisor={isSupervisor}
                    onEditSchedule={handleEditFromTimetable}
                    onDeleteSchedule={handleDeleteSchedule}
                    onAddSchedule={handleOpenManualFromTimetable}
                  />
                )}

                {/* Tab 3: Active Proposal Review */}
                {activeTab === 'PROPOSAL' && (
                  <div>
                    {activeProposal ? (
                      <ProposalReviewPanel
                        proposal={activeProposal}
                        classes={classes}
                        onValidate={handleValidateProposal}
                        onAccept={handleAcceptProposal}
                        onReject={handleRejectProposal}
                        onModifySlot={handleModifySlot}
                        onClose={() => setActiveTab('OVERVIEW')}
                        isActionLoading={actionLoading}
                      />
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            No Active Scheduling Proposal
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Generate a new proposal for this academic term to let the scheduling engine
                            calculate conflict-free class slots, or pick a proposal from the archive.
                          </p>
                        </div>
                        <div className="pt-2 flex justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsGeneratorOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-xs transition-colors"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Generate Proposal Now</span>
                          </button>
                          {proposals.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveProposal(proposals[0]);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-md transition-colors"
                            >
                              <Layers className="w-4 h-4" />
                              <span>Load Latest ({proposals[0].id.slice(0, 8)}...)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Proposal History / Archive */}
                {activeTab === 'ARCHIVE' && (
                  <ProposalHistory
                    proposals={proposals}
                    terms={terms}
                    onSelectProposal={(p) => {
                      setActiveProposal(p);
                      setActiveTab('PROPOSAL');
                    }}
                    onRefresh={refreshData}
                    loading={loading}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Generator Modal */}
      <ProposalGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        activeTerm={activeTerm}
        selectedClassIds={selectedClassIds}
        classes={classes}
        onGenerate={handleGenerateProposal}
      />

      {/* Manual Schedule Modal */}
      <ManualScheduleModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        classes={classes}
        initialClass={manualModalClass}
        initialSchedule={manualModalSchedule}
        defaultDayOfWeek={manualModalDay}
        onSaveSchedule={handleSaveManualSchedule}
        onDeleteSchedule={async (id) => {
          const sched = schedules.find((s) => s.id === id);
          if (sched) await handleDeleteSchedule(sched);
        }}
      />

      {/* Real Auth Login / Account Switch Modal */}
      {(isLoginModalOpen || !currentUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Authenticate Account
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sign in with personnel code to establish authenticated session
                </p>
              </div>
              {currentUser && (
                <button onClick={() => setIsLoginModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-slate-300 font-semibold text-xs">Quick Role Account Selection</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginPersonnelCode('SUP-01');
                    setLoginPassword('SupervisorPass123!');
                  }}
                  className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                    loginPersonnelCode === 'SUP-01'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-indigo-400" />
                    <span>SUP-01</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Supervisor Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLoginPersonnelCode('TCH-01');
                    setLoginPassword('TeacherPass123!');
                  }}
                  className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                    loginPersonnelCode === 'TCH-01'
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                    <span>TCH-01</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Teacher Account</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Personnel Code *</label>
                <input
                  type="text"
                  value={loginPersonnelCode}
                  onChange={(e) => setLoginPersonnelCode(e.target.value)}
                  placeholder="SUP-01 or TCH-01"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Password *</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => setIsLoginModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Sign In</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
