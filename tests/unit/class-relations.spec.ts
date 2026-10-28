/**
 * GET /classes returns flat ids (bookId, teacherId). attachClassRelations fills in the nested `book` and
 * `teacher` objects the Classes screens render, from lists the screen already loaded.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BookItem, ClassItem, Teacher } from '../../apps/web/lib/api-client';
import { attachClassRelations } from '../../apps/web/lib/class-relations';

const book = (id: string, name: string, level: string): BookItem => ({
  id,
  name,
  level,
  sequenceOrder: 1,
  sessionCount: 20,
  isTerminal: false,
  isActive: true,
});

const teacher = (id: string, firstName: string, lastName: string, isActive = true): Teacher => ({
  id,
  accountId: null,
  firstName,
  lastName,
  isActive,
});

const cls = (id: string, over: Partial<ClassItem> = {}): ClassItem => ({
  id,
  academicTermId: 't1',
  bookId: 'b1',
  bookSegmentId: null,
  teacherId: 'th1',
  className: id,
  classType: 'REGULAR',
  status: 'ACTIVE',
  capacity: 12,
  ...over,
});

const books = [book('b1', 'English Level 1', 'A1'), book('b2', 'English Level 2', 'A2')];
const teachers = [teacher('th1', 'Hamid', 'Souriyan'), teacher('th2', 'Sara', 'Ahmadi', false)];

describe('attachClassRelations', () => {
  it('attaches the book and teacher for known ids', () => {
    const [out] = attachClassRelations([cls('a')], books, teachers);
    assert.deepEqual(out.book, { id: 'b1', name: 'English Level 1', level: 'A1' });
    assert.deepEqual(out.teacher, { id: 'th1', firstName: 'Hamid', lastName: 'Souriyan' });
  });

  it('leaves teacher undefined for a null teacherId (genuinely unassigned)', () => {
    const [out] = attachClassRelations([cls('a', { teacherId: null })], books, teachers);
    assert.equal(out.teacher, undefined);
    assert.equal(out.book?.name, 'English Level 1');
  });

  it('does not invent names for unknown ids and does not throw', () => {
    const [out] = attachClassRelations([cls('a', { bookId: 'nope', teacherId: 'ghost' })], books, teachers);
    assert.equal(out.book, undefined);
    assert.equal(out.teacher, undefined);
  });

  it('resolves an inactive teacher that is present in the list', () => {
    const [out] = attachClassRelations([cls('a', { teacherId: 'th2' })], books, teachers);
    assert.deepEqual(out.teacher, { id: 'th2', firstName: 'Sara', lastName: 'Ahmadi' });
  });

  it('does not expose pay data on the attached teacher', () => {
    const withRate = [{ ...teacher('th1', 'Hamid', 'Souriyan'), baseRate: '150.00' }];
    const [out] = attachClassRelations([cls('a')], books, withRate);
    assert.equal('baseRate' in (out.teacher ?? {}), false);
  });

  it('does not mutate its inputs', () => {
    const input = [cls('a'), cls('b', { teacherId: null })];
    const snapshot = JSON.stringify(input);
    const out = attachClassRelations(input, books, teachers);
    assert.equal(JSON.stringify(input), snapshot);
    assert.notEqual(out, input);
    assert.equal('book' in input[0], false);
  });

  it('keeps every other field and the order of the classes', () => {
    const out = attachClassRelations([cls('a', { capacity: 9 }), cls('b')], books, teachers);
    assert.deepEqual(out.map((c) => c.id), ['a', 'b']);
    assert.equal(out[0].capacity, 9);
  });
});
