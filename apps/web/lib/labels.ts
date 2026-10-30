/** English labels for enum values shown in the shell, Overview and notifications. */

import type { AcademicTerm, SchedulingProposal } from './api-client';

export const TERM_STATUS_LABEL: Record<AcademicTerm['status'], string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

export const PROPOSAL_STATUS_LABEL: Record<SchedulingProposal['status'], string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  ACCEPTED: 'Accepted',
  MODIFIED: 'Modified',
  REJECTED: 'Rejected',
};

/** Role names as returned by the API (`UserAccount.roles`). */
export function roleLabel(roles: readonly string[] | undefined | null): string {
  if (roles?.includes('SUPERVISOR')) return 'Supervisor';
  if (roles?.includes('TEACHER')) return 'Teacher';
  return 'User';
}
