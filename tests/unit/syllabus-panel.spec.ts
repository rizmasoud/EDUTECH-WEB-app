/**
 * Supervisor syllabus panel.
 *  - SyllabusPanelView is presentational, so every state is rendered with React SSR (react-dom/server) like
 *    overview-ui.spec.ts: loading, error, empty, the book's one syllabus, items, dialogs, Supervisor-only.
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

const bookSyllabus: SyllabusDetail = {
  id: 's-book',
  bookId: 'b1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function render(over: Partial<SyllabusPanelViewProps> = {}): string {
  const props: SyllabusPanelViewProps = {
    isSupervisor: true,
    bookName: 'Touchstone 1',
    loading: false,
    loadError: null,
    actionError: null,
    syllabus: null,
    creating: false,
    items: undefined,
    itemsLoading: false,
    itemsError: null,
    reordering: false,
    itemDialog: null,
    onRetry: noop,
    onCreate: noop,
    onAddItem: noop,
    onEditItem: noop,
    onSubmitItem: noop,
    onCloseItem: noop,
    onMoveItem: noop,
    onDismissActionError: noop,
    ...over,
  };
  // React SSR separates adjacent text chunks with <!-- --> markers; drop them to assert on what the user reads.
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
  it('renders the panel for a Supervisor, naming the book it belongs to', () => {
    const html = render();
    assert.match(html, /aria-label="Syllabus"/);
    assert.match(html, /Touchstone 1/);
    assert.match(html, /Each book has exactly one syllabus/);
  });

  it('renders nothing at all for any other role, even with data and dialogs open', () => {
    const html = render({
      isSupervisor: false,
      syllabus: bookSyllabus,
      items: [item('a', 1)],
      itemDialog: { syllabusId: 's-book', error: null, saving: false },
    });
    assert.equal(html, '');
  });
});

describe('SyllabusPanelView: Book-level model (no Part or Segment)', () => {
  const states = [
    render(),
    render({ syllabus: bookSyllabus, items: [item('a', 1)] }),
    render({ syllabus: bookSyllabus, items: [], itemDialog: { syllabusId: 's-book', error: null, saving: false } }),
  ];

  it('never asks for or shows a part, segment or scope', () => {
    for (const html of states) {
      assert.doesNotMatch(html, /[Ss]egment|Whole book|Scope|<select[^>]*scope/);
      assert.doesNotMatch(html, /Change scope|Reload segments/);
    }
  });

  it('has no scope dialog, scope selector or edit-syllabus control', () => {
    const src = read('apps/web/components/academic/SyllabusPanelView.tsx') + read('apps/web/components/academic/SyllabusPanel.tsx');
    assert.doesNotMatch(src, /ScopeDialog|segmentOptions|segmentError|onEditSyllabus|onNewSyllabus|bookSegment/);
  });
});

describe('SyllabusPanelView: loading, error and empty states', () => {
  it('shows a loading status and no empty message while loading', () => {
    const html = render({ loading: true });
    assert.match(html, /role="status"/);
    assert.match(html, /Loading syllabus\.\.\./);
    assert.doesNotMatch(html, /No syllabus yet/);
    assert.doesNotMatch(html, /Create Syllabus/);
  });

  it('shows a load failure as an alert with a retry, never as an empty book or a create button', () => {
    const html = render({ loadError: 'Failed to load syllabus' });
    assert.match(html, /role="alert"/);
    assert.match(html, /Failed to load syllabus/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /No syllabus yet/);
    assert.doesNotMatch(html, /Create Syllabus/);
  });

  it('explains a book without a syllabus and offers to create it', () => {
    const html = render();
    assert.match(html, /No syllabus yet/);
    assert.match(html, /Create the syllabus for this book/);
    assert.match(html, /Create Syllabus/);
    assert.equal(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Create Syllabus/.exec(html)![0]), false);
  });

  it('disables create while it is running', () => {
    const html = render({ creating: true });
    assert.ok(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Create Syllabus/.exec(html)![0]));
  });

  it('offers no create once the book has its syllabus (exactly one per book)', () => {
    const html = render({ syllabus: bookSyllabus, items: [] });
    assert.doesNotMatch(html, /Create Syllabus/);
    assert.doesNotMatch(html, /New Syllabus/);
  });

  it('shows a create/reorder failure above content that stays visible', () => {
    const html = render({
      syllabus: bookSyllabus,
      items: [item('a', 1)],
      actionError: 'Sequence order 2 is already in use for this syllabus.',
    });
    assert.match(html, /role="alert"/);
    assert.match(html, /Sequence order 2 is already in use/);
    assert.match(html, /Title a/);
    assert.match(html, /Dismiss error/);
  });
});

describe('SyllabusPanelView: items of the book syllabus', () => {
  it('shows ordered items directly, with type, required flag and description', () => {
    const html = render({
      syllabus: bookSyllabus,
      items: [
        item('b', 2, { title: 'Second', type: 'FILM', required: false }),
        item('a', 1, { title: 'First', description: 'Chapter one' }),
      ],
    });
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
    assert.doesNotMatch(html, /aria-expanded/);
  });

  it('shows loading, error and empty states for the items', () => {
    const loading = render({ syllabus: bookSyllabus, itemsLoading: true });
    assert.match(loading, /Loading items\.\.\./);
    assert.ok(isDisabled(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Add Item/.exec(loading)![0]));

    const failed = render({ syllabus: bookSyllabus, itemsError: 'Failed to load syllabus items' });
    assert.match(failed, /Failed to load syllabus items/);

    const empty = render({ syllabus: bookSyllabus, items: [] });
    assert.match(empty, /This syllabus has no items yet\./);
    assert.match(empty, /0 items/);
  });

  it('uses the singular for one item', () => {
    assert.match(render({ syllabus: bookSyllabus, items: [item('a', 1)] }), /1 item</);
  });
});

describe('SyllabusPanelView: reordering', () => {
  const shown = {
    syllabus: bookSyllabus,
    items: [item('a', 1, { title: 'First' }), item('b', 2, { title: 'Middle' }), item('c', 3, { title: 'Last' })],
  };

  it('disables "up" on the first item and "down" on the last, and nothing else', () => {
    const html = render(shown);
    assert.ok(isDisabled(buttonTag(html, 'Move First up')));
    assert.equal(isDisabled(buttonTag(html, 'Move First down')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Middle up')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Middle down')), false);
    assert.equal(isDisabled(buttonTag(html, 'Move Last up')), false);
    assert.ok(isDisabled(buttonTag(html, 'Move Last down')));
  });

  it('locks every move and edit button while a reorder is running', () => {
    const html = render({ ...shown, reordering: true });
    for (const label of ['Move First up', 'Move First down', 'Move Middle up', 'Move Last down', 'Edit Middle']) {
      assert.ok(isDisabled(buttonTag(html, label)), label);
    }
  });
});

describe('SyllabusPanelView: no unsafe delete', () => {
  const html = render({ syllabus: bookSyllabus, items: [item('a', 1), item('b', 2)] });

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

describe('SyllabusPanelView: item dialog', () => {
  const siblings = [item('a', 1), item('b', 2)];

  it('adds an item with the next free order, every shared type, and "required" on by default', () => {
    const html = render({
      syllabus: bookSyllabus,
      items: siblings,
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
      syllabus: bookSyllabus,
      items: [siblings[0], existing],
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
      syllabus: bookSyllabus,
      items: siblings,
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

  function callback(name: string): string {
    const start = src.indexOf(`const ${name} = useCallback(`);
    assert.ok(start >= 0, `${name} not found`);
    return src.slice(start, src.indexOf('\n  }, [', start));
  }

  it('only loads data for a Supervisor', () => {
    const effect = src.slice(src.indexOf('useEffect(() => {'));
    assert.match(effect, /if \(!isSupervisor\) return;\s*\n\s*void loadSyllabus\(\);/);
  });

  it('applies a response only if it is still the latest request, and invalidates on unmount', () => {
    assert.ok((src.match(/isLatest\(token\)/g) ?? []).length >= 4);
    assert.match(src, /return \(\) => \{\s*syllabusGuard\.invalidate\(\);\s*itemsGuard\.invalidate\(\);/);
  });

  it('looks the syllabus up by book id only and never touches parts or segments', () => {
    const body = callback('loadSyllabus');
    assert.match(body, /await apiClient\.getSyllabi\(\{ bookId: book\.id \}\)/);
    assert.match(body, /pickBookSyllabus\(list, book\.id\)/);
    assert.doesNotMatch(src, /getBookParts|getBookSegments|bookSegment|segmentId/);
  });

  it('creates the syllabus with a book-only payload and reports failure as an action error', () => {
    const body = handler('handleCreate');
    assert.match(body, /buildCreateSyllabusPayload\(book\.id\)/);
    assert.match(body, /await apiClient\.createSyllabus\(create\.data\)/);
    assert.match(body, /setActionError\(describeSyllabusError\(err, 'Failed to create syllabus'\)\)/);
    assert.match(body, /if \(creating \|\| syllabus\) return;/);
    assert.doesNotMatch(body, /setLoadError/);
  });

  it('closes the item dialog only after a successful request, and validates before sending', () => {
    const body = handler('handleSubmitItem');
    const catchIdx = body.indexOf('catch (err');
    assert.ok(catchIdx > 0);
    assert.doesNotMatch(body.slice(catchIdx), /Dialog\(null\)/);
    assert.ok(body.indexOf('await apiClient') > body.indexOf('validateItemForm'));
  });

  it('reports a failed item save inside the item dialog, never through the load error', () => {
    const body = handler('handleSubmitItem');
    assert.match(body, /describeSyllabusError\(err, 'Failed to save syllabus item'\)/);
    assert.match(body, /setItemDialog\(\(cur\) => \(cur \? \{ \.\.\.cur, saving: false, error \} : cur\)\)/);
    assert.doesNotMatch(body, /setLoadError|setActionError/);
  });

  it('reorders by one PATCH per planned step, then reloads the real order only if the syllabus is still shown', () => {
    const body = handler('handleMoveItem');
    assert.match(body, /planItemMove\(/);
    assert.match(body, /for \(const step of steps\) \{\s*await apiClient\.updateSyllabusItem\(step\.itemId, \{ sequenceOrder: step\.sequenceOrder \}\)/);
    const finallyBlock = body.slice(body.indexOf('} finally {'));
    const guardIdx = finallyBlock.indexOf('if (shouldRefreshItemsAfterReorder(syllabusIdRef.current, syllabusId))');
    const reloadIdx = finallyBlock.indexOf('await loadItems(syllabusId)');
    assert.ok(guardIdx >= 0 && reloadIdx > guardIdx);
    assert.ok(finallyBlock.indexOf('setReordering(false)') > reloadIdx, 'the lock is always released');
    assert.match(body, /partly changed/);
  });

  it('loads the items of the book syllabus as soon as it is found', () => {
    assert.match(callback('loadSyllabus'), /if \(found\) void loadItems\(found\.id\)/);
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

describe('regression: a finished reorder must not overwrite a different syllabus request', () => {
  it('model: the shared guard keeps the newest request as the only valid one', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    assert.equal(guard.isLatest(first), false);
    assert.equal(guard.isLatest(second), true);
  });

  it('refreshes only when the reordered syllabus is the one shown', () => {
    assert.equal(shouldRefreshItemsAfterReorder('A', 'A'), true);
    assert.equal(shouldRefreshItemsAfterReorder('B', 'A'), false);
    assert.equal(shouldRefreshItemsAfterReorder(null, 'A'), false);
  });
});
