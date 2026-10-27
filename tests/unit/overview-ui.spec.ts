/**
 * Render tests for the redesigned shell, Overview, login view and toast.
 * Uses React SSR (react-dom/server) like frontend-workflow.spec.ts, so it needs the repository's installed
 * dependencies (react, react-dom, lucide-react, clsx, tailwind-merge).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Calendar, Layers, LayoutDashboard } from 'lucide-react';
import { OverviewPage, type OverviewPageProps } from '../../apps/web/components/overview/OverviewPage';
import { LoginView } from '../../apps/web/components/auth/LoginView';
import { AppShell } from '../../apps/web/components/shell/AppShell';
import { ErrorBanner } from '../../apps/web/components/ui/ErrorBanner';
import { LoadingState } from '../../apps/web/components/ui/LoadingState';
import { Toast } from '../../apps/web/components/ui/Toast';
import type { AcademicTerm, ClassItem, Schedule, SchedulingProposal } from '../../apps/web/lib/api-client';
import { describeLoginError } from '../../apps/web/lib/auth-errors';
import { TERM_STATUS_LABEL, roleLabel } from '../../apps/web/lib/labels';

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
  it('shows the active term with an English Gregorian date range and an English status label', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')] });
    assert.ok(html.includes('Term A'));
    assert.ok(html.includes('Active'));
    assert.ok(html.includes('Sep 23, 2026'), 'start date in English');
    assert.ok(html.includes('Dec 21, 2026'), 'end date in English');
    assert.ok(html.includes('Sep 23, 2026 to Dec 21, 2026'), 'English range separator');
    assert.ok(!html.includes('2026-09-23'), 'raw ISO date must not be shown');
    assert.ok(!/[\u06F0-\u06F9]/.test(html), 'no Persian digits on Overview');
    assert.ok(!html.includes('مهر') && !html.includes('آذر') && !html.includes('تا'), 'no Jalali months or Persian separator');
  });

  it('renders counts with Latin digits', () => {
    const html = overview({
      classes: [cls('a', { teacherId: null }), cls('b', { teacherId: null }), cls('c')],
      schedules: [sched('c')],
    });
    assert.ok(/>2<\/span><span[^>]*>Classes without a teacher/.test(html), 'attention count is Latin');
    assert.ok(!/[\u06F0-\u06F9\u0660-\u0669]/.test(html), 'no Persian or Arabic-Indic digits');
  });

  it('never renders a table', () => {
    const html = overview({
      classes: [cls('a', { teacherId: null }), cls('b')],
      proposals: [proposal('p', 'PENDING_REVIEW')],
    });
    assert.ok(!/<table|<thead|<tbody|<tr[ >]|<th[ >]|<td[ >]/.test(html));
  });

  it('lists exactly the attention items that apply', () => {
    const html = overview({
      classes: [cls('a', { teacherId: null }), cls('b')],
      schedules: [],
      proposals: [proposal('p1', 'PENDING_REVIEW'), proposal('p2', 'ACCEPTED')],
    });
    assert.ok(html.includes('Classes without a teacher'));
    assert.ok(html.includes('Classes not scheduled'));
    assert.ok(html.includes('Scheduling proposals awaiting review'));
    assert.ok(html.includes('Review proposal'));
    assert.ok(!html.includes('Nothing needs attention.'));
  });

  it('says so when nothing needs attention and hides empty attention rows', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')], proposals: [proposal('p', 'ACCEPTED')] });
    assert.ok(html.includes('Nothing needs attention.'));
    assert.ok(!html.includes('Classes without a teacher'));
    assert.ok(!html.includes('Classes not scheduled'));
    assert.ok(!html.includes('awaiting review'));
  });

  it('omits the capacity figure when it cannot be computed reliably', () => {
    const unknown = overview({ classes: [cls('a', { enrolledCount: undefined })], schedules: [sched('a')] });
    assert.ok(!unknown.includes('Classes at capacity'));
    const known = overview({
      classes: [cls('a', { capacity: 5, enrolledCount: 5 })],
      schedules: [sched('a')],
    });
    assert.ok(known.includes('Classes at capacity'));
  });

  it('offers the next actions as labeled buttons', () => {
    const html = overview({ classes: [cls('a')], schedules: [sched('a')] });
    for (const label of ['Add class', 'Add student', 'Open scheduling']) {
      assert.ok(html.includes(label), label);
    }
  });

  it('warns when the class list may be truncated instead of presenting partial numbers as complete', () => {
    const many = Array.from({ length: 100 }, (_, i) => cls(`c${i}`));
    const html = overview({ classes: many, schedules: many.map((c) => sched(c.id)) });
    assert.ok(html.includes('may be incomplete'));
  });

  it('shows a loading state, an empty-term state, an empty-class state and an error state', () => {
    assert.ok(overview({ loading: true }).includes('Loading'));
    assert.ok(!overview({ loading: true }).includes('Needs attention'));
    assert.ok(overview({ term: null }).includes('No term yet'));
    const noClasses = overview({ classes: [] });
    assert.ok(noClasses.includes('No classes in this term yet'));
    assert.ok(noClasses.includes('Add class'));
    const failed = overview({ term: null, loadError: 'boom' });
    assert.ok(failed.includes('Could not load data'));
    assert.ok(failed.includes('Try again'));
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
    assert.ok(html.includes('Personnel code'));
    assert.ok(html.includes('Password'));
    assert.ok(html.includes('Sign in'));
    assert.ok(html.includes('type="password"'));
    assert.ok(/id="login-personnel-code"[^>]*value=""/.test(html) || /value=""[^>]*id="login-personnel-code"/.test(html));
    assert.ok(!/SUP-01|TCH-01|Pass123/.test(html));
    assert.equal((html.match(/dir="ltr"/g) ?? []).length >= 2, true, 'code and password inputs are LTR');
  });

  it('shows an error as an alert and offers a single submit button', () => {
    const html = render('Incorrect personnel code or password.');
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('Incorrect personnel code or password.'));
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
        React.createElement('p', null, 'Page content'),
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
    assert.ok(html.includes('Page content'));
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

describe('English UI of the Login and Overview screens', () => {
  // Arabic-script LETTERS. The Persian digits (U+06F0-06F9) are excluded: number and date formatting is a separate,
  // deliberately unchanged concern (see apps/web/lib/format.ts).
  const PERSIAN_LETTER = /[\u0600-\u06EF\u06FA-\u06FF]/;
  const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

  it('has no Persian text in the two screens or in the shared components and messages they render', () => {
    const files = [
      'apps/web/components/auth/LoginView.tsx',
      'apps/web/components/overview/OverviewPage.tsx',
      'apps/web/components/shell/AppShell.tsx',
      'apps/web/components/ui/Toast.tsx',
      'apps/web/components/ui/ErrorBanner.tsx',
      'apps/web/components/ui/LoadingState.tsx',
      'apps/web/components/ui/EmptyState.tsx',
      'apps/web/components/ui/PageHeader.tsx',
      'apps/web/lib/auth-errors.ts',
      'apps/web/lib/app-data-controller.ts',
      'apps/web/app/layout.tsx',
      'app/layout.tsx',
      'app/error.tsx',
    ];
    for (const file of files) assert.ok(!PERSIAN_LETTER.test(read(file)), `${file} contains Persian text`);
  });

  it('shows the term status and the user role in English', () => {
    for (const label of Object.values(TERM_STATUS_LABEL)) assert.ok(!PERSIAN_LETTER.test(label), label);
    assert.deepEqual(
      [roleLabel(['SUPERVISOR']), roleLabel(['TEACHER']), roleLabel([])],
      ['Supervisor', 'Teacher', 'User'],
    );
  });

  it('describes every sign-in failure in English', () => {
    for (const code of ['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'RATE_LIMIT_EXCEEDED', 'BACKEND_UNAVAILABLE', 'SOMETHING_ELSE']) {
      const message = describeLoginError({ code });
      assert.ok(message.length > 0 && !PERSIAN_LETTER.test(message), `${code}: ${message}`);
    }
  });

  it('renders the loading, error and toast components in English', () => {
    const loading = renderToString(React.createElement(LoadingState));
    const banner = renderToString(React.createElement(ErrorBanner, { message: 'boom', onRetry: noop }));
    const toast = renderToString(React.createElement(Toast, { type: 'info', message: 'x', onDismiss: noop }));
    for (const html of [loading, banner, toast]) assert.ok(!PERSIAN_LETTER.test(html), html);
    assert.ok(loading.includes('Loading'));
    assert.ok(banner.includes('Could not load data') && banner.includes('Try again'));
    assert.ok(toast.includes('Close'));
  });
});
