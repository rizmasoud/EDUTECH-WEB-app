/**
 * Regression: the Weekly Timetable showed "No teacher assigned" for every class.
 *
 * GET /classes returns flat `teacherId` / `bookId`; the timetable renders `cls.teacher` / `cls.book`. These tests
 * run the real AppDataController on API-shaped data and render the real WeeklyTimetable (React SSR, like
 * overview-ui.spec.ts), so they fail if the names stop reaching the screen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppDataController, type AppDataApi } from '../../apps/web/lib/app-data-controller';
import { WeeklyTimetable } from '../../apps/web/components/scheduling/WeeklyTimetable';
import type { AcademicTerm, ClassItem, Schedule } from '../../apps/web/lib/api-client';

const TERM: AcademicTerm = { id: 't1', name: 'T1', startDate: '2026-09-23', endDate: '2026-12-20', status: 'ACTIVE' };

const apiClass = (id: string, over: Partial<ClassItem> = {}): ClassItem => ({
  id,
  academicTermId: 't1',
  bookId: 'b1',
  bookSegmentId: null,
  teacherId: 'th1',
  className: id,
  classType: 'REGULAR',
  status: 'ACTIVE',
  capacity: 12,
  ...over,
});

const slot = (id: string, classId: string, dayOfWeek: number, startTime: string): Schedule =>
  ({ id, classId, dayOfWeek, startTime, endTime: '12:00' }) as Schedule;

function api(): AppDataApi {
  return {
    async getAcademicTerms() {
      return [TERM];
    },
    async getClasses() {
      return [
        apiClass('Assigned class'),
        apiClass('Orphan class', { teacherId: null }),
      ];
    },
    async getBooks() {
      return [{ id: 'b1', name: 'English Level 1', level: 'A1', sequenceOrder: 1, sessionCount: 20, isTerminal: false, isActive: true }];
    },
    async getTeachers() {
      return { items: [{ id: 'th1', accountId: null, firstName: 'Hamid', lastName: 'Souriyan', isActive: true }], total: 1 };
    },
    async getSchedules() {
      return [];
    },
    async getProposals() {
      return [];
    },
  };
}

const schedules = [slot('s1', 'c-assigned', 0, '10:00'), slot('s2', 'c-orphan', 1, '10:00')];

async function loadedClasses(): Promise<ClassItem[]> {
  const controller = new AppDataController(api(), { isSupervisor: true });
  await controller.refresh();
  return controller.getSnapshot().classes.map((c, i) => ({ ...c, id: i === 0 ? 'c-assigned' : 'c-orphan' }));
}

// React SSR separates adjacent text nodes with `<!-- -->`; drop them so text assertions read like the screen.
const render = (classes: ClassItem[]) =>
  renderToString(React.createElement(WeeklyTimetable, { classes, schedules, isSupervisor: true })).replace(
    /<!-- -->/g,
    '',
  );

describe('WeeklyTimetable shows names for classes loaded through AppDataController', () => {
  it('shows the assigned teacher and book, and "No teacher assigned" only for the unassigned class', async () => {
    const html = render(await loadedClasses());
    assert.match(html, /Hamid Souriyan/);
    assert.match(html, /English Level 1/);
    assert.equal(
      (html.match(/No teacher assigned/g) ?? []).length,
      1,
      'exactly one slot (the genuinely unassigned class) says "No teacher assigned"',
    );
  });

  it('lists the assigned teacher in the Teacher filter', async () => {
    const html = render(await loadedClasses());
    assert.match(html, /<option[^>]*value="th1"[^>]*>Hamid Souriyan<\/option>/);
    assert.match(html, /All Teachers \(1\)/);
  });

  it('documents the bug: raw API-shaped classes (flat ids only) render "No teacher assigned" for everyone', () => {
    const raw = [apiClass('c-assigned'), apiClass('c-orphan', { teacherId: null })];
    const html = render(raw);
    assert.equal((html.match(/No teacher assigned/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Hamid Souriyan/);
  });
});
