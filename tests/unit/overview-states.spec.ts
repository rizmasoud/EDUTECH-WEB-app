/**
 * Overview loading / empty / error states are distinct, and a failed load is never shown as an empty term
 * or as another term's numbers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { OverviewPage, type OverviewPageProps } from '../../apps/web/components/overview/OverviewPage';
import type { AcademicTerm, ClassItem } from '../../apps/web/lib/api-client';

const term: AcademicTerm = { id: 't1', name: 'Term A', startDate: '2026-09-23', endDate: '2026-12-21', status: 'ACTIVE' };
const aClass: ClassItem = {
  id: 'c1',
  academicTermId: 't1',
  bookId: 'b',
  bookSegmentId: null,
  teacherId: null,
  className: 'c1',
  classType: 'REGULAR',
  status: 'ACTIVE',
  capacity: 10,
  enrolledCount: 2,
};

function render(over: Partial<OverviewPageProps> = {}): string {
  const noop = () => {};
  const props: OverviewPageProps = {
    term,
    classes: [aClass],
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

const EMPTY_TERM = 'No classes in this term yet';
const ERROR_TITLE = 'Could not load data';
const RETRY = 'Try again';

describe('Overview states', () => {
  it('a failed load with a known term and no classes is an error with retry, not an empty term', () => {
    const html = render({ classes: [], loadError: 'boom' });
    assert.ok(html.includes(ERROR_TITLE));
    assert.ok(html.includes(RETRY));
    assert.ok(html.includes('role="alert"'));
    assert.ok(!html.includes(EMPTY_TERM));
    assert.ok(html.includes('boom'));
  });

  it('a failed load with classes that belong to another term is an error, never their numbers', () => {
    const html = render({ dataMatchesTerm: false, loadError: 'boom' });
    assert.ok(html.includes(ERROR_TITLE));
    assert.ok(!html.includes('Needs attention'), 'no attention list built from another term');
  });

  it('a failed refresh keeps same-term data but shows a persistent error with retry', () => {
    const html = render({ loadError: 'timeout' });
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes(RETRY));
    assert.ok(html.includes('Needs attention'));
    assert.ok(html.includes('last successful load'));
  });

  it('classes of another term are not counted while a term switch is loading', () => {
    const html = render({ dataMatchesTerm: false, loading: false });
    assert.ok(!html.includes('Needs attention'));
    assert.ok(!html.includes(EMPTY_TERM));
    assert.ok(html.includes('Loading'));
  });

  it('loading, empty term and no term stay distinct', () => {
    const loading = render({ loading: true });
    const empty = render({ classes: [] });
    const noTerm = render({ term: null, classes: [] });
    assert.ok(loading.includes('Loading') && !loading.includes(EMPTY_TERM) && !loading.includes(ERROR_TITLE));
    assert.ok(empty.includes(EMPTY_TERM) && !empty.includes(ERROR_TITLE));
    assert.ok(noTerm.includes('No term yet') && !noTerm.includes(ERROR_TITLE));
  });

  it('without a term, a failed load is an error rather than "no term"', () => {
    const html = render({ term: null, classes: [], loadError: 'down' });
    assert.ok(html.includes(ERROR_TITLE));
    assert.ok(!html.includes('No term yet'));
  });

  it('a healthy load shows no error', () => {
    const html = render();
    assert.ok(!html.includes(ERROR_TITLE));
    assert.ok(!html.includes('role="alert"'));
  });
});
