/** Persian labels for enum values shown in the shell and Overview. Terminology is fixed by product decision. */

import type { AcademicTerm, SchedulingProposal } from './api-client';

export const TERM_STATUS_LABEL: Record<AcademicTerm['status'], string> = {
  PLANNED: 'برنامه‌ریزی‌شده',
  ACTIVE: 'فعال',
  CLOSED: 'بسته‌شده',
};

export const PROPOSAL_STATUS_LABEL: Record<SchedulingProposal['status'], string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  ACCEPTED: 'پذیرفته‌شده',
  MODIFIED: 'ویرایش‌شده',
  REJECTED: 'ردشده',
};

/** Role names as returned by the API (`UserAccount.roles`). */
export function roleLabel(roles: readonly string[] | undefined | null): string {
  if (roles?.includes('SUPERVISOR')) return 'سرپرست';
  if (roles?.includes('TEACHER')) return 'معلم';
  return 'کاربر';
}
