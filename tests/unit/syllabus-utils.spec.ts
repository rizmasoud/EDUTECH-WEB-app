/**
 * Pure logic behind the Supervisor syllabus UI (apps/web/lib/syllabus-utils.ts): validation through the shared
 * contracts, sequence ordering, scope handling, the delete policy and error wording.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SyllabusItemType } from '@edutech/shared';
import type { SyllabusDetail, SyllabusItem } from '../../apps/web/lib/api-client';
import {
  NO_CHANGES_MESSAGE,
  SYLLABUS_ITEM_DELETE_POLICY,
  SYLLABUS_ITEM_TYPES,
  SYLLABUS_ITEM_TYPE_LABEL,
  buildCreateSyllabusPayload,
  describeSyllabusError,
  emptyItemForm,
  endSentence,
  itemToForm,
  nextSequenceOrder,
  pickBookSyllabus,
  planItemMove,
  shouldRefreshItemsAfterReorder,
  sortSyllabusItems,
  validateItemForm,
  type ItemFormValues,
} from '../../apps/web/lib/syllabus-utils';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOOK_ID = '33333333-3333-4333-8333-333333333333';

function item(id: string, sequenceOrder: number, over: Partial<SyllabusItem> = {}): SyllabusItem {
  return {
    id,
    syllabusId: 's1',
    type: 'GRAMMAR',
    title: `Item ${id}`,
    description: null,
    required: true,
    sequenceOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function syllabus(id: string, bookId = BOOK_ID): SyllabusDetail {
  return {
    id,
    bookId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const form = (over: Partial<ItemFormValues> = {}): ItemFormValues => ({
  type: 'VOCABULARY',
  title: 'Unit 1 words',
  description: '',
  required: true,
  sequenceOrder: '1',
  ...over,
});

describe('syllabus item ordering helpers', () => {
  it('sorts by sequenceOrder without mutating the input', () => {
    const input = [item('c', 3), item('a', 1), item('b', 2)];
    assert.deepEqual(sortSyllabusItems(input).map((i) => i.id), ['a', 'b', 'c']);
    assert.deepEqual(input.map((i) => i.id), ['c', 'a', 'b']);
  });

  it('proposes 1 for an empty syllabus and max + 1 otherwise (gaps are not refilled)', () => {
    assert.equal(nextSequenceOrder([]), 1);
    assert.equal(nextSequenceOrder([item('a', 1), item('b', 2)]), 3);
    assert.equal(nextSequenceOrder([item('a', 1), item('b', 5)]), 6);
  });

  it('offers every shared item type with a label', () => {
    assert.deepEqual([...SYLLABUS_ITEM_TYPES].sort(), Object.values(SyllabusItemType).sort());
    for (const type of SYLLABUS_ITEM_TYPES) assert.ok(SYLLABUS_ITEM_TYPE_LABEL[type], type);
  });
});

describe('syllabus item form validation (shared contracts)', () => {
  it('builds a trimmed payload; a blank description becomes null', () => {
    const result = validateItemForm(form({ title: '  Unit 1 words  ', description: '   ' }), []);
    assert.deepEqual(result, {
      ok: true,
      data: { type: 'VOCABULARY', title: 'Unit 1 words', description: null, required: true, sequenceOrder: 1 },
    });
  });

  it('keeps a real description and the required flag', () => {
    const result = validateItemForm(form({ description: ' Learn 20 words ', required: false }), []);
    assert.ok(result.ok);
    assert.equal(result.data.description, 'Learn 20 words');
    assert.equal(result.data.required, false);
  });

  it('rejects an empty title with the contract message', () => {
    assert.deepEqual(validateItemForm(form({ title: '   ' }), []), { ok: false, error: 'Title is required' });
  });

  it('rejects a title over 255 characters', () => {
    const result = validateItemForm(form({ title: 'x'.repeat(256) }), []);
    assert.equal(result.ok, false);
  });

  it('rejects a sequence order that is empty or not a whole number', () => {
    for (const bad of ['', '  ', 'abc', '1.5']) {
      assert.deepEqual(validateItemForm(form({ sequenceOrder: bad }), []), {
        ok: false,
        error: 'Sequence order must be a whole number.',
      });
    }
  });

  it('rejects an order below 1 with the contract message', () => {
    for (const bad of ['0', '-2']) {
      assert.deepEqual(validateItemForm(form({ sequenceOrder: bad }), []), {
        ok: false,
        error: 'sequenceOrder must be at least 1',
      });
    }
  });

  it('rejects a duplicate order with the same wording the API uses', () => {
    const result = validateItemForm(form({ sequenceOrder: '2' }), [item('a', 1), item('b', 2)]);
    assert.deepEqual(result, { ok: false, error: 'Sequence order 2 is already in use for this syllabus' });
  });

  it('does not treat the edited item\'s own order as a clash, and detects an unchanged form', () => {
    const existing = item('b', 2, { type: 'VOCABULARY', title: 'Unit 1 words' });
    const siblings = [item('a', 1), existing];
    assert.deepEqual(validateItemForm(itemToForm(existing), siblings, existing), {
      ok: false,
      error: NO_CHANGES_MESSAGE,
    });
    const changed = validateItemForm({ ...itemToForm(existing), title: 'Renamed' }, siblings, existing);
    assert.ok(changed.ok);
    assert.equal(changed.data.title, 'Renamed');
  });

  it('treats a null description and an empty description field as the same value when editing', () => {
    const existing = item('a', 1, { title: 'Unit 1 words', type: 'VOCABULARY', description: null });
    assert.deepEqual(validateItemForm(form({ description: '' }), [existing], existing), {
      ok: false,
      error: NO_CHANGES_MESSAGE,
    });
  });

  it('moving an edited item onto another item\'s order is still a clash', () => {
    const a = item('a', 1);
    const b = item('b', 2);
    const result = validateItemForm({ ...itemToForm(b), sequenceOrder: '1' }, [a, b], b);
    assert.deepEqual(result, { ok: false, error: 'Sequence order 1 is already in use for this syllabus' });
  });

  it('starts a new item at the next free order, as a required "Other" item', () => {
    assert.deepEqual(emptyItemForm([item('a', 1), item('b', 2)]), {
      type: 'OTHER',
      title: '',
      description: '',
      required: true,
      sequenceOrder: '3',
    });
  });
});

describe('moving items up and down', () => {
  /** A stand-in for the API rule that two items of a syllabus may not share a sequenceOrder. */
  function applySteps(items: SyllabusItem[], steps: { itemId: string; sequenceOrder: number }[]) {
    const state = new Map(items.map((i) => [i.id, i.sequenceOrder]));
    for (const step of steps) {
      for (const [id, order] of state) {
        assert.ok(id === step.itemId || order !== step.sequenceOrder, `duplicate order ${step.sequenceOrder}`);
      }
      state.set(step.itemId, step.sequenceOrder);
    }
    return [...state.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  }

  it('swaps with the next item through a free temporary order, never duplicating a number', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)];
    const steps = planItemMove(items, 'a', 'down');
    assert.deepEqual(steps, [
      { itemId: 'a', sequenceOrder: 4 },
      { itemId: 'b', sequenceOrder: 1 },
      { itemId: 'a', sequenceOrder: 2 },
    ]);
    assert.deepEqual(applySteps(items, steps!), ['b', 'a', 'c']);
  });

  it('swaps with the previous item', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)];
    assert.deepEqual(applySteps(items, planItemMove(items, 'c', 'up')!), ['a', 'c', 'b']);
  });

  it('works on non-contiguous orders and unsorted input', () => {
    const items = [item('z', 10), item('x', 3), item('y', 7)];
    assert.deepEqual(applySteps(items, planItemMove(items, 'y', 'up')!), ['y', 'x', 'z']);
    assert.deepEqual(applySteps(items, planItemMove(items, 'x', 'down')!), ['y', 'x', 'z']);
  });

  it('refreshes the items after a reorder only when that syllabus is still the expanded one', () => {
    assert.equal(shouldRefreshItemsAfterReorder('a', 'a'), true);
    assert.equal(shouldRefreshItemsAfterReorder('b', 'a'), false, 'another syllabus is open now');
    assert.equal(shouldRefreshItemsAfterReorder(null, 'a'), false, 'it was collapsed meanwhile');
  });

  it('returns null for the first item up, the last item down and unknown ids', () => {
    const items = [item('a', 1), item('b', 2)];
    assert.equal(planItemMove(items, 'a', 'up'), null);
    assert.equal(planItemMove(items, 'b', 'down'), null);
    assert.equal(planItemMove(items, 'missing', 'up'), null);
    assert.equal(planItemMove([item('only', 1)], 'only', 'down'), null);
  });
});

describe('canonical syllabus (Book is the only scope)', () => {
  it('builds a create payload with the book id only', () => {
    assert.deepEqual(buildCreateSyllabusPayload(BOOK_ID), { ok: true, data: { bookId: BOOK_ID } });
  });

  it('rejects an id that is not a UUID with the contract message', () => {
    assert.deepEqual(buildCreateSyllabusPayload('not-a-uuid'), { ok: false, error: 'bookId must be a valid UUID' });
  });

  it('never carries a part or segment id in the create payload', () => {
    const result = buildCreateSyllabusPayload(BOOK_ID);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(Object.keys(result.data), ['bookId']);
  });

  it("picks the book's syllabus by book id and ignores other books", () => {
    const list = [syllabus('other', OTHER_BOOK_ID), syllabus('mine')];
    assert.equal(pickBookSyllabus(list, BOOK_ID)?.id, 'mine');
    assert.equal(pickBookSyllabus(list, OTHER_BOOK_ID)?.id, 'other');
    assert.equal(pickBookSyllabus([], BOOK_ID), null);
    assert.equal(pickBookSyllabus([syllabus('other', OTHER_BOOK_ID)], BOOK_ID), null);
  });
});

describe('syllabus item delete policy', () => {
  it('keeps deletion unavailable and explains why', () => {
    assert.equal(SYLLABUS_ITEM_DELETE_POLICY.available, false);
    assert.match(SYLLABUS_ITEM_DELETE_POLICY.reason, /Lesson Plan/);
  });
});

describe('describeSyllabusError', () => {
  it('passes backend validation messages through unchanged', () => {
    const err = Object.assign(new Error('Sequence order 2 is already in use for this syllabus'), { statusCode: 400 });
    assert.equal(describeSyllabusError(err, 'fallback'), 'Sequence order 2 is already in use for this syllabus');
  });

  it('explains a 403 as a Supervisor-only action', () => {
    const err = Object.assign(new Error('Only supervisors can add syllabus items'), { statusCode: 403 });
    assert.equal(describeSyllabusError(err, 'fallback'), 'Only Supervisors can change syllabi.');
  });

  it('keeps the 404 message and suggests refreshing', () => {
    const err = Object.assign(new Error('Syllabus item with id x not found'), { statusCode: 404 });
    assert.equal(
      describeSyllabusError(err, 'fallback'),
      'Syllabus item with id x not found. It may have been removed; refresh and try again.',
    );
    const withStop = Object.assign(new Error('Not found.'), { statusCode: 404 });
    assert.equal(describeSyllabusError(withStop, 'fallback'), 'Not found. It may have been removed; refresh and try again.');
  });

  it('endSentence adds a full stop only when the text does not already end a sentence', () => {
    assert.equal(endSentence('Sequence order 2 is already in use'), 'Sequence order 2 is already in use.');
    assert.equal(endSentence('Already done.'), 'Already done.');
    assert.equal(endSentence('  spaced  '), 'spaced.');
  });

  it('falls back when there is no message, and tolerates non-errors', () => {
    assert.equal(describeSyllabusError({}, 'Failed to save'), 'Failed to save');
    assert.equal(describeSyllabusError(null, 'Failed to save'), 'Failed to save');
    assert.equal(describeSyllabusError('boom', 'Failed to save'), 'Failed to save');
  });
});
