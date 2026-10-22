/**
 * Overview metrics, derived ONLY from data the existing API already returns.
 * Pure functions: no fetching, no side effects, no invented numbers.
 *
 * Counting rules (documented so they can be reviewed):
 *  - Only classes whose status is DRAFT or ACTIVE are considered "open". Completed and cancelled classes
 *    never need a teacher or a timetable slot, so they are excluded from the attention counts.
 *  - "Unscheduled" = an open class with no schedule row (same definition the scheduling screen uses).
 *  - "At capacity" = an open class whose active-enrollment count (`enrolledCount`) is >= capacity. It is only
 *    reported when EVERY open class carries `enrolledCount`; otherwise it is omitted rather than guessed.
 *  - "Awaiting review" = proposals whose status is exactly PENDING_REVIEW.
 *  - The client fetches classes and proposals without totals and with fixed page sizes. When a list is as long
 *    as its page size it may be truncated, so the result is flagged and the UI must say so.
 */

import type { ClassItem, Schedule, SchedulingProposal } from './api-client';

/** Page sizes used by `apiClient.getClasses` / `getProposals`. Keep in sync with api-client.ts. */
export const CLASS_FETCH_LIMIT = 100;
export const PROPOSAL_FETCH_LIMIT = 20;

export interface OverviewSummary {
  /** Classes in the selected term with status DRAFT or ACTIVE. */
  openClassCount: number;
  classesWithoutTeacher: ClassItem[];
  unscheduledClasses: ClassItem[];
  scheduledClassCount: number;
  /** Number of open classes at or above capacity; null when it cannot be computed reliably. */
  atCapacityCount: number | null;
  pendingProposals: SchedulingProposal[];
  /** True when the class list may be incomplete (it reached the fetch limit). */
  classesMayBeTruncated: boolean;
  /** True when the proposal list may be incomplete (it reached the fetch limit). */
  proposalsMayBeTruncated: boolean;
  /** Number of items that need attention (teacher, schedule, proposal). */
  attentionItemCount: number;
}

const OPEN_STATUSES: ReadonlySet<ClassItem['status']> = new Set(['DRAFT', 'ACTIVE']);

export function summarizeOverview(input: {
  classes: readonly ClassItem[];
  schedules: readonly Schedule[];
  proposals: readonly SchedulingProposal[];
}): OverviewSummary {
  const { classes, schedules, proposals } = input;

  const openClasses = classes.filter((c) => OPEN_STATUSES.has(c.status));
  const scheduledIds = new Set(schedules.map((s) => s.classId));

  const classesWithoutTeacher = openClasses.filter((c) => !c.teacherId);
  const unscheduledClasses = openClasses.filter((c) => !scheduledIds.has(c.id));
  const scheduledClassCount = openClasses.length - unscheduledClasses.length;

  const capacityKnown =
    openClasses.length > 0 && openClasses.every((c) => typeof c.enrolledCount === 'number');
  const atCapacityCount = capacityKnown
    ? openClasses.filter((c) => c.capacity > 0 && (c.enrolledCount as number) >= c.capacity).length
    : null;

  const pendingProposals = proposals.filter((p) => p.status === 'PENDING_REVIEW');

  return {
    openClassCount: openClasses.length,
    classesWithoutTeacher,
    unscheduledClasses,
    scheduledClassCount,
    atCapacityCount,
    pendingProposals,
    classesMayBeTruncated: classes.length >= CLASS_FETCH_LIMIT,
    proposalsMayBeTruncated: proposals.length >= PROPOSAL_FETCH_LIMIT,
    attentionItemCount:
      (classesWithoutTeacher.length > 0 ? 1 : 0) +
      (unscheduledClasses.length > 0 ? 1 : 0) +
      (pendingProposals.length > 0 ? 1 : 0),
  };
}
