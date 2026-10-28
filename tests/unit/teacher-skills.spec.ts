/**
 * The skills API returns the book as flat `bookName` / `bookLevel`. The Teachers screen used to read a nested
 * `book.name` that is never sent, so every qualification showed the generic "Book Skill". These tests pin the
 * resolution (API fields, then the loaded book list) and the safe fallback.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { BookItem, TeacherSkillItem } from '../../apps/web/lib/api-client';
import { describeTeacherSkill, UNRESOLVED_BOOK_SKILL_LABEL } from '../../apps/web/lib/teacher-skills';
import { TeacherSkillTitle } from '../../apps/web/components/people/TeacherSkillTitle';

const book = (id: string, name: string, level: string, isActive = true): BookItem => ({
  id,
  name,
  level,
  sequenceOrder: 1,
  sessionCount: 20,
  isTerminal: false,
  isActive,
});

// Shaped exactly like TeacherSkillResponseDto from GET /teachers/:id/skills (flat bookName / bookLevel).
const apiSkill = (id: string, bookId: string, bookName?: string | null, bookLevel?: string | null): TeacherSkillItem => ({
  id,
  teacherId: 't1',
  bookId,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...(bookName !== undefined ? { bookName } : {}),
  ...(bookLevel !== undefined ? { bookLevel } : {}),
});

const books = [
  book('b1', 'English File Beginner', 'A1'),
  book('b2', 'Cambridge Advanced', 'C1'),
  book('b3', 'Retired Book', 'B1', false),
];

describe('describeTeacherSkill', () => {
  it('uses the book name and level the API returns for a known book id', () => {
    const r = describeTeacherSkill(apiSkill('s1', 'b1', 'English File Beginner', 'A1'), books);
    assert.deepEqual(r, { name: 'English File Beginner', level: 'A1', resolved: true });
  });

  it('shows each assigned book under its own title', () => {
    const a = describeTeacherSkill(apiSkill('s1', 'b1', 'English File Beginner', 'A1'), books);
    const b = describeTeacherSkill(apiSkill('s2', 'b2', 'Cambridge Advanced', 'C1'), books);
    assert.equal(a.name, 'English File Beginner');
    assert.equal(b.name, 'Cambridge Advanced');
    assert.notEqual(a.name, b.name);
    assert.equal(b.level, 'C1');
  });

  it('works without the books list when the API already supplies the name', () => {
    assert.equal(describeTeacherSkill(apiSkill('s1', 'b1', 'English File Beginner', 'A1')).name, 'English File Beginner');
  });

  it('resolves the name from the loaded book list by bookId when the API fields are missing', () => {
    const r = describeTeacherSkill(apiSkill('s1', 'b2'), books);
    assert.deepEqual(r, { name: 'Cambridge Advanced', level: 'C1', resolved: true });
  });

  it('resolves an inactive book as long as it is in the list', () => {
    assert.equal(describeTeacherSkill(apiSkill('s1', 'b3'), books).name, 'Retired Book');
  });

  it('prefers the API fields over the list when both exist', () => {
    const r = describeTeacherSkill(apiSkill('s1', 'b1', 'Renamed By API', 'A2'), books);
    assert.equal(r.name, 'Renamed By API');
    assert.equal(r.level, 'A2');
  });

  it('still understands a nested book object', () => {
    const skill: TeacherSkillItem = { id: 's1', teacherId: 't1', bookId: 'b1', book: { id: 'b1', name: 'Nested Name', level: 'B2' } };
    assert.deepEqual(describeTeacherSkill(skill, []), { name: 'Nested Name', level: 'B2', resolved: true });
  });

  it('falls back to the generic label only when the book cannot be resolved', () => {
    const r = describeTeacherSkill(apiSkill('s1', 'missing-book'), books);
    assert.deepEqual(r, { name: UNRESOLVED_BOOK_SKILL_LABEL, level: null, resolved: false });
    assert.equal(UNRESOLVED_BOOK_SKILL_LABEL, 'Book Skill');
  });

  it('treats null, empty and whitespace names as unresolved and does not throw', () => {
    for (const name of [null, '', '   ']) {
      const r = describeTeacherSkill(apiSkill('s1', 'missing', name, null), books);
      assert.equal(r.name, UNRESOLVED_BOOK_SKILL_LABEL);
      assert.equal(r.resolved, false);
    }
  });

  it('does not throw on a missing bookId or an empty books list', () => {
    const noBook = { id: 's1', teacherId: 't1' } as unknown as TeacherSkillItem;
    assert.deepEqual(describeTeacherSkill(noBook, []), { name: 'Book Skill', level: null, resolved: false });
    assert.equal(describeTeacherSkill(noBook).name, 'Book Skill');
  });

  it('does not mutate its inputs', () => {
    const skill = apiSkill('s1', 'b1');
    const snapshot = JSON.stringify(skill);
    const list = [...books];
    describeTeacherSkill(skill, list);
    assert.equal(JSON.stringify(skill), snapshot);
    assert.equal(list.length, books.length);
  });
});

describe('TeacherSkillTitle rendering', () => {
  const render = (skill: TeacherSkillItem, list: BookItem[] = books) =>
    renderToString(React.createElement(TeacherSkillTitle, { skill, books: list }));

  it('renders two different books with their own titles, not "Book Skill"', () => {
    const one = render(apiSkill('s1', 'b1', 'English File Beginner', 'A1'));
    const two = render(apiSkill('s2', 'b2', 'Cambridge Advanced', 'C1'));
    assert.ok(one.includes('English File Beginner') && one.includes('A1'));
    assert.ok(two.includes('Cambridge Advanced') && two.includes('C1'));
    assert.ok(!one.includes('Book Skill') && !two.includes('Book Skill'));
    assert.ok(!one.includes('Cambridge Advanced'));
  });

  it('resolves from the book list when the API omits the name', () => {
    const html = render(apiSkill('s1', 'b2'));
    assert.ok(html.includes('Cambridge Advanced') && html.includes('C1'));
  });

  it('renders the generic label for an unresolved reference without a level badge', () => {
    const html = render(apiSkill('s1', 'gone'), []);
    assert.ok(html.includes('Book Skill'));
    assert.ok(!html.includes('rounded bg-indigo-500/10'), 'no level badge when the level is unknown');
  });

  it('escapes book names instead of injecting markup', () => {
    const html = render(apiSkill('s1', 'b9', '<img src=x onerror=alert(1)>', 'A1'), []);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
  });

  it('shows no salary or pay information', () => {
    const html = render({ ...apiSkill('s1', 'b1', 'English File Beginner', 'A1'), baseSalary: 1, payRate: 2 } as TeacherSkillItem);
    assert.ok(!/salary|pay/i.test(html));
  });
});
