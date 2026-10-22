/**
 * Overview metrics: every number on the Overview page comes from `summarizeOverview`.
 * Pure function tests: no React, no network, no database.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeOverview,
  CLASS_FETCH_LIMIT,
  PROPOSAL_FETCH_LIMIT,
} from '../../apps/web/lib/overview';
import type { ClassItem, Schedule, SchedulingProposal } from '../../apps/web/lib/api-client';

function cls(id: string, over: Partial<ClassItem> = {}): ClassItem {
  return {
    id,
    academicTermId: 'term-1',
    bookId: 'book-1',
    bookSegmentId: null,
    teacherId: 'teacher-1',
    className: id,
    classType: 'REGULAR',
    status: 'ACTIVE',
    capacity: 10,
    enrolledCount: 3,
    ...over,
  };
}

function sched(classId: string): Schedule {
  return { id: `s-${classId}`, classId, dayOfWeek: 6, startTime: '10:00', endTime: '11:30' } as unknown as Schedule;
}

function proposal(id: string, status: SchedulingProposal['status']): SchedulingProposal {
  return { id, status } as unknown as SchedulingProposal;
}

describe('Overview metrics (summarizeOverview)', () => {
  it('counts only DRAFT and ACTIVE classes as open', () => {
    const s = summarizeOverview({
      classes: [
        cls('a'),
        cls('b', { status: 'DRAFT' }),
        cls('c', { status: 'COMPLETED' }),
        cls('d', { status: 'CANCELLED' }),
      ],
      schedules: [],
      proposals: [],
    });
    assert.equal(s.openClassCount, 2);
  });

  it('completed and cancelled classes never count as missing a teacher or a schedule', () => {
    const s = summarizeOverview({
      classes: [
        cls('done', { status: 'COMPLETED', teacherId: null }),
        cls('gone', { status: 'CANCELLED', teacherId: null }),
      ],
      schedules: [],
      proposals: [],
    });
    assert.equal(s.classesWithoutTeacher.length, 0);
    assert.equal(s.unscheduledClasses.length, 0);
    assert.equal(s.attentionItemCount, 0);
  });

  it('finds open classes without a teacher', () => {
    const s = summarizeOverview({
      classes: [cls('a'), cls('b', { teacherId: null }), cls('c', { teacherId: null, status: 'DRAFT' })],
      schedules: [sched('a'), sched('b'), sched('c')],
      proposals: [],
    });
    assert.deepEqual(s.classesWithoutTeacher.map((c) => c.id).sort(), ['b', 'c']);
  });

  it('finds unscheduled classes using the schedule list (same rule as the scheduling screen)', () => {
    const s = summarizeOverview({
      classes: [cls('a'), cls('b'), cls('c')],
      schedules: [sched('a'), sched('a'), sched('c')],
      proposals: [],
    });
    assert.deepEqual(s.unscheduledClasses.map((c) => c.id), ['b']);
    assert.equal(s.scheduledClassCount, 2);
  });

  it('counts only PENDING_REVIEW proposals as awaiting review', () => {
    const s = summarizeOverview({
      classes: [cls('a')],
      schedules: [sched('a')],
      proposals: [
        proposal('p1', 'PENDING_REVIEW'),
        proposal('p2', 'ACCEPTED'),
        proposal('p3', 'REJECTED'),
        proposal('p4', 'DRAFT'),
        proposal('p5', 'MODIFIED'),
        proposal('p6', 'PENDING_REVIEW'),
      ],
    });
    assert.deepEqual(s.pendingProposals.map((p) => p.id), ['p1', 'p6']);
  });

  it('reports capacity only when every open class has an enrollment count', () => {
    const missing = summarizeOverview({
      classes: [cls('a', { enrolledCount: 10 }), cls('b', { enrolledCount: undefined })],
      schedules: [],
      proposals: [],
    });
    assert.equal(missing.atCapacityCount, null, 'omitted rather than guessed');

    const known = summarizeOverview({
      classes: [
        cls('a', { capacity: 10, enrolledCount: 10 }),
        cls('b', { capacity: 10, enrolledCount: 11 }),
        cls('c', { capacity: 10, enrolledCount: 9 }),
      ],
      schedules: [],
      proposals: [],
    });
    assert.equal(known.atCapacityCount, 2, 'at or above capacity');
  });

  it('does not count a class with capacity 0 as full, and ignores closed classes for capacity', () => {
    const s = summarizeOverview({
      classes: [
        cls('zero', { capacity: 0, enrolledCount: 0 }),
        cls('closed', { status: 'COMPLETED', capacity: 5, enrolledCount: 5 }),
        cls('open', { capacity: 5, enrolledCount: 2 }),
      ],
      schedules: [],
      proposals: [],
    });
    assert.equal(s.atCapacityCount, 0);
  });

  it('has no capacity figure when there are no open classes at all', () => {
    const s = summarizeOverview({ classes: [], schedules: [], proposals: [] });
    assert.equal(s.atCapacityCount, null);
    assert.equal(s.openClassCount, 0);
    assert.equal(s.attentionItemCount, 0);
  });

  it('counts attention items by kind, not by class', () => {
    const s = summarizeOverview({
      classes: [cls('a', { teacherId: null }), cls('b', { teacherId: null })],
      schedules: [],
      proposals: [proposal('p', 'PENDING_REVIEW')],
    });
    // teacher + schedule + proposal = three kinds of attention
    assert.equal(s.attentionItemCount, 3);
  });

  it('flags a possibly truncated class list at the client fetch limit', () => {
    const many = Array.from({ length: CLASS_FETCH_LIMIT }, (_, i) => cls(`c${i}`));
    assert.equal(summarizeOverview({ classes: many, schedules: [], proposals: [] }).classesMayBeTruncated, true);
    assert.equal(
      summarizeOverview({ classes: many.slice(1), schedules: [], proposals: [] }).classesMayBeTruncated,
      false,
    );
  });

  it('flags a possibly truncated proposal list at the client fetch limit', () => {
    const many = Array.from({ length: PROPOSAL_FETCH_LIMIT }, (_, i) => proposal(`p${i}`, 'ACCEPTED'));
    assert.equal(summarizeOverview({ classes: [], schedules: [], proposals: many }).proposalsMayBeTruncated, true);
    assert.equal(
      summarizeOverview({ classes: [], schedules: [], proposals: many.slice(1) }).proposalsMayBeTruncated,
      false,
    );
  });

  it('keeps the documented fetch limits in sync with the API client', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../../apps/web/lib/api-client.ts'), 'utf8');
    assert.match(src, new RegExp(`filter\\.pageSize \\|\\| ${CLASS_FETCH_LIMIT}`), 'getClasses default page size');
    assert.match(src, new RegExp(`set\\('pageSize', '${PROPOSAL_FETCH_LIMIT}'\\)`), 'getProposals page size');
  });
});
