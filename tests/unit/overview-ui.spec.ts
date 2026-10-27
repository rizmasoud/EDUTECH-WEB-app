/**
 * Render tests for the redesigned shell, Overview, login view and toast.
 * Uses React SSR (react-dom/server) like frontend-workflow.spec.ts, so it needs the repository's installed
 * dependencies (react, react-dom, lucide-react, clsx, tailwind-merge).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Calendar, Layers, LayoutDashboard } from 'lucide-react';
import { OverviewPage, type OverviewPageProps } from '../../apps/web/components/overview/OverviewPage';
import { LoginView } from '../../apps/web/components/auth/LoginView';
import { AppShell } from '../../apps/web/components/shell/AppShell';
import { Toast } from '../../apps/web/components/ui/Toast';
import type { AcademicTerm, ClassItem, Schedule, SchedulingProposal } from '../../apps/web/lib/api-client';

const term: AcademicTerm = {
  id: 't1',
  name: 'Term A',
  startDate: '2026-09-23',
  endDate: '2026-12-21',
  status: 'ACTIVE',
};

function cls(id: string, over: Partial<ClassItem> = {}): ClassItem {
  return {
    id,
    academicTermId: 't1',
    bookId: 'b1',
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

const sched = (classId: string) => ({ id: `s-${classId}`, classId }) as unknown as Schedule;
const proposal = (id: string, status: SchedulingProposal['status']) => ({ id, status }) as unknown as SchedulingProposal;
const noop = () => {};

function overview(over: Partial<OverviewPageProps> = {}): string {
  const props: OverviewPageProps = {
    term,
    classes: [],
    schedules: [],
    proposals: [],
    loading: false,
    loadError: null,
    onRetry: noop,
    onGoToClasses: noop,
    onGoToUnscheduled: noop,
    onReviewProposal: noop,
    onAddClass: noop,
    onAddStudent: noop,
    onOpenScheduling: noop,
    onGoToTerms: noop,
    ...over,
  };
  return renderToString(React.createElement(OverviewPage, props));
}

describe('Overview page', () => {
  it('shows the active term with a Jalali date range and Persian status label', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')] });
    assert.ok(html.includes('Term A'));
    assert.ok(html.includes('فعال'));
    assert.ok(html.includes('۱ مهر ۱۴۰۵'), 'start date in Jalali');
    assert.ok(html.includes('۳۰ آذر ۱۴۰۵'), 'end date in Jalali');
    assert.ok(!html.includes('2026-09-23'), 'raw ISO date must not be shown');
  });

  it('never renders a table', () => {
    const html = overview({
      classes: [cls('a', { teacherId: null }), cls('b')],
      proposals: [proposal('p', 'PENDING_REVIEW')],
    });
    assert.ok(!/<table|<thead|<tbody|<tr[ >]|<th[ >]|<td[ >]/.test(html));
  });

  it('lists exactly the attention items that apply, with Persian counts', () => {
    const html = overview({
      classes: [cls('a', { teacherId: null }), cls('b')],
      schedules: [],
      proposals: [proposal('p1', 'PENDING_REVIEW'), proposal('p2', 'ACCEPTED')],
    });
    assert.ok(html.includes('کلاس بدون معلم'));
    assert.ok(html.includes('کلاس بدون زمان‌بندی'));
    assert.ok(html.includes('پیشنهاد زمان‌بندی در انتظار بررسی'));
    assert.ok(html.includes('بررسی پیشنهاد'));
    assert.ok(!html.includes('موردی برای رسیدگی پیدا نشد.'));
  });

  it('says so when nothing needs attention and hides empty attention rows', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')], proposals: [proposal('p', 'ACCEPTED')] });
    assert.ok(html.includes('موردی برای رسیدگی پیدا نشد.'));
    assert.ok(!html.includes('کلاس بدون معلم'));
    assert.ok(!html.includes('کلاس بدون زمان‌بندی'));
    assert.ok(!html.includes('در انتظار بررسی'));
  });

  it('omits the capacity figure when it cannot be computed reliably', () => {
    const unknown = overview({ classes: [cls('a', { enrolledCount: undefined })], schedules: [sched('a')] });
    assert.ok(!unknown.includes('کلاس‌های با ظرفیت تکمیل'));
    const known = overview({
      classes: [cls('a', { capacity: 5, enrolledCount: 5 })],
      schedules: [sched('a')],
    });
    assert.ok(known.includes('کلاس‌های با ظرفیت تکمیل'));
  });

  it('offers the next actions as labeled buttons', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')] });
    for (const label of ['افزودن کلاس', 'افزودن دانش‌آموز', 'باز کردن زمان‌بندی']) {
      assert.ok(html.includes(label), label);
    }
  });

  it('warns when the class list may be truncated instead of presenting partial numbers as complete', () => {
    const many = Array.from({ length: 100 }, (_, i) => cls(`c${i}`));
    const html = overview({ classes: many, schedules: many.map((c) => sched(c.id)) });
    assert.ok(html.includes('ممکن است ناقص باشند'));
  });

  it('shows a loading state, an empty-term state, an empty-class state and an error state', () => {
    assert.ok(overview({ loading: true }).includes('در حال بارگذاری'));
    assert.ok(!overview({ loading: true }).includes('نیازمند توجه'));
    assert.ok(overview({ term: null }).includes('هنوز ترمی ثبت نشده است'));
    const noClasses = overview({ classes: [] });
    assert.ok(noClasses.includes('در این ترم هنوز کلاسی ثبت نشده است'));
    assert.ok(noClasses.includes('افزودن کلاس'));
    const failed = overview({ term: null, loadError: 'boom' });
    assert.ok(failed.includes('بارگذاری اطلاعات انجام نشد'));
    assert.ok(failed.includes('تلاش دوباره'));
  });
});

describe('Login view', () => {
  const render = (error?: string | null) =>
    renderToString(
      React.createElement(LoginView, {
        personnelCode: '',
        password: '',
        onPersonnelCodeChange: noop,
        onPasswordChange: noop,
        onSubmit: noop,
        error,
      }),
    );

  it('renders empty, labeled, left-to-right credential fields with no demo values', () => {
    const html = render();
    assert.ok(html.includes('کد پرسنلی'));
    assert.ok(html.includes('رمز عبور'));
    assert.ok(html.includes('type="password"'));
    assert.ok(/id="login-personnel-code"[^>]*value=""/.test(html) || /value=""[^>]*id="login-personnel-code"/.test(html));
    assert.ok(!/SUP-01|TCH-01|Pass123/.test(html));
    assert.equal((html.match(/dir="ltr"/g) ?? []).length >= 2, true, 'code and password inputs are LTR');
  });

  it('shows an error as an alert and offers a single submit button', () => {
    const html = render('کد پرسنلی یا رمز عبور اشتباه است.');
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('کد پرسنلی یا رمز عبور اشتباه است.'));
    assert.equal((html.match(/type="submit"/g) ?? []).length, 1);
  });
});

describe('App shell', () => {
  const items = [
    { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
    { id: 'SCHEDULING', label: 'Scheduling', icon: Calendar },
    { id: 'CLASSES', label: 'Classes', icon: Layers },
  ];
  const render = (roles: string[] = ['SUPERVISOR']) =>
    renderToString(
      React.createElement(
        AppShell,
        {
          items,
          activeId: 'SCHEDULING',
          onNavigate: noop,
          user: { id: 'u1', personnelCode: 'SUP-01', isActive: true, roles },
          terms: [term],
          activeTerm: term,
          onSelectTerm: noop,
          onRefresh: noop,
          onLogout: noop,
        },
        React.createElement('p', null, 'محتوای صفحه'),
      ),
    );

  it('renders every navigation item with a visible text label and marks the current page', () => {
    const html = render();
    for (const item of items) assert.ok(html.includes(`<span>${item.label}</span>`), item.label);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  });

  it('has one header with the term selector, the personnel code kept left-to-right, the role label, and sign out', () => {
    const html = render();
    assert.equal((html.match(/<header/g) ?? []).length, 1);
    assert.ok(html.includes('id="app-term-select"'));
    assert.ok(html.includes('dir="ltr"'));
    assert.ok(html.includes('SUP-01'));
    assert.ok(html.includes('Supervisor'));
    assert.ok(html.includes('Sign out'));
    assert.ok(html.includes('محتوای صفحه'));
  });

  it('labels a teacher as a teacher, not a supervisor', () => {
    // React SSR separates adjacent text nodes with <!-- -->, so assert on the label, not on "(label)".
    const html = render(['TEACHER']);
    assert.ok(html.includes('Teacher'));
    assert.ok(!html.includes('Supervisor'));
  });
});

describe('Toast', () => {
  it('announces errors assertively and other messages politely', () => {
    assert.ok(renderToString(React.createElement(Toast, { type: 'error', message: 'x' })).includes('role="alert"'));
    assert.ok(renderToString(React.createElement(Toast, { type: 'success', message: 'x' })).includes('role="status"'));
    assert.ok(renderToString(React.createElement(Toast, { type: 'info', message: 'x' })).includes('role="status"'));
  });
});
