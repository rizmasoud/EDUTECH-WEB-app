'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { apiClient } from '../lib/api-client';
import type {
  UserAccount,
  AcademicTerm,
  ClassItem,
  Schedule,
  SchedulingProposal,
} from '../lib/api-client';
import { AppShell, type NavItem } from '../components/shell/AppShell';
import { OverviewPage } from '../components/overview/OverviewPage';
import { LoginView } from '../components/auth/LoginView';
import { LoadingState } from '../components/ui/LoadingState';
import { NotificationProvider, useNotifications } from '../components/ui/NotificationProvider';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { AppDataController, classesMatchTerm } from '../lib/app-data-controller';
import { describeLoginError } from '../lib/auth-errors';
import { PROPOSAL_STATUS_LABEL } from '../lib/labels';
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
import { getClassDisplayName } from '../lib/scheduling-utils';
import {
  Calendar,
  CalendarRange,
  Layers,
  Sparkles,
  Plus,
  BookOpen,
  Users,
  GraduationCap,
  LayoutDashboard,
} from 'lucide-react';

type MainSection =
  | 'OVERVIEW'
  | 'SCHEDULING'
  | 'TERMS'
  | 'BOOKS'
  | 'STUDENTS'
  | 'TEACHERS'
  | 'CLASSES';

/** Supervisor navigation. Labels are fixed product terminology. */
const SUPERVISOR_NAV: NavItem[] = [
  { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
  { id: 'SCHEDULING', label: 'Scheduling', icon: Calendar },
  { id: 'CLASSES', label: 'Classes', icon: Layers },
  { id: 'STUDENTS', label: 'Students', icon: GraduationCap },
  { id: 'TEACHERS', label: 'Teachers', icon: Users },
  { id: 'BOOKS', label: 'Books', icon: BookOpen },
  { id: 'TERMS', label: 'Terms', icon: CalendarRange },
];

/** The teacher experience stays the existing read-only schedule portal: one destination. */
const TEACHER_NAV: NavItem[] = [{ id: 'SCHEDULING', label: 'Weekly Schedule', icon: Calendar }];

/**
 * Screens that have not been redesigned yet keep their original (English, left-to-right) layout.
 * They render inside this wrapper so the new RTL shell does not mirror layouts that were built for LTR.
 * Remove the wrapper from a screen when that screen is redesigned.
 */
function LegacyArea({ children }: { children: React.ReactNode }) {
  return <div dir="ltr">{children}</div>;
}

/** Pluralize an English noun for a count ("1 conflict", "2 conflicts"). */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The one place the app-wide notification provider is mounted (both layout files render this page), so every
 * screen and dialog below can reach it through `useNotifications()`.
 */
export default function SchedulingAppPage() {
  return (
    <NotificationProvider>
      <SchedulingApp />
    </NotificationProvider>
  );
}

function SchedulingApp() {
  // Authentication & Role State - RBAC strictly derived from authenticated session
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Credentials are typed by the user. Nothing is pre-filled and nothing is sent automatically.
  const [loginPersonnelCode, setLoginPersonnelCode] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Main Section Navigation
  const [mainSection, setMainSection] = useState<MainSection>('OVERVIEW');
  // Incremented by Overview's next actions to open a screen's "create" form once.
  const [createClassRequest, setCreateClassRequest] = useState(0);
  const [createStudentRequest, setCreateStudentRequest] = useState(0);
  // Shared domain data (terms, the selected term and everything scoped to it). It lives in a controller
  // rather than in effects so that a refresh can never retrigger itself (see lib/app-data-controller.ts).
  const [dataController] = useState(() => new AppDataController(apiClient));
  const data = useSyncExternalStore(
    dataController.subscribe,
    dataController.getSnapshot,
    dataController.getSnapshot,
  );
  const { terms, activeTerm, classes, schedules, proposals, activeProposal } = data;
  const setActiveProposal = useCallback(
    (proposal: SchedulingProposal | null) => dataController.setActiveProposal(proposal),
    [dataController],
  );
  // True only when the loaded classes belong to the selected term.
  const classesBelongToTerm = classesMatchTerm(data);

  // UI Navigation State (Scheduling Subtabs)
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'TIMETABLE' | 'PROPOSAL' | 'ARCHIVE' | 'HEALTH'
  >('OVERVIEW');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals State
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualModalClass, setManualModalClass] = useState<ClassItem | null>(null);
  const [manualModalSchedule, setManualModalSchedule] = useState<Schedule | null>(null);
  const [manualModalDay, setManualModalDay] = useState<number | undefined>(undefined);

  // Every notification has its own id and timer (lib/notifications.ts); errors stay until dismissed.
  const notifier = useNotifications();
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    notifier.notify(type, message);
  };

  // Real Authentication Logout
  const handleLogout = async () => {
    setLoading(true);
    try {
      await apiClient.logout();
      showNotification('info', 'You have been signed out.');
    } catch {
      // The session may already be gone; either way the user is signed out locally.
    } finally {
      // Drop everything loaded for the previous user so the next sign-in starts clean.
      setCurrentUser(null);
      dataController.reset();
      setSelectedClassIds([]);
      setMainSection('OVERVIEW');
      setLoginPassword('');
      setAuthError(null);
      setLoading(false);
    }
  };

  // Real Authentication Login (only ever runs when the user submits the form)
  const handleLoginSubmit = async () => {
    const code = loginPersonnelCode.trim();
    if (!code || !loginPassword) {
      setAuthError('Enter your personnel code and password.');
      return;
    }
    setActionLoading(true);
    setAuthError(null);
    try {
      const res = await apiClient.login(code, loginPassword);
      setLoginPassword('');
      setMainSection(res.account.roles?.includes('SUPERVISOR') ? 'OVERVIEW' : 'SCHEDULING');
      setCurrentUser(res.account);
    } catch (err) {
      setAuthError(describeLoginError(err));
    } finally {
      setActionLoading(false);
    }
  };

  // Initial Authentication & Session Setup
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      setAuthLoading(true);
      // Check the current session only. Without a valid session the login form is shown and
      // no login request is sent automatically.
      try {
        const me = await apiClient.getMe();
        if (isMounted) {
          setCurrentUser(me);
          if (!me.roles?.includes('SUPERVISOR')) setMainSection('SCHEDULING');
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null);
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

  const isSupervisor = currentUser?.roles?.includes('SUPERVISOR') ?? false;

  // Tell the controller the role before any load. Declared before the load effect: effects run in order.
  useEffect(() => {
    dataController.setSupervisor(isSupervisor);
  }, [dataController, isSupervisor]);

  // Reload terms, the selected term's data and schedules. Stable identity: it depends on nothing that a
  // refresh itself changes.
  const refreshData = useCallback(() => dataController.refresh(), [dataController]);

  // Load data once there is a signed-in user (never on the login screen: every call would be a 401)
  useEffect(() => {
    if (!authLoading && currentUser) {
      void dataController.refresh();
    }
  }, [authLoading, currentUser, dataController]);

  // Academic term change: the one place the selected term changes (header selector and Classes screen).
  const handleSelectTerm = async (term: AcademicTerm) => {
    setSelectedClassIds([]);
    await dataController.selectTerm(term);
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

      const evaluatedCount =
        newProposal.data?.evaluatedClassCount ??
        newProposal.data?.classes?.length ??
        0;
      const validCount =
        newProposal.data?.validClassCount ??
        newProposal.data?.classes?.filter((c) => c.isValid).length ??
        0;
      const conflictedCount = Math.max(0, evaluatedCount - validCount);

      showNotification(
        'success',
        `Scheduling proposal created. ${plural(evaluatedCount, 'class', 'classes')} evaluated (${validCount} without conflicts, ${conflictedCount} with conflicts).`
      );
      await refreshData();
    } catch (err: any) {
      // Not toasted: ProposalGeneratorModal shows this error inline, and a second copy would duplicate it.
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
        res.isStillValid ? 'success' : 'info',
        res.isStillValid
          ? 'Proposal re-validated: all slots are conflict-free.'
          : `Re-validation complete: ${plural(res.conflicts.length, 'conflict')} found.`
      );
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Could not re-validate the proposal: ${err.message}`);
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
        `Proposal accepted. ${plural(res.committedSchedulesCount, 'class schedule')} saved.`
      );
      // Update proposal state
      const updated = await apiClient.getProposalById(proposalId);
      setActiveProposal(updated);
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Could not accept the proposal: ${err.message}`);
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
      showNotification('info', 'Proposal rejected.');
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Could not reject the proposal: ${err.message}`);
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
        `Class time updated. Proposal status: ${PROPOSAL_STATUS_LABEL[updated.status] ?? updated.status}.`
      );
      await refreshData();
    } catch (err: any) {
      // Not toasted: ProposalReviewPanel shows this error inline next to the slot being edited.
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Multi-session Class Weekly Schedule Save Handler
  const handleSaveClassSchedules = async (params: {
    classId: string;
    sessions: Array<{
      id?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startsOn?: string | null;
      endsOn?: string | null;
    }>;
  }) => {
    setActionLoading(true);
    try {
      const existingForClass = schedules.filter((s) => s.classId === params.classId);
      const keptIds = new Set(params.sessions.map((s) => s.id).filter(Boolean));

      // 1. Delete removed schedules
      const toDelete = existingForClass.filter((s) => !keptIds.has(s.id));
      for (const s of toDelete) {
        await apiClient.deleteSchedule(s.id);
      }

      // 2. Process sessions: update existing, create new
      for (const ses of params.sessions) {
        if (ses.id) {
          const orig = existingForClass.find((s) => s.id === ses.id);
          if (
            orig &&
            (orig.dayOfWeek !== ses.dayOfWeek ||
              orig.startTime.slice(0, 5) !== ses.startTime.slice(0, 5) ||
              orig.endTime.slice(0, 5) !== ses.endTime.slice(0, 5) ||
              (orig.startsOn || null) !== (ses.startsOn || null) ||
              (orig.endsOn || null) !== (ses.endsOn || null))
          ) {
            await apiClient.updateSchedule(ses.id, {
              dayOfWeek: ses.dayOfWeek,
              startTime: ses.startTime,
              endTime: ses.endTime,
              startsOn: ses.startsOn || null,
              endsOn: ses.endsOn || null,
            });
          }
        } else {
          await apiClient.createSchedule({
            classId: params.classId,
            dayOfWeek: ses.dayOfWeek,
            startTime: ses.startTime,
            endTime: ses.endTime,
            startsOn: ses.startsOn || null,
            endsOn: ses.endsOn || null,
          });
        }
      }

      const targetCls = classes.find((c) => c.id === params.classId);
      showNotification(
        'success',
        `Weekly schedule for "${getClassDisplayName(targetCls, 'Class')}" saved (${plural(params.sessions.length, 'session')} per week).`
      );
      await refreshData();
    } catch (err: any) {
      // Not toasted: ManualScheduleModal shows this error inline.
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Delete All Schedules For Class
  const handleDeleteAllClassSchedules = async (classId: string) => {
    const existingForClass = schedules.filter((s) => s.classId === classId);
    if (existingForClass.length === 0) return;
    const targetCls = classes.find((c) => c.id === classId);
    if (
      !confirm(
        `Are you sure you want to remove all ${existingForClass.length} schedule slot(s) for "${getClassDisplayName(targetCls, 'this class')}"?`
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      for (const s of existingForClass) {
        await apiClient.deleteSchedule(s.id);
      }
      showNotification(
        'success',
        `All schedule slots for "${getClassDisplayName(targetCls, 'Class')}" were removed.`
      );
      await refreshData();
    } catch (err: any) {
      // Not toasted here: ManualScheduleModal shows it inline; the Overview call site reports it (see below).
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
      showNotification('success', 'Class schedule updated.');
    } else {
      await apiClient.createSchedule({
        classId: data.classId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
      });
      showNotification('success', 'New class schedule added.');
    }
    await refreshData();
  };

  // Manual Schedule Delete Handler
  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (!confirm('Are you sure you want to remove this schedule slot?')) return;
    try {
      await apiClient.deleteSchedule(schedule.id);
      showNotification('success', 'Class schedule slot removed.');
      await refreshData();
    } catch (err: any) {
      showNotification('error', `Could not remove the class schedule slot: ${err.message}`);
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

  // 1. Checking the existing session (no login request is ever sent from here).
  if (authLoading) {
    return (
      <div className="min-h-screen">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  // 2. No valid session: show the login form.
  if (!currentUser) {
    return (
      <>
        <LoginView
          personnelCode={loginPersonnelCode}
          password={loginPassword}
          onPersonnelCodeChange={setLoginPersonnelCode}
          onPasswordChange={setLoginPassword}
          onSubmit={handleLoginSubmit}
          submitting={actionLoading}
          error={authError}
        />
      </>
    );
  }

  // 3. Signed in: one shell (labeled navigation + one header) around the active screen.
  return (
    <>
      <AppShell
        items={isSupervisor ? SUPERVISOR_NAV : TEACHER_NAV}
        activeId={isSupervisor ? mainSection : 'SCHEDULING'}
        onNavigate={(id) => setMainSection(id as MainSection)}
        user={currentUser}
        terms={terms}
        activeTerm={activeTerm}
        onSelectTerm={handleSelectTerm}
        onRefresh={refreshData}
        onLogout={handleLogout}
        loading={loading || data.loading}
      >
        {/* Failed loads stay visible (Overview renders its own); never let a failure look like an empty list */}
        {data.error && !(isSupervisor && mainSection === 'OVERVIEW') ? (
          <ErrorBanner message={data.error} onRetry={refreshData} />
        ) : null}

        {/* Teacher role: the existing read-only schedule portal, unchanged */}
        {!isSupervisor ? (
          <LegacyArea>
            <TeacherScheduleView
              user={currentUser}
              classes={classes}
              schedules={schedules}
            />
          </LegacyArea>
        ) : (
          <>
            {mainSection === 'OVERVIEW' && (
              <OverviewPage
                term={activeTerm}
                classes={classes}
                schedules={schedules}
                proposals={proposals}
                loading={!data.loaded || (data.loading && !classesBelongToTerm)}
                loadError={data.error}
                dataMatchesTerm={classesBelongToTerm}
                onRetry={refreshData}
                onGoToClasses={() => setMainSection('CLASSES')}
                onGoToUnscheduled={() => {
                  setActiveTab('OVERVIEW');
                  setMainSection('SCHEDULING');
                }}
                onReviewProposal={(proposal) => {
                  setActiveProposal(proposal);
                  setActiveTab('PROPOSAL');
                  setMainSection('SCHEDULING');
                }}
                onAddClass={() => {
                  setMainSection('CLASSES');
                  setCreateClassRequest((n) => n + 1);
                }}
                onAddStudent={() => {
                  setMainSection('STUDENTS');
                  setCreateStudentRequest((n) => n + 1);
                }}
                onOpenScheduling={() => setMainSection('SCHEDULING')}
                onGoToTerms={() => setMainSection('TERMS')}
              />
            )}

            {mainSection !== 'OVERVIEW' && (
              <LegacyArea>
                <div className="space-y-6">
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
            {mainSection === 'STUDENTS' && (
              <StudentsManager isSupervisor={isSupervisor} createRequestKey={createStudentRequest} />
            )}

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
                  handleOpenManualFromOverview(classItem);
                }}
                isSupervisor={isSupervisor}
                createRequestKey={createClassRequest}
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
                    onDeleteAllClassSchedules={async (cls) => {
                      try {
                        await handleDeleteAllClassSchedules(cls.id);
                      } catch (err: any) {
                        showNotification('error', `Could not remove the schedule slots: ${err.message}`);
                      }
                    }}
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
                    loading={loading || data.loading}
                  />
                )}
              </div>
            )}
                </div>
              </LegacyArea>
            )}
          </>
        )}
      </AppShell>

      {/* Scheduling modals keep their original layout until the scheduling redesign */}
      <LegacyArea>
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
        existingSchedules={schedules}
        defaultDayOfWeek={manualModalDay}
        onSaveClassSchedules={handleSaveClassSchedules}
        onDeleteClassSchedules={handleDeleteAllClassSchedules}
        onSaveSchedule={handleSaveManualSchedule}
        onDeleteSchedule={async (id) => {
          const sched = schedules.find((s) => s.id === id);
          if (sched) await handleDeleteSchedule(sched);
        }}
      />
      </LegacyArea>
    </>
  );
}
