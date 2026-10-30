/**
 * Error routing for dialogs and the scheduling page.
 *
 * Rule: an error that comes from an open dialog's create / edit / save / add / remove / load operation is shown INSIDE
 * that dialog (InlineError, role="alert", persistent). The page-level `error` is only the list-load failure. A result
 * with no dialog (failed activate/close/delete) is a global notification. Nothing is shown both ways.
 *
 * The managers load data in effects and open dialogs from state, so (like classes-error-state.spec.ts and
 * term-sync.spec.ts) the wiring is checked against the source; InlineError itself is rendered for real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { InlineError } from '../../apps/web/components/ui/InlineError';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, 'apps/web', p), 'utf8');

/** Source of `const <name> = async (...) => { ... }` up to the next top-level handler. */
function handler(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `${name} not found`);
  // A handler ends at the next top-level `const`, or at the component's `return (` when it is the last one.
  const ends = ['\n  const ', '\n  return ('].map((m) => src.indexOf(m, start + 10)).filter((i) => i !== -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}
const catchPart = (body: string) => body.slice(body.indexOf('catch (err'));
/** Source from `marker` to the end of its dialog (next marker, or end of file). */
function region(src: string, marker: string, until?: string): string {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker} not found`);
  const end = until ? src.indexOf(until, start + marker.length) : -1;
  return src.slice(start, end === -1 ? undefined : end);
}

describe('InlineError', () => {
  it('renders an assertive alert with the message and no timer', () => {
    const html = renderToString(React.createElement(InlineError, { message: 'Could not save' }));
    assert.match(html, /role="alert"/);
    assert.ok(html.includes('Could not save'));
    assert.doesNotMatch(html, /Dismiss error/);
    assert.doesNotMatch(readFileSync(join(root, 'apps/web/components/ui/InlineError.tsx'), 'utf8'), /setTimeout/);
  });

  it('renders nothing for an empty message and a labelled dismiss button when asked', () => {
    assert.equal(renderToString(React.createElement(InlineError, { message: null })), '');
    assert.equal(renderToString(React.createElement(InlineError, { message: '' })), '');
    const html = renderToString(React.createElement(InlineError, { message: 'x', onDismiss: () => {} }));
    assert.match(html, /aria-label="Dismiss error"/);
  });
});

describe('TeachersManager', () => {
  const src = read('components/people/TeachersManager.tsx');
  const skillsDialog = region(src, '{skillsTeacher && (');
  const formDialog = region(src, '{isModalOpen && (', '{/* Skills Qualification Modal */}');

  it('teacher create/edit failures and name validation go to formError, shown inside the teacher dialog', () => {
    const save = handler(src, 'handleSaveTeacher');
    assert.match(save, /setFormError\('First and last name are required\.'\)/);
    assert.match(catchPart(save), /setFormError\(err\.message \|\| 'Failed to save teacher'\)/);
    assert.doesNotMatch(save, /setError\(/);
    assert.match(formDialog, /<InlineError message=\{formError\} \/>/);
  });

  it('keeps the teacher dialog open on failure (it only closes after success)', () => {
    assert.doesNotMatch(catchPart(handler(src, 'handleSaveTeacher')), /setIsModalOpen\(false\)/);
  });

  it('skill add and remove failures go to skillsError, shown inside the skills dialog, not the page banner', () => {
    for (const [name, text] of [
      ['handleAddSkill', 'Failed to add teacher skill qualification'],
      ['handleDeleteSkill', 'Failed to remove skill'],
    ] as const) {
      const body = handler(src, name);
      assert.match(catchPart(body), new RegExp(`setSkillsError\\(err\\.message \\|\\| '${text}'\\)`));
      assert.doesNotMatch(body, /setError\(/);
    }
    assert.match(skillsDialog, /<InlineError message=\{skillsError\} \/>/);
    assert.doesNotMatch(skillsDialog, /\{error &&/);
  });

  it('a failed skills load is reported in the skills dialog instead of only the console', () => {
    const open = handler(src, 'openSkillsModal');
    assert.match(catchPart(open), /setSkillsError\(/);
    assert.doesNotMatch(open, /console\.error/);
  });

  it('the page-level banner is only for the list load, and success is a transient notification', () => {
    assert.match(handler(src, 'fetchTeachersAndBooks'), /setError\(err\.message \|\| 'Failed to fetch teachers or books'\)/);
    assert.doesNotMatch(src, /successMsg|setSuccessMsg/);
    assert.match(src, /notifier\.success\(/);
  });

  it('does not show a dialog error as a toast as well', () => {
    for (const name of ['handleSaveTeacher', 'handleAddSkill', 'handleDeleteSkill']) {
      assert.doesNotMatch(catchPart(handler(src, name)), /notifier\.error/, name);
    }
  });
});

describe('BooksManager', () => {
  const src = read('components/academic/BooksManager.tsx');

  it('book, part and segment save failures go to formError, not the list-load error', () => {
    for (const [name, text] of [
      ['handleSaveBook', 'Failed to save book'],
      ['handleSavePart', 'Failed to add book part'],
      ['handleSaveSegment', 'Failed to add book segment'],
    ] as const) {
      const body = handler(src, name);
      assert.match(catchPart(body), new RegExp(`setFormError\\(err\\.message \\|\\| '${text}'\\)`), name);
      assert.doesNotMatch(body, /setError\(/, name);
      assert.doesNotMatch(catchPart(body), /notifier\.error/, name);
    }
  });

  it('each of the three dialogs renders formError inside its form', () => {
    for (const [open, form, until] of [
      ['{isBookModalOpen && (', 'handleSaveBook', '{/* Part Modal */}'],
      ['{isPartModalOpen && (', 'handleSavePart', '{/* Segment Modal */}'],
      ['{isSegmentModalOpen && (', 'handleSaveSegment', undefined],
    ] as const) {
      const dialog = region(src, open, until);
      const form_ = dialog.slice(dialog.indexOf(`<form onSubmit={${form}}`));
      assert.match(form_, /^[^]*?<InlineError message=\{formError\} \/>/, `${form}`);
      assert.ok(dialog.indexOf('<InlineError') > dialog.indexOf('fixed inset-0'), 'must be inside the overlay');
    }
  });

  it('opening a dialog clears a stale error, and the list-load banner and success handling are unchanged in kind', () => {
    for (const fn of ['openCreateBookModal = () =>', 'openEditBookModal = (book: BookItem) =>', 'openCreatePartModal = (book: BookItem) =>', 'openCreateSegmentModal = (part: BookPartItem) =>']) {
      assert.match(src.slice(src.indexOf(fn), src.indexOf(fn) + 120), /setFormError\(null\)/, fn);
    }
    assert.match(handler(src, 'fetchBooks'), /setError\(err\.message \|\| 'Failed to fetch books'\)/);
    assert.doesNotMatch(src, /successMsg|setSuccessMsg/);
  });
});

describe('AcademicTermsManager', () => {
  const src = read('components/academic/AcademicTermsManager.tsx');
  const dialog = region(src, '{(isCreateModalOpen || editingTerm) && (');

  it('field validation and create/update failures stay inline in the dialog', () => {
    const create = handler(src, 'handleCreateTerm');
    assert.match(create, /setFormError\('Please fill in all required fields\.'\)/);
    assert.match(catchPart(create), /setFormError\(err\.message \|\| 'Failed to create academic term'\)/);
    assert.match(catchPart(handler(src, 'handleUpdateTerm')), /setFormError\(err\.message \|\| 'Failed to update academic term'\)/);
    assert.doesNotMatch(create + handler(src, 'handleUpdateTerm'), /setError\(/);
    assert.match(dialog, /<InlineError message=\{formError\} \/>/);
  });

  it('a failed activate/close has no dialog, so it is a (persistent) notification, not an inline or banner error', () => {
    for (const name of ['handleActivateTerm', 'handleCloseTerm']) {
      const body = handler(src, name);
      assert.match(catchPart(body), /notifier\.error\(/, name);
      assert.doesNotMatch(body, /setError\(|setFormError\(/, name);
    }
  });

  it('the page-level banner is only for the list load', () => {
    assert.match(handler(src, 'fetchTerms'), /setError\(err\.message \|\| 'Failed to fetch academic terms'\)/);
    assert.doesNotMatch(src, /successMsg|setSuccessMsg/);
  });
});

describe('StudentsManager', () => {
  const src = read('components/people/StudentsManager.tsx');

  it('validation and save failures are inline in the student dialog', () => {
    const save = handler(src, 'handleSaveStudent');
    assert.match(save, /setFormError\('First and last name are required\.'\)/);
    assert.match(catchPart(save), /setFormError\(err\.message \|\| 'Failed to save student record'\)/);
    assert.doesNotMatch(save, /setError\(/);
    assert.doesNotMatch(catchPart(save), /notifier\.error/);
    assert.match(region(src, '{isModalOpen && (', '{/* Inspect Student Enrollments Modal */}'), /<InlineError message=\{formError\} \/>/);
  });

  it('a failed enrollments load is shown inside the inspect dialog, not just logged', () => {
    const open = handler(src, 'openInspectModal');
    assert.match(catchPart(open), /setInspectError\(/);
    assert.doesNotMatch(open, /console\.error/);
    assert.match(region(src, '{inspectingStudent && ('), /<InlineError message=\{inspectError\} \/>/);
  });

  it('the page-level banner is only for the list load', () => {
    assert.match(handler(src, 'fetchStudents'), /setError\(err\.message \|\| 'Failed to fetch students'\)/);
    assert.doesNotMatch(src, /successMsg|setSuccessMsg/);
  });
});

describe('ClassEnrollmentsModal', () => {
  const src = read('components/classes/ClassEnrollmentsModal.tsx');

  it('enroll, withdraw and complete failures are action errors rendered inside the dialog', () => {
    for (const [name, text] of [
      ['handleEnrollStudent', 'Failed to enroll student'],
      ['handleWithdraw', 'Failed to withdraw student'],
      ['handleComplete', 'Failed to complete enrollment'],
    ] as const) {
      const body = handler(src, name);
      assert.match(catchPart(body), new RegExp(`setActionError\\(err\\.message \\|\\| '${text}'\\)`), name);
      assert.doesNotMatch(body, /setError\(/, name);
    }
    assert.match(src, /<InlineError message=\{actionError\} onDismiss=\{\(\) => setActionError\(null\)\} \/>/);
  });

  it('a roster-load failure stays a persistent alert inside the dialog, with a dismiss button', () => {
    assert.match(handler(src, 'fetchEnrollmentsAndStudents'), /setError\(err\.message \|\| 'Failed to fetch enrollment roster'\)/);
    assert.match(src, /<InlineError message=\{error\} onDismiss=\{\(\) => setError\(null\)\} \/>/);
    assert.ok(src.indexOf('<InlineError message={error}') > src.indexOf('fixed inset-0'));
  });

  it('success is a transient notification instead of a permanent in-dialog message', () => {
    assert.doesNotMatch(src, /successMsg|setSuccessMsg/);
    assert.match(src, /notifier\.success\('Student successfully enrolled in class\.'\)/);
  });
});

describe('ClassesManager keeps its established pattern', () => {
  it('still separates formError (inside the dialog) from the list-load error', () => {
    const src = read('components/classes/ClassesManager.tsx');
    assert.match(catchPart(handler(src, 'handleSaveClass')), /setFormError\(err\.message \|\| 'Failed to save class'\)/);
    assert.match(src, /role="alert"/);
  });
});

describe('Scheduling page notifications', () => {
  const page = read('app/page.tsx');

  it('uses the shared notifier: no local notification state and no ad-hoc timer', () => {
    assert.doesNotMatch(page, /setTimeout\(/);
    assert.doesNotMatch(page, /setNotification|useState<\{\s*type: 'success'/);
    assert.doesNotMatch(page, /<Toast\b/);
    assert.match(page, /const notifier = useNotifications\(\);/);
    assert.match(page, /notifier\.notify\(type, message\)/);
  });

  it('wraps the page in the single NotificationProvider', () => {
    assert.match(page, /export default function SchedulingAppPage\(\) \{\s*return \(\s*<NotificationProvider>\s*<SchedulingApp \/>/);
  });

  it('keeps the success and info messages of each flow, in English', () => {
    for (const text of [
      'Scheduling proposal created.',
      'Proposal re-validated: all slots are conflict-free.',
      'Re-validation complete:',
      'Proposal accepted.',
      "'Proposal rejected.'",
      'Class time updated. Proposal status:',
      'Weekly schedule for',
      'All schedule slots for',
      "'Class schedule updated.'",
      "'New class schedule added.'",
      "'Class schedule slot removed.'",
    ]) {
      assert.ok(page.includes(text), `missing: ${text}`);
    }
  });

  it('keeps the error notifications of flows that have no inline error', () => {
    for (const [name, text] of [
      ['handleValidateProposal', 'Could not re-validate the proposal'],
      ['handleAcceptProposal', 'Could not accept the proposal'],
      ['handleRejectProposal', 'Could not reject the proposal'],
    ] as const) {
      assert.match(catchPart(handler(page, name)), new RegExp(`showNotification\\('error', \`${text}`), name);
    }
    const del = page.slice(page.indexOf('const handleDeleteSchedule = async'), page.indexOf('// Open manual schedule modal helpers'));
    assert.match(del, /showNotification\('error', `Could not remove the class schedule slot/);
  });

  it('does not toast errors that a modal already shows inline, and still rethrows them', () => {
    for (const name of ['handleGenerateProposal', 'handleModifySlot', 'handleSaveClassSchedules', 'handleDeleteAllClassSchedules']) {
      const c = catchPart(handler(page, name));
      assert.doesNotMatch(c, /showNotification/, `${name} would show the error twice`);
      assert.match(c, /throw err;/, `${name} must keep rethrowing for the modal`);
    }
  });

  it('the Overview delete-all-slots path, which has no inline error, reports a failure as a notification', () => {
    assert.match(page, /await handleDeleteAllClassSchedules\(cls\.id\);\s*\} catch \(err: any\) \{\s*showNotification\('error', `Could not remove the schedule slots/);
  });

  it('does not change the scheduling API calls or the native confirmations', () => {
    for (const call of ['apiClient.validateProposal(', 'apiClient.acceptProposal(', 'apiClient.rejectProposal(', 'apiClient.modifyProposal(', 'apiClient.createSchedule(', 'apiClient.updateSchedule(', 'apiClient.deleteSchedule(']) {
      assert.ok(page.includes(call), call);
    }
    assert.equal((page.match(/\bconfirm\(/g) ?? []).length, 2, 'native confirm() calls are kept as they were');
  });
});
