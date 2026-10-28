import type { BookItem, TeacherSkillItem } from './api-client';

/** Shown only when the book behind a qualification cannot be resolved by any means. */
export const UNRESOLVED_BOOK_SKILL_LABEL = 'Book Skill';

const clean = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

/**
 * The skills API returns the book as flat `bookName` / `bookLevel` (it joins `books`), not as a nested `book`.
 * Resolution order: the API's own fields, a nested `book` if present, then the book list the screen already
 * loaded (looked up by `bookId`). It never invents a name: when nothing resolves, `name` is the generic label and
 * `resolved` is false. Pure: nothing is mutated.
 */
export function describeTeacherSkill(
  skill: Pick<TeacherSkillItem, 'bookId' | 'bookName' | 'bookLevel' | 'book'>,
  books: readonly Pick<BookItem, 'id' | 'name' | 'level'>[] = [],
): { name: string; level: string | null; resolved: boolean } {
  const listed = skill.bookId ? books.find((b) => b.id === skill.bookId) : undefined;
  const name = clean(skill.bookName) ?? clean(skill.book?.name) ?? clean(listed?.name);
  const level = clean(skill.bookLevel) ?? clean(skill.book?.level) ?? clean(listed?.level);
  return name
    ? { name, level, resolved: true }
    : { name: UNRESOLVED_BOOK_SKILL_LABEL, level, resolved: false };
}
