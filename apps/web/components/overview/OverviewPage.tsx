import React from 'react';
import { CalendarDays, CheckCircle2, Plus, UserPlus } from 'lucide-react';
import type { AcademicTerm, ClassItem, Schedule, SchedulingProposal } from '../../lib/api-client';
import { formatJalaliRange, formatNumber } from '../../lib/format';
import { TERM_STATUS_LABEL } from '../../lib/labels';
import {
  CLASS_FETCH_LIMIT,
  PROPOSAL_FETCH_LIMIT,
  summarizeOverview,
} from '../../lib/overview';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/LoadingState';
import { PageHeader } from '../ui/PageHeader';
import { ErrorBanner } from '../ui/ErrorBanner';

export interface OverviewPageProps {
  term: AcademicTerm | null;
  classes: ClassItem[];
  schedules: Schedule[];
  proposals: SchedulingProposal[];
  /** True until the first data load has finished. */
  loading: boolean;
  /** Message of the last failed load; stays set until a later load succeeds. */
  loadError: string | null;
  /**
   * True when `classes` were loaded for `term` (not for a previously selected term). Defaults to true.
   * Classes of another term are never shown or counted for this one.
   */
  dataMatchesTerm?: boolean;
  onRetry: () => void;
  onGoToClasses: () => void;
  onGoToUnscheduled: () => void;
  onReviewProposal: (proposal: SchedulingProposal) => void;
  onAddClass: () => void;
  onAddStudent: () => void;
  onOpenScheduling: () => void;
  onGoToTerms: () => void;
}

function AttentionRow({
  count,
  label,
  actionLabel,
  onAction,
}: {
  count: number;
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-amber-50 px-2 text-sm font-bold text-amber-800">
        {formatNumber(count)}
      </span>
      <span className="min-w-0 flex-1 text-sm text-slate-900">{label}</span>
      <Button size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </li>
  );
}

/**
 * Overview: only operational status that can be derived reliably from existing API data, plus next actions.
 * Deliberately no table. Every number comes from `summarizeOverview` (see lib/overview.ts for the rules).
 */
export function OverviewPage({
  term,
  classes,
  schedules,
  proposals,
  loading,
  loadError,
  dataMatchesTerm = true,
  onRetry,
  onGoToClasses,
  onGoToUnscheduled,
  onReviewProposal,
  onAddClass,
  onAddStudent,
  onOpenScheduling,
  onGoToTerms,
}: OverviewPageProps) {
  if (loading) {
    return (
      <>
        <PageHeader title="نمای کلی" />
        <LoadingState />
      </>
    );
  }

  // A failed load with nothing trustworthy to show must read as an error, never as "no classes".
  const noUsableData = !term || !dataMatchesTerm || classes.length === 0;
  if (loadError && noUsableData) {
    return (
      <>
        <PageHeader title="نمای کلی" />
        <div role="alert">
          <EmptyState
            title="بارگذاری اطلاعات انجام نشد"
            description={term ? `اطلاعات ترم «${term.name}» بارگذاری نشد. ${loadError}` : loadError}
            action={
              <Button variant="primary" onClick={onRetry}>
                تلاش دوباره
              </Button>
            }
          />
        </div>
      </>
    );
  }

  // Classes still belong to another term (a switch is in progress): never count them for this one.
  if (term && !dataMatchesTerm) {
    return (
      <>
        <PageHeader title="نمای کلی" />
        <LoadingState />
      </>
    );
  }

  if (!term) {
    return (
      <>
        <PageHeader title="نمای کلی" />
        <EmptyState
          title="هنوز ترمی ثبت نشده است"
          description="برای شروع، یک ترم تحصیلی ایجاد کنید."
          action={
            <Button variant="primary" onClick={onGoToTerms}>
              رفتن به ترم‌ها
            </Button>
          }
        />
      </>
    );
  }

  const summary = summarizeOverview({ classes, schedules, proposals });
  const header = (
    <PageHeader
      title="نمای کلی"
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span dir="auto" className="font-medium text-slate-800">
            {term.name}
          </span>
          <span className="rounded-lg bg-slate-100 px-2 text-xs text-slate-700">
            {TERM_STATUS_LABEL[term.status]}
          </span>
          <span>{formatJalaliRange(term.startDate, term.endDate)}</span>
        </span>
      }
    />
  );

  if (classes.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="در این ترم هنوز کلاسی ثبت نشده است"
          description="با افزودن کلاس، وضعیت معلم‌ها و زمان‌بندی در این صفحه نمایش داده می‌شود."
          action={
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden="true" />} onClick={onAddClass}>
              افزودن کلاس
            </Button>
          }
        />
      </>
    );
  }

  const firstPending = summary.pendingProposals[0];

  return (
    <>
      {header}

      {/* Refresh failed but the numbers below are from the last successful load of this same term. */}
      {loadError ? (
        <ErrorBanner
          title="به‌روزرسانی انجام نشد؛ اعداد زیر مربوط به آخرین بارگذاری موفق این ترم است."
          message={loadError}
          onRetry={onRetry}
        />
      ) : null}

      <div className="space-y-8">
        <section aria-labelledby="overview-attention">
          <h2 id="overview-attention" className="mb-3 text-base font-semibold text-slate-900">
            نیازمند توجه
          </h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {summary.classesWithoutTeacher.length > 0 ? (
              <AttentionRow
                count={summary.classesWithoutTeacher.length}
                label="کلاس بدون معلم"
                actionLabel="مشاهده کلاس‌ها"
                onAction={onGoToClasses}
              />
            ) : null}
            {summary.unscheduledClasses.length > 0 ? (
              <AttentionRow
                count={summary.unscheduledClasses.length}
                label="کلاس بدون زمان‌بندی"
                actionLabel="زمان‌بندی کلاس‌ها"
                onAction={onGoToUnscheduled}
              />
            ) : null}
            {firstPending ? (
              <AttentionRow
                count={summary.pendingProposals.length}
                label="پیشنهاد زمان‌بندی در انتظار بررسی"
                actionLabel="بررسی پیشنهاد"
                onAction={() => onReviewProposal(firstPending)}
              />
            ) : null}
            {summary.attentionItemCount === 0 ? (
              <li className="flex items-center gap-2 px-4 py-4 text-sm text-slate-700">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>موردی برای رسیدگی پیدا نشد.</span>
              </li>
            ) : null}
          </ul>
          {summary.proposalsMayBeTruncated ? (
            <p className="mt-2 text-xs text-slate-500">
              فقط {formatNumber(PROPOSAL_FETCH_LIMIT)} پیشنهاد اول بررسی شده است؛ تعداد پیشنهادهای در انتظار ممکن است بیشتر باشد.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="overview-status">
          <h2 id="overview-status" className="mb-3 text-base font-semibold text-slate-900">
            وضعیت ترم
          </h2>
          <dl className="grid grid-cols-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <dt className="text-sm text-slate-600">کلاس‌های جاری</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(summary.openClassCount)}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-sm text-slate-600">کلاس‌های زمان‌بندی‌شده</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900">
                {formatNumber(summary.scheduledClassCount)}
              </dd>
            </div>
            {summary.atCapacityCount !== null ? (
              <div className="px-4 py-3">
                <dt className="text-sm text-slate-600">کلاس‌های با ظرفیت تکمیل</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">
                  {formatNumber(summary.atCapacityCount)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            کلاس‌های جاری شامل کلاس‌های فعال و پیش‌نویس است؛ کلاس‌های لغوشده و پایان‌یافته شمرده نمی‌شوند.
            {summary.classesMayBeTruncated
              ? ` فقط ${formatNumber(CLASS_FETCH_LIMIT)} کلاس اول این ترم بررسی شده است؛ اعداد ممکن است ناقص باشند.`
              : ''}
          </p>
        </section>

        <section aria-labelledby="overview-actions">
          <h2 id="overview-actions" className="mb-3 text-base font-semibold text-slate-900">
            اقدام‌های بعدی
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden="true" />} onClick={onAddClass}>
              افزودن کلاس
            </Button>
            <Button icon={<UserPlus className="size-4" aria-hidden="true" />} onClick={onAddStudent}>
              افزودن دانش‌آموز
            </Button>
            <Button icon={<CalendarDays className="size-4" aria-hidden="true" />} onClick={onOpenScheduling}>
              باز کردن زمان‌بندی
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
