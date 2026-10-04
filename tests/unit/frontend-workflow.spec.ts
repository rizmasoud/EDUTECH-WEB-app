/**
 * Frontend Workflow & Component Unit Tests
 * Uses Node.js built-in test runner and React SSR (react-dom/server)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ClassesOverview } from '../../apps/web/components/scheduling/ClassesOverview';
import { ProposalReviewPanel } from '../../apps/web/components/scheduling/ProposalReviewPanel';
import { TeacherScheduleView } from '../../apps/web/components/scheduling/TeacherScheduleView';
import { ProposalGeneratorModal } from '../../apps/web/components/scheduling/ProposalGeneratorModal';
import type { ClassItem, Schedule, SchedulingProposal, UserAccount, AcademicTerm } from '../../apps/web/lib/api-client';

describe('Phase 5 Frontend Workflow Components', () => {
  const mockClass: ClassItem = {
    id: 'class-1',
    academicTermId: 'term-1',
    bookId: 'book-1',
    bookSegmentId: null,
    teacherId: 'teacher-1',
    className: 'ENG-101',
    classType: 'REGULAR',
    status: 'ACTIVE',
    capacity: 12,
    enrolledCount: 3,
    book: { id: 'book-1', name: 'English Level 1', level: 'A1' },
    teacher: { id: 'teacher-1', firstName: 'Hamid', lastName: 'Souriyan' },
  };

  const mockSchedule: Schedule = {
    id: 'sched-1',
    classId: 'class-1',
    dayOfWeek: 6, // Saturday
    startTime: '08:30',
    endTime: '10:00',
    startsOn: null,
    endsOn: null,
  };

  const mockProposal: SchedulingProposal = {
    id: 'prop-1',
    academicTermId: 'term-1',
    status: 'PENDING_REVIEW',
    data: {
      allowFriday: false,
      generatedAt: new Date().toISOString(),
      totalClasses: 1,
      validClassesCount: 1,
      invalidClassesCount: 0,
      classes: [
        {
          classId: 'class-1',
          dayOfWeek: 6,
          startTime: '08:30',
          endTime: '10:00',
          isValid: true,
          conflicts: [],
          score: 85,
        },
      ],
      conflicts: [],
      preferences: [],
      explanations: ['Valid recommended slot'],
      evaluatedClassCount: 1,
      validClassCount: 1,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockUserTeacher: UserAccount = {
    id: 'user-tch',
    personnelCode: 'TCH-01',
    isActive: true,
    roles: ['TEACHER'],
    teacherId: 'teacher-1',
  };

  const mockTerm: AcademicTerm = {
    id: 'term-1',
    name: 'Spring 2026',
    startDate: '2026-04-15',
    endDate: '2026-07-15',
    status: 'ACTIVE',
  };

  it('ClassesOverview renders classes and schedule status correctly', () => {
    const html = renderToString(
      React.createElement(ClassesOverview, {
        classes: [mockClass],
        schedules: [mockSchedule],
        isSupervisor: true,
        selectedClassIds: [],
        onToggleSelectClass: () => {},
        onSelectAllClasses: () => {},
        onOpenGenerateModal: () => {},
        onOpenManualSchedule: () => {},
        onDeleteSchedule: () => {},
      })
    );

    assert.ok(html.includes('ENG-101'), 'Should render class name');
    assert.ok(html.includes('English Level 1'), 'Should render book name');
    assert.ok(html.includes('Hamid'), 'Should render teacher first name');
    assert.ok(html.includes('Souriyan'), 'Should render teacher last name');
    assert.ok(html.includes('12'), 'Should render capacity');
  });

  it('ProposalReviewPanel renders proposal status and valid slots', () => {
    const html = renderToString(
      React.createElement(ProposalReviewPanel, {
        proposal: mockProposal,
        classes: [mockClass],
        onValidate: async () => {},
        onAccept: async () => {},
        onReject: async () => {},
        onModifySlot: async () => {},
        onClose: () => {},
        isActionLoading: false,
      })
    );

    assert.ok(html.includes('PENDING REVIEW'), 'Should render proposal status badge');
    assert.ok(html.includes('Slot Valid'), 'Should render validity indicator');
    assert.ok(html.includes('Accept Proposal'), 'Should render accept action button');
  });

  it('TeacherScheduleView enforces read-only mode without supervisor mutation controls', () => {
    const html = renderToString(
      React.createElement(TeacherScheduleView, {
        user: mockUserTeacher,
        classes: [mockClass],
        schedules: [mockSchedule],
      })
    );

    assert.ok(html.includes('Teacher Schedule Portal (Read-Only)'), 'Should show read-only teacher banner');
    assert.ok(html.includes('ENG-101'), 'Should render assigned class');
    assert.equal(html.includes('Accept Proposal'), false, 'Teacher view must not expose supervisor accept action');
    assert.equal(html.includes('Generate Proposal'), false, 'Teacher view must not expose generator action');
  });

  it('ProposalGeneratorModal renders target scope and policy options', () => {
    const html = renderToString(
      React.createElement(ProposalGeneratorModal, {
        isOpen: true,
        onClose: () => {},
        activeTerm: mockTerm,
        selectedClassIds: [],
        classes: [mockClass],
        onGenerate: async () => {},
      })
    );

    assert.ok(html.includes('Generate Scheduling Proposal'), 'Should render modal title');
    assert.ok(html.includes('Permit Friday Scheduling'), 'Should render Friday policy toggle');
    assert.ok(html.includes('Full Academic Term'), 'Should render term scope option');
  });
});
