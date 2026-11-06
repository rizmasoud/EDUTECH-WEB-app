/**
 * Supervisor syllabus panel.
 *  - SyllabusPanelView is presentational, so every state is rendered with React SSR (react-dom/server) like
 *    overview-ui.spec.ts: loading, error, empty, list, items, dialogs, Supervisor-only.
 *  - SyllabusPanel (the container) loads data in effects, which SSR does not run, so its behaviour is guarded at
 *    source level like classes-error-state.spec.ts, and its pure logic is covered by syllabus-utils.spec.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  SyllabusPanelView,
  type SyllabusPanelViewProps,
} from '../../apps/web/components/academic/SyllabusPanelView';
import type { SyllabusDetail, SyllabusItem } from '../../apps/web/lib/api-client';
import { createLatestRequestGuard } from '../../apps/web/lib/attendance-session-utils';
import { shouldRefreshItemsAfterReorder } from '../../apps/web/lib/syllabus-utils';

const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const noop = () => {};

function item(id: string, sequenceOrder: number, over: Partial<SyllabusItem> = {}): SyllabusItem {
  return {
    id,
    syllabusId: 's-book',
    type: 'GRAMMAR',
    title: `Title ${id}`,
    description: null,
    required: true,
    sequenceOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const wholeBook: SyllabusDetail = {
  id: 's-book',
  bookId: 'b1',
  bookSegmentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  bookSegment: null,
};
const unitOne: SyllabusDetail = {
  ...wholeBook,
  id: 's-seg',
  bookSegmentId: 'seg1',
  bookSegment: { id: 'seg1', name: 'Unit 1' },
};

function render(over: Partial<SyllabusPanelViewProps> = {}): string {
  const props: SyllabusPanelViewProps = {
    isSupervisor: true,
    bookName: 'Touchstone 1',
    loading: false,
    loadError: null,
    actionError: null,
    syllabi: [],
    segmentOptions: [{ id: 'seg1', label: 'Part 1: Units > #1 Unit 1' }],
    segmentError: null,
    expandedId: null,
    itemsBySyllabus: {},
    detailLoadingId: null,
    detailError: null,
    reordering: false,
    scopeDialog: null,
    itemDialog: null,
    onRetry: noop,
    onRetrySegments: noop,
    onToggle: noop,
    onNewSyllabus: noop,
    onEditSyllabus: noop,
    onSubmitScope: noop,
    onCloseScope: noop,
    onAddItem: noop,
    onEditItem: noop,
    onSubmitItem: noop,
    onCloseItem: noop,
    onMoveItem: noop,
    onDismissActionError: noop,
    ...over,
  };
  // React SSR separates adjacent text chunks with <!-- --> markers ("2<!-- --> <!-- -->items"); the browser
  // shows them as one text, so drop the markers to assert on what the user reads.
  return renderToString(React.createElement(SyllabusPanelView, props)).replace(/<!-- -->/g, '');
}

/** The opening tag of the first <element> whose id ends with `idSuffix` (ids come from useId, so the start varies). */
function tagWithId(html: string, element: string, idSuffix: string): string {
  const match = new RegExp(`<${element}[^>]*\\sid="[^"]*${idSuffix}"[^>]*>`).exec(html);
  assert.ok(match, `<${element}> ending in id "${idSuffix}" not rendered`);
  return match[0];
}

/** The opening tag of the first <button> that has the given aria-label. */
function buttonTag(html: string, label: string): string {
  const match = new RegExp(`<button[^>]*aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`).exec(html);
  assert.ok(match, `button "${label}" not rendered`);
  return match[0];
}

const isDisabled = (tag: string) => /\sdisabled(=""|\s|>)/.test(tag);

describe('SyllabusPanelView: Supervisor only', () => {
  it('renders the panel for a Supervisor', () => {
    const html = render();
    assert.match(html, /aria-label="Syllabus"/);
    assert.match(html, /New Syllabus/);
  });

  it('renders nothing at all for any other role, even with data and dialogs open', () => {
    const html = render({
      isSupervisor: false,
      syllabi: [wholeBook],
      expandedId: 's-book',
      itemsBySyllabus: { 's-book': [item('a', 1)] },
      scopeDialog: { mode: 'create', error: null, saving: false },
      itemDialog: { syllabusId: 's-book', error: null, saving: false },
    });
    assert.equal(html, '');
  });
});

describe('SyllabusPanelView: loading, error and empty states', () => {
  it('shows a loading status and no empty message while loading', () => {
    const html = render({ loading: true });
    assert.match(html, /role="status"/);
    assert.match(html, /Loading syllabi\.\.\./);
    assert.doesNotMatch(html, /No syllabus yet/);
  });

  it('disables "New Syllabus" while loading or after a load failure', () => {
    assert.ok(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*New Syllabus/.exec(render({ loading: true }))![0]));
    assert.ok(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*New Syllabus/.exec(render({ loadError: 'x' }))![0]));
    assert.equal(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*New Syllabus/.exec(render())![0]), false);
  });

  it('shows a load failure as an alert with a retry, never as an empty list', () => {
    const html = render({ loadError: 'Failed to load syllabi' });
    assert.match(html, /role="alert"/);
    assert.match(html, /Failed to load syllabi/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /No syllabus yet/);
  });

  it('explains an empty book and how to start', () => {
    const html = render();
    assert.match(html, /No syllabus yet/);
    assert.match(html, /whole book or for a single segment/);
  });

  it('shows a reorder failure above a list that stays visible', () => {
    const html = render({ syllabi: [wholeBook], actionError: 'Sequence order 2 is already in use for this syllabus.' });
    assert.match(html, /role="alert"/);
    assert.match(html, /Sequence order 2 is already in use/);
    assert.match(html, /Whole book/);
    assert.match(html, /Dismiss error/);
  });
});

describe('SyllabusPanelView: syllabi and items', () => {
  it('lists syllabi with their scope (whole book and segment)', () => {
    const html = render({ syllabi: [wholeBook, unitOne] });
    assert.match(html, /Whole book/);
    assert.match(html, /Segment: Unit 1/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-label="Change scope of Whole book"/);
    // collapsed: no item list and no "Add Item" until a syllabus is expanded
    assert.doesNotMatch(html, /aria-expanded="true"/);
    assert.doesNotMatch(html, /Add Item/);
  });

  it('expands to ordered items with type, required flag and description', () => {
    const html = render({
      syllabi: [wholeBook],
      expandedId: 's-book',
      itemsBySyllabus: {
        's-book': [
          item('b', 2, { title: 'Second', type: 'FILM', required: false }),
          item('a', 1, { title: 'First', description: 'Chapter one' }),
        ],
      },
    });
    assert.match(html, /aria-expanded="true"/);
    assert.ok(html.indexOf('First') < html.indexOf('Second'), 'items are shown in sequence order');
    assert.match(html, /#1/);
    assert.match(html, /#2/);
    assert.match(html, /Grammar/);
    assert.match(html, /Film/);
    assert.match(html, /Required/);
    assert.match(html, /Optional/);
    assert.match(html, /Chapter one/);
    assert.match(html, /2 items/);
    assert.match(html, /Add Item/);
  });

  it('shows loading, error and empty states for the items of an expanded syllabus', () => {
    const base = { syllabi: [wholeBook], expandedId: 's-book' };
    const loading = render({ ...base, detailLoadingId: 's-book' });
    assert.match(loading, /Loading items\.\.\./);
    assert.ok(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Add Item/.exec(loading)![0]));

    const failed = render({ ...base, detailError: 'Failed to load syllabus items' });
    assert.match(failed, /Failed to load syllabus items/);

    const empty = render({ ...base, itemsBySyllabus: { 's-book': [] } });
    assert.match(empty, /This syllabus has no items yet\./);
    assert.match(empty, /0 items/);
  });

  it('uses the singular for one item', () => {
    const html = render({ syllabi: [wholeBook], expandedId: 's-book', itemsBySyllabus: { 's-book': [item('a', 1)] } });
    assert.match(html, /1 item</);
  });
});

describe('SyllabusPanelView: reordering', () => {
  const expanded = {
    syllabi: [wholeBook],
    expandedId: 's-book',
    itemsBySyllabus: { 's-book': [item('a', 1, { title: 'First' }), item('b', 2, { title: 'Middle' }), item('c', 3, { title: 'Last' })] },
  };

  it('disables "up" on the first item and "down" on the last, and nothing else', () => {
    const html = render(expanded);
    assert.ok(isDisabled(buttonTag(html, 'Move First up')));
    assert.equal(isDisabled(buttonTag(html, 'Move First down')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Middle up')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Middle down')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Last up')), false);
    assert.ok(isDisabled(buttonTag(html, 'Move Last down')));
  });

  it('locks every move and edit button while a reorder is running', () => {
    const html = render({ ...expanded, reordering: true });
    for (const label of ['Move First up', 'Move First down', 'Move Middle up', 'Move Last down', 'Edit Middle']) {
      assert.ok(isDisabled(buttonTag(html, label)), label);
    }
  });
});

describe('SyllabusPanelView: no unsafe delete', () => {
  const html = render({
    syllabi: [wholeBook],
    expandedId: 's-book',
    itemsBySyllabus: { 's-book': [item('a', 1), item('b', 2)] },
  });

  it('offers no delete control anywhere on an item', () => {
    assert.doesNotMatch(html, /aria-label="[^"]*[Dd]elete/);
    assert.doesNotMatch(html, /title="[^"]*[Dd]elete/);
    assert.doesNotMatch(html, />\s*(Delete|Remove)\s*</);
    assert.doesNotMatch(html, /lucide-trash|data-icon="Trash/);
  });

  it('tells the Supervisor why deletion is unavailable', () => {
    assert.match(html, /role="note"/);
    assert.match(html, /Deleting syllabus items is turned off/);
    assert.match(html, /used in a Lesson Plan/);
  });
});

describe('SyllabusPanelView: syllabus dialog', () => {
  it('creates a syllabus for the whole book or a segment, in a labelled modal dialog', () => {
    const html = render({ scopeDialog: { mode: 'create', error: null, saving: false } });
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, />New Syllabus</);
    assert.match(html, /Touchstone 1/);
    assert.match(html, /<option value=""( selected="")?>Whole book<\/option>/);
    assert.match(html, /<option value="seg1">Part 1: Units &gt; #1 Unit 1<\/option>/);
    assert.match(html, /Create Syllabus/);
  });

  it('shows a save failure inside the dialog, above the form fields', () => {
    const message = 'Book segment seg9 does not belong to book b1';
    const html = render({ scopeDialog: { mode: 'create', error: message, saving: false } });
    const dialog = html.indexOf('role="dialog"');
    const alert = html.indexOf(message);
    assert.ok(dialog >= 0 && alert > dialog, 'error is rendered inside the dialog');
    assert.ok(alert < html.indexOf('Scope *'), 'error comes before the fields');
  });

  it('warns, without blocking, when the chosen scope already has a syllabus', () => {
    const html = render({ syllabi: [wholeBook], scopeDialog: { mode: 'create', error: null, saving: false } });
    assert.match(html, /Another syllabus already exists for this scope/);
    assert.ok(!isDisabled(/<button type="submit"[^>]*>/.exec(html)![0]), 'submit stays enabled');
  });

  it('edits the scope with the current segment selected and no warning for its own scope', () => {
    const html = render({
      syllabi: [wholeBook, unitOne],
      scopeDialog: { mode: 'edit', syllabus: unitOne, error: null, saving: false },
    });
    assert.match(html, />Change Syllabus Scope</);
    assert.match(html, /<option value="seg1" selected="">/);
    assert.match(html, /Save Changes/);
    assert.doesNotMatch(html, /Another syllabus already exists/);
  });

  it('keeps the current segment selectable even if the segment list failed to load', () => {
    const html = render({
      segmentOptions: [],
      scopeDialog: { mode: 'edit', syllabus: unitOne, error: null, saving: false },
    });
    assert.match(html, /<option value="seg1" selected="">Unit 1<\/option>/);
  });

  it('disables submit and cancel while saving', () => {
    const html = render({ scopeDialog: { mode: 'create', error: null, saving: true } });
    assert.ok(isDisabled(/<button type="submit"[^>]*>/.exec(html)![0]));
    assert.ok(isDisabled(buttonTag(html, 'Close dialog')));
    assert.ok(isDisabled(/<button type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Cancel/.exec(html)![0]));
  });
});

describe('SyllabusPanelView: item dialog', () => {
  const siblings = [item('a', 1), item('b', 2)];

  it('adds an item with the next free order, every shared type, and "required" on by default', () => {
    const html = render({
      syllabi: [wholeBook],
      expandedId: 's-book',
      itemsBySyllabus: { 's-book': siblings },
      itemDialog: { syllabusId: 's-book', error: null, saving: false },
    });
    assert.match(html, /role="dialog"/);
    assert.match(html, />Add Syllabus Item</);
    assert.match(html, /value="3"/);
    for (const label of ['Film', 'Workbook', 'Conversation', 'Grammar', 'Vocabulary', 'Other']) {
      assert.match(html, new RegExp(`<option value="[A-Z]+"[^>]*>${label}</option>`), label);
    }
    assert.match(tagWithId(html, 'input', '-required'), /\schecked=""/);
    assert.match(html, />Add Item</);
    assert.match(html, /Each item needs its own order number/);
  });

  it('edits an item with its current values filled in', () => {
    const existing = item('b', 2, { title: 'Existing title', description: 'Existing text', type: 'FILM', required: false });
    const html = render({
      syllabi: [wholeBook],
      expandedId: 's-book',
      itemsBySyllabus: { 's-book': [siblings[0], existing] },
      itemDialog: { syllabusId: 's-book', item: existing, error: null, saving: false },
    });
    assert.match(html, />Edit Syllabus Item</);
    assert.match(html, /value="Existing title"/);
    assert.match(html, /value="2"/);
    assert.match(html, /Existing text/);
    assert.match(html, /<option value="FILM" selected="">Film<\/option>/);
    assert.doesNotMatch(tagWithId(html, 'input', '-required'), /\schecked/);
    assert.match(html, /Save Item/);
  });

  it('shows backend validation errors (such as a duplicate order) inside the dialog, above the fields', () => {
    const message = 'Sequence order 2 is already in use for this syllabus';
    const html = render({
      syllabi: [wholeBook],
      expandedId: 's-book',
      itemsBySyllabus: { 's-book': siblings },
      itemDialog: { syllabusId: 's-book', error: message, saving: false },
    });
    const dialog = html.indexOf('role="dialog"');
    const alert = html.indexOf(message);
    assert.ok(dialog >= 0 && alert > dialog, 'error is rendered inside the dialog');
    assert.ok(alert < html.indexOf('Title *'), 'error comes before the fields');
    assert.match(html, /role="alert"/);
  });

  it('turns off native browser validation so the contract messages are the ones shown', () => {
    const html = render({ itemDialog: { syllabusId: 's-book', error: null, saving: false } });
    assert.match(html, /<form noValidate=""|<form novalidate=""/i);
    assert.match(html, /aria-required="true"/);
  });

  it('disables submit while saving', () => {
    const html = render({ itemDialog: { syllabusId: 's-book', error: null, saving: true } });
    assert.ok(isDisabled(/<button type="submit"[^>]*>/.exec(html)![0]));
  });
});

describe('SyllabusPanel (container): data flow guards', () => {
  const src = read('apps/web/components/academic/SyllabusPanel.tsx');

  /** Source of `const <name> = async (...) => { ... };` up to the next top-level declaration. */
  function handler(name: string): string {
    const start = src.indexOf(`const ${name} = async`);
    assert.ok(start >= 0, `${name} not found`);
    const next = src.indexOf('\n  const ', start + 10);
    return src.slice(start, next === -1 ? undefined : next);
  }

  it('only loads data for a Supervisor', () => {
    const effect = src.slice(src.indexOf('useEffect(() => {'));
    assert.match(effect, /if \(!isSupervisor\) return;\s*\n\s*void loadSyllabi\(\);/);
  });

  it('applies a response only if it is still the latest request, and invalidates on unmount', () => {
    assert.ok((src.match(/isLatest\(token\)/g) ?? []).length >= 6);
    assert.match(
      src,
      /return \(\) => \{\s*listGuard\.invalidate\(\);\s*detailGuard\.invalidate\(\);\s*segmentGuard\.invalidate\(\);/,
    );
  });

  it('reports a failed syllabus save inside the syllabus dialog, never through the list-load error', () => {
    const body = handler('handleSubmitScope');
    assert.match(body, /fail\(describeSyllabusError\(err, 'Failed to save syllabus'\)\)/);
    assert.doesNotMatch(body, /setLoadError|setActionError/);
  });

  it('closes a dialog only after a successful request, and validates before sending', () => {
    for (const name of ['handleSubmitScope', 'handleSubmitItem']) {
      const body = handler(name);
      const catchIdx = body.indexOf('catch (err');
      assert.ok(catchIdx > 0, name);
      assert.doesNotMatch(body.slice(catchIdx), /Dialog\(null\)/, name);
      assert.ok(body.indexOf('await apiClient') > body.search(/validateItemForm|buildCreateSyllabusPayload/), name);
    }
  });

  it('reports a failed item save inside the item dialog, never through the list-load error', () => {
    const body = handler('handleSubmitItem');
    assert.match(body, /describeSyllabusError\(err, 'Failed to save syllabus item'\)/);
    assert.match(body, /setItemDialog\(\(cur\) => \(cur \? \{ \.\.\.cur, saving: false, error \} : cur\)\)/);
    assert.doesNotMatch(body, /setLoadError|setActionError/);
  });

  it('reorders by one PATCH per planned step, then always reloads the real order', () => {
    const body = handler('handleMoveItem');
    assert.match(body, /planItemMove\(/);
    assert.match(body, /for \(const step of steps\) \{\s*await apiClient\.updateSyllabusItem\(step\.itemId, \{ sequenceOrder: step\.sequenceOrder \}\)/);
    assert.match(body, /finally \{[\s\S]*await loadItems\(syllabusId\);[\s\S]*setReordering\(false\);/);
    assert.match(body, /partly changed/);
    assert.doesNotMatch(body, /setLoadError/);
  });

  it('refetches the items of a syllabus every time it is expanded', () => {
    const toggle = src.slice(src.indexOf('const handleToggle'), src.indexOf('const handleSubmitScope'));
    assert.match(toggle, /void loadItems\(syllabusId\)/);
  });

  it('cannot delete: no delete call, DELETE request or delete handler exists', () => {
    for (const file of [
      'apps/web/components/academic/SyllabusPanel.tsx',
      'apps/web/components/academic/SyllabusPanelView.tsx',
      'apps/web/lib/syllabus-utils.ts',
    ]) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      assert.doesNotMatch(text, /deleteSyllabus|method:\s*'DELETE'|onDelete|handleDelete/, file);
    }
  });
});

describe('Books area integration', () => {
  const books = read('apps/web/components/academic/BooksManager.tsx');
  const page = read('apps/web/app/page.tsx');

  it('renders the syllabus panel inside the expanded book, passing the Supervisor flag', () => {
    assert.match(books, /import \{ SyllabusPanel \} from '\.\/SyllabusPanel';/);
    const expanded = books.slice(books.indexOf('{isExpanded && ('));
    assert.match(expanded, /<SyllabusPanel key=\{book\.id\} book=\{book\} isSupervisor=\{isSupervisor\} \/>/);
  });

  it('keeps the Books area off the Teacher navigation and out of the Teacher view', () => {
    const teacherNav = /const TEACHER_NAV[^\n]*/.exec(page)![0];
    assert.doesNotMatch(teacherNav, /BOOKS/);
    assert.match(page, /\{mainSection === 'BOOKS' && <BooksManager isSupervisor=\{isSupervisor\} \/>\}/);
  });
});

describe('regression: segment choices load independently of the syllabus list (view)', () => {
  const failedSegments = {
    syllabi: [wholeBook, unitOne],
    segmentOptions: [],
    segmentError: 'Failed to load book parts',
  };

  it('keeps the loaded syllabus list visible and "New Syllabus" enabled when segment choices fail', () => {
    const html = render(failedSegments);
    assert.match(html, /Whole book/);
    assert.match(html, /Segment: Unit 1/);
    assert.doesNotMatch(html, /No syllabus yet/);
    assert.equal(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*New Syllabus/.exec(html)![0]), false);
  });

  it('reports the segment failure as its own notice with its own retry, not as a list failure', () => {
    const html = render(failedSegments);
    assert.match(html, /role="alert"/);
    assert.match(html, /Segment choices could not be loaded\. Failed to load book parts\./);
    assert.match(html, /new syllabi are limited to the whole book/);
    assert.match(html, />Reload segments</);
    assert.doesNotMatch(html, />Try again</, 'the list retry belongs to a list failure only');
  });

  it('keeps expanded items and every item action usable', () => {
    const html = render({
      ...failedSegments,
      expandedId: 's-book',
      itemsBySyllabus: { 's-book': [item('a', 1, { title: 'First' }), item('b', 2, { title: 'Second' })] },
    });
    assert.match(html, /First/);
    assert.equal(isDisabled(buttonTag(html, 'Move First down')), false);
    assert.equal(isDisabled(buttonTag(html, 'Edit Second')), false);
    assert.equal(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Add Item/.exec(html)![0]), false);
  });

  it('still lets the Supervisor create a whole-book syllabus, and says why segments are missing', () => {
    const html = render({ ...failedSegments, syllabi: [], scopeDialog: { mode: 'create', error: null, saving: false } });
    assert.match(html, /<option value=""( selected="")?>Whole book<\/option>/);
    assert.doesNotMatch(html, /<option value="seg1"/);
    assert.match(html, /Segment choices could not be loaded\. You can still choose Whole book\./);
    assert.ok(!isDisabled(/<button type="submit"[^>]*>/.exec(html)![0]));
  });

  it('keeps the current segment selectable when editing a segment syllabus while choices are missing', () => {
    const html = render({
      ...failedSegments,
      scopeDialog: { mode: 'edit', syllabus: unitOne, error: null, saving: false },
    });
    assert.match(html, /<option value="seg1" selected="">Unit 1<\/option>/);
  });

  it('shows no segment notice when segment choices loaded, or while the list itself is loading or failed', () => {
    assert.doesNotMatch(render({ syllabi: [wholeBook] }), /Segment choices could not be loaded/);
    assert.doesNotMatch(render({ ...failedSegments, loading: true }), /Reload segments/);
    assert.doesNotMatch(render({ ...failedSegments, loadError: 'Failed to load syllabi' }), /Reload segments/);
  });

  it('a real list failure is still reported as a list failure with its retry', () => {
    const html = render({ loadError: 'Failed to load syllabi', segmentError: null });
    assert.match(html, />Try again</);
    assert.match(html, /Failed to load syllabi/);
  });
});

describe('regression: segment choices load independently of the syllabus list (container)', () => {
  const src = read('apps/web/components/academic/SyllabusPanel.tsx');

  function callback(name: string): string {
    const start = src.indexOf(`const ${name} = useCallback(`);
    assert.ok(start >= 0, `${name} not found`);
    return src.slice(start, src.indexOf('\n  }, [', start));
  }

  it('loads the syllabus list without touching parts or segments', () => {
    const body = callback('loadSyllabi');
    assert.match(body, /await apiClient\.getSyllabi\(\{ bookId: book\.id \}\)/);
    assert.doesNotMatch(body, /getBookParts|getBookSegments|setSegmentOptions|setSegmentError/);
  });

  it('loads segment choices separately, reporting failure only through segmentError', () => {
    const body = callback('loadSegmentOptions');
    assert.match(body, /segmentGuard\.begin\(\)/);
    assert.match(body, /getBookParts\(book\.id\)/);
    assert.match(body, /getBookSegments\(part\.id\)/);
    assert.match(body, /setSegmentError\(describeSyllabusError\(err, 'Failed to load segments'\)\)/);
    assert.doesNotMatch(body, /setLoadError|setLoading|setSyllabi|listGuard/);
  });

  it('never fetches the syllabus list and the segment choices in one Promise.all', () => {
    assert.doesNotMatch(src, /Promise\.all\(\[\s*apiClient\.getSyllabi/);
    assert.doesNotMatch(src, /Promise\.all\(\[[^\]]*getBookParts/);
  });

  it('starts both loads from the mount effect and gives the view a separate retry for each', () => {
    const effect = src.slice(src.indexOf('useEffect(() => {'));
    assert.match(effect, /void loadSyllabi\(\);\s*void loadSegmentOptions\(\);/);
    assert.match(src, /onRetry=\{\(\) => void loadSyllabi\(\)\}/);
    assert.match(src, /onRetrySegments=\{\(\) => void loadSegmentOptions\(\)\}/);
    assert.match(src, /segmentError=\{segmentError\}/);
  });

  it('does not reload segment choices after saving a syllabus (only the list changes)', () => {
    const body = src.slice(src.indexOf('const handleSubmitScope'), src.indexOf('const handleSubmitItem'));
    assert.match(body, /await loadSyllabi\(\)/);
    assert.doesNotMatch(body, /loadSegmentOptions/);
  });
});

describe('regression: a finished reorder must not cancel the detail request of the open syllabus', () => {
  const src = read('apps/web/components/academic/SyllabusPanel.tsx');

  /**
   * The container shares one "latest request" guard for every syllabus detail request. These two cases model the
   * race on that real guard: syllabus A is being reordered, the Supervisor expands syllabus B (its detail
   * request starts), then A's reorder finishes.
   */
  it('model: reloading the reordered syllabus unconditionally makes B\'s response stale (the old bug)', () => {
    const guard = createLatestRequestGuard();
    const tokenB = guard.begin(); // expand B -> loadItems(B)
    guard.begin(); // reorder of A finishes -> loadItems(A) restarts the shared guard
    assert.equal(guard.isLatest(tokenB), false, 'B\'s response would be discarded and B left empty');
  });

  it('model: with the fix, A\'s reorder finishing leaves B\'s request as the latest', () => {
    const guard = createLatestRequestGuard();
    const tokenB = guard.begin();
    if (shouldRefreshItemsAfterReorder('B', 'A')) guard.begin(); // skipped: B is the open syllabus
    assert.equal(guard.isLatest(tokenB), true);
  });

  it('model: A is still refreshed when it is the open syllabus (the reordered list is re-read)', () => {
    const guard = createLatestRequestGuard();
    let reloaded = false;
    if (shouldRefreshItemsAfterReorder('A', 'A')) {
      guard.begin();
      reloaded = true;
    }
    assert.equal(reloaded, true);
  });

  const moveBody = () => {
    const start = src.indexOf('const handleMoveItem = async');
    return src.slice(start, src.indexOf('\n  return (', start));
  };

  it('container: the reorder finally block reloads only behind shouldRefreshItemsAfterReorder', () => {
    const body = moveBody();
    const finallyBlock = body.slice(body.indexOf('} finally {'));
    const guardIdx = finallyBlock.indexOf('if (shouldRefreshItemsAfterReorder(expandedIdRef.current, syllabusId))');
    const reloadIdx = finallyBlock.indexOf('await loadItems(syllabusId)');
    assert.ok(guardIdx >= 0, 'reload is guarded');
    assert.ok(reloadIdx > guardIdx, 'reload happens inside the guard');
    assert.equal((body.match(/await loadItems\(/g) ?? []).length, 1, 'no unconditional reload elsewhere in the handler');
    assert.ok(finallyBlock.indexOf('setReordering(false)') > reloadIdx, 'the lock is always released');
  });

  it('container: the expanded id is mirrored in a ref on both expand and collapse', () => {
    assert.match(src, /const expandedIdRef = useRef<string \| null>\(null\);/);
    assert.equal((src.match(/expandedIdRef\.current = /g) ?? []).length, 2);
    assert.match(src, /expandedIdRef\.current = null;\s*\n\s*setExpandedId\(null\);/);
    assert.match(src, /expandedIdRef\.current = syllabusId;\s*\n\s*setExpandedId\(syllabusId\);/);
  });
});
