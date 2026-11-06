/**
 * Pure logic behind the Supervisor syllabus UI (apps/web/lib/syllabus-utils.ts): validation through the shared
 * contracts, sequence ordering, scope handling, the delete policy and error wording.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SyllabusItemType } from '@edutech/shared';
import type { BookPartItem, BookSegmentItem, SyllabusDetail, SyllabusItem } from '../../apps/web/lib/api-client';
import {
  DUPLICATE_SCOPE_NOTICE,
  NO_CHANGES_MESSAGE,
  SYLLABUS_ITEM_DELETE_POLICY,
  SYLLABUS_ITEM_TYPES,
  SYLLABUS_ITEM_TYPE_LABEL,
  buildCreateSyllabusPayload,
  buildSegmentOptions,
  buildUpdateSyllabusPayload,
  describeSyllabusError,
  emptyItemForm,
  endSentence,
  hasSameScope,
  itemToForm,
  nextSequenceOrder,
  planItemMove,
  sortSyllabi,
  sortSyllabusItems,
  syllabusScopeLabel,
  validateItemForm,
  type ItemFormValues,
} from '../../apps/web/lib/syllabus-utils';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';
const SEGMENT_ID = '22222222-2222-4222-8222-222222222222';

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

function syllabus(id: string, segmentId: string | null, segmentName?: string): SyllabusDetail {
  return {
    id,
    bookId: BOOK_ID,
    bookSegmentId: segmentId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    bookSegment: segmentId ? { id: segmentId, name: segmentName ?? 'Segment' } : null,
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

  it('returns null for the first item up, the last item down and unknown ids', () => {
    const items = [item('a', 1), item('b', 2)];
    assert.equal(planItemMove(items, 'a', 'up'), null);
    assert.equal(planItemMove(items, 'b', 'down'), null);
    assert.equal(planItemMove(items, 'missing', 'up'), null);
    assert.equal(planItemMove([item('only', 1)], 'only', 'down'), null);
  });
});

describe('syllabus scope (book / segment)', () => {
  it('labels whole-book and segment syllabi', () => {
    assert.equal(syllabusScopeLabel(syllabus('s1', null)), 'Whole book');
    assert.equal(syllabusScopeLabel(syllabus('s2', SEGMENT_ID, 'Unit 1')), 'Segment: Unit 1');
    assert.equal(
      syllabusScopeLabel({ bookSegmentId: SEGMENT_ID, bookSegment: null }),
      'Segment: Unknown segment',
    );
  });

  it('lists the whole-book syllabus first, then segments by name', () => {
    const sorted = sortSyllabi([syllabus('b', SEGMENT_ID, 'Unit 2'), syllabus('c', 'x', 'Unit 1'), syllabus('a', null)]);
    assert.deepEqual(sorted.map((s) => s.id), ['a', 'c', 'b']);
  });

  it('builds segment choices in curriculum order', () => {
    const part = (id: string, order: number, name: string): BookPartItem => ({ id, bookId: BOOK_ID, name, sequenceOrder: order });
    const seg = (id: string, partId: string, order: number, name: string): BookSegmentItem => ({
      id,
      bookPartId: partId,
      name,
      sequenceOrder: order,
    });
    const options = buildSegmentOptions([part('p2', 2, 'B'), part('p1', 1, 'A')], {
      p1: [seg('s2', 'p1', 2, 'Two'), seg('s1', 'p1', 1, 'One')],
      p2: [seg('s3', 'p2', 1, 'Three')],
    });
    assert.deepEqual(options, [
      { id: 's1', label: 'Part 1: A > #1 One' },
      { id: 's2', label: 'Part 1: A > #2 Two' },
      { id: 's3', label: 'Part 2: B > #1 Three' },
    ]);
    assert.deepEqual(buildSegmentOptions([part('p1', 1, 'A')], {}), []);
  });

  it('detects another syllabus for the same scope, ignoring the one being edited', () => {
    const list = [syllabus('a', null), syllabus('b', SEGMENT_ID, 'Unit 1')];
    assert.equal(hasSameScope(list, null), true);
    assert.equal(hasSameScope(list, SEGMENT_ID), true);
    assert.equal(hasSameScope(list, 'other'), false);
    assert.equal(hasSameScope(list, null, 'a'), false);
    assert.match(DUPLICATE_SCOPE_NOTICE, /already exists/);
  });

  it('creates a whole-book payload from the empty selector value', () => {
    assert.deepEqual(buildCreateSyllabusPayload(BOOK_ID, ''), { ok: true, data: { bookId: BOOK_ID, bookSegmentId: null } });
    assert.deepEqual(buildCreateSyllabusPayload(BOOK_ID, SEGMENT_ID), {
      ok: true,
      data: { bookId: BOOK_ID, bookSegmentId: SEGMENT_ID },
    });
  });

  it('rejects ids that are not UUIDs with the contract message', () => {
    assert.deepEqual(buildCreateSyllabusPayload('not-a-uuid', ''), { ok: false, error: 'bookId must be a valid UUID' });
    assert.deepEqual(buildCreateSyllabusPayload(BOOK_ID, 'nope'), {
      ok: false,
      error: 'bookSegmentId must be a valid UUID',
    });
  });

  it('sends only the segment on edit, allows clearing it, and rejects an unchanged scope', () => {
    assert.deepEqual(buildUpdateSyllabusPayload(syllabus('a', null), SEGMENT_ID), {
      ok: true,
      data: { bookSegmentId: SEGMENT_ID },
    });
    assert.deepEqual(buildUpdateSyllabusPayload(syllabus('a', SEGMENT_ID, 'Unit 1'), ''), {
      ok: true,
      data: { bookSegmentId: null },
    });
    assert.deepEqual(buildUpdateSyllabusPayload(syllabus('a', SEGMENT_ID, 'Unit 1'), SEGMENT_ID), {
      ok: false,
      error: NO_CHANGES_MESSAGE,
    });
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
