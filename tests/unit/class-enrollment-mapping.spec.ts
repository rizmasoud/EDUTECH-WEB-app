/**
 * The API reports a class roster size as `activeEnrollmentCount`; the frontend model reads `enrolledCount`.
 * These tests use the REAL response shape (see ClassResponseDto) and check the mapping at the client boundary
 * and what the screens then display.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { apiClient, normalizeClassItem, type ApiClassItem } from '../../apps/web/lib/api-client';
import { summarizeOverview } from '../../apps/web/lib/overview';
import { ClassesOverview } from '../../apps/web/components/scheduling/ClassesOverview';
import { WeeklyTimetable } from '../../apps/web/components/scheduling/WeeklyTimetable';

/** A class exactly as GET /classes returns it: no `enrolledCount`, no nested book/teacher/term. */
function apiClass(id: string, over: Partial<ApiClassItem> = {}): ApiClassItem {
  return {
    id,
    academicTermId: 't1',
    bookId: 'b1',
    bookSegmentId: null,
    teacherId: 'teacher-1',
    className: id,
    classType: 'REGULAR',
    status: 'ACTIVE',
    capacity: 12,
    color: 'blue',
    activeEnrollmentCount: 7,
    ...over,
  };
}

const text = (html: string) => html.replace(/<!-- -->/g, '');

describe('normalizeClassItem', () => {
  it('maps activeEnrollmentCount to enrolledCount and drops the API-only field', () => {
    const out = normalizeClassItem(apiClass('a'));
    assert.equal(out.enrolledCount, 7);
    assert.equal('activeEnrollmentCount' in out, false);
    assert.equal(out.capacity, 12);
    assert.equal(out.id, 'a');
  });

  it('keeps a real zero', () => {
    assert.equal(normalizeClassItem(apiClass('a', { activeEnrollmentCount: 0 })).enrolledCount, 0);
  });

  it('leaves the count undefined when the API omitted it (no invented zero)', () => {
    const out = normalizeClassItem(apiClass('a', { activeEnrollmentCount: undefined }));
    assert.equal(out.enrolledCount, undefined);
    assert.equal('enrolledCount' in out, false);
  });

  it('ignores null and non-finite counts', () => {
    assert.equal(normalizeClassItem(apiClass('a', { activeEnrollmentCount: null })).enrolledCount, undefined);
    assert.equal(normalizeClassItem(apiClass('a', { activeEnrollmentCount: Number.NaN })).enrolledCount, undefined);
  });

  it('still accepts a response that already uses enrolledCount', () => {
    const out = normalizeClassItem(apiClass('a', { activeEnrollmentCount: undefined, enrolledCount: 4 }));
    assert.equal(out.enrolledCount, 4);
  });
});

describe('apiClient class responses', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(body: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
  }

  it('getClasses maps a paginated response', async () => {
    stubFetch({ items: [apiClass('a'), apiClass('b', { activeEnrollmentCount: 12 })], total: 2, page: 1, pageSize: 100 });
    const list = await apiClient.getClasses({ academicTermId: 't1' });
    assert.deepEqual(list.map((c) => c.enrolledCount), [7, 12]);
  });

  it('getClasses maps a bare array response', async () => {
    stubFetch([apiClass('a')]);
    assert.equal((await apiClient.getClasses())[0].enrolledCount, 7);
  });

  it('getClassById and the create/update/transition calls map the single class', async () => {
    stubFetch(apiClass('a', { activeEnrollmentCount: 3 }));
    assert.equal((await apiClient.getClassById('a')).enrolledCount, 3);
    assert.equal((await apiClient.createClass({ academicTermId: 't1', bookId: 'b1' })).enrolledCount, 3);
    assert.equal((await apiClient.updateClass('a', { capacity: 20 })).enrolledCount, 3);
    assert.equal((await apiClient.completeClass('a')).enrolledCount, 3);
    assert.equal((await apiClient.cancelClass('a')).enrolledCount, 3);
  });

  it('an update response without a count does not show a fake zero', async () => {
    stubFetch(apiClass('a', { activeEnrollmentCount: undefined }));
    assert.equal((await apiClient.updateClass('a', { capacity: 20 })).enrolledCount, undefined);
  });
});

describe('real API shape through Overview and the legacy screens', () => {
  it('Overview counts a full class as at capacity (the metric is no longer dead)', async () => {
    const classes = [
      apiClass('full', { capacity: 12, activeEnrollmentCount: 12 }),
      apiClass('open', { capacity: 12, activeEnrollmentCount: 5 }),
    ].map(normalizeClassItem);
    const summary = summarizeOverview({ classes, schedules: [], proposals: [] });
    assert.equal(summary.atCapacityCount, 1);
  });

  it('Overview still omits the metric if any open class has no count', () => {
    const classes = [apiClass('a'), apiClass('b', { activeEnrollmentCount: undefined })].map(normalizeClassItem);
    assert.equal(summarizeOverview({ classes, schedules: [], proposals: [] }).atCapacityCount, null);
  });

  it('ClassesOverview shows the real roster size, not 0', () => {
    const classes = [normalizeClassItem(apiClass('a', { activeEnrollmentCount: 7 }))];
    const html = text(
      renderToString(
        React.createElement(ClassesOverview, {
          classes,
          schedules: [],
          isSupervisor: true,
          selectedClassIds: [],
          onToggleSelectClass: () => {},
          onSelectAllClasses: () => {},
          onOpenGenerateModal: () => {},
          onOpenManualSchedule: () => {},
          onDeleteSchedule: () => {},
        }),
      ),
    );
    assert.match(html, /7 \/ 12/);
    assert.doesNotMatch(html, /0 \/ 12/);
  });

  it('WeeklyTimetable shows the real roster size', () => {
    const classes = [normalizeClassItem(apiClass('a', { activeEnrollmentCount: 9 }))];
    const schedules = [
      { id: 's1', classId: 'a', dayOfWeek: 1, startTime: '10:00:00', endTime: '11:00:00', startsOn: null, endsOn: null },
    ] as never;
    const html = text(
      renderToString(React.createElement(WeeklyTimetable, { classes, schedules, isSupervisor: true })),
    );
    assert.match(html, /9 \/ 12/);
  });
});
