import type { BookItem, ClassItem, Teacher } from './api-client';

/**
 * The classes API returns flat ids (`bookId`, `teacherId`), not nested objects. Screens read `cls.book` and
 * `cls.teacher`, so this fills them in from lists the caller already loaded. It never invents a name: a null or
 * unknown id leaves the field untouched. Inactive teachers/books are resolved as long as they are in the list.
 * Pure: the input array and its items are not mutated.
 */
export function attachClassRelations(
  classes: readonly ClassItem[],
  books: readonly BookItem[],
  teachers: readonly Teacher[],
): ClassItem[] {
  const bookById = new Map(books.map((b) => [b.id, b]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  return classes.map((cls) => {
    const book = bookById.get(cls.bookId);
    const teacher = cls.teacherId ? teacherById.get(cls.teacherId) : undefined;
    if (!book && !teacher) return cls;
    return {
      ...cls,
      ...(book ? { book: { id: book.id, name: book.name, level: book.level } } : {}),
      ...(teacher ? { teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName } } : {}),
    };
  });
}
