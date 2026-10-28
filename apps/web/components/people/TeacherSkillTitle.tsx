import React from 'react';
import type { BookItem, TeacherSkillItem } from '../../lib/api-client';
import { describeTeacherSkill } from '../../lib/teacher-skills';

/** Book name (and level badge) of one assigned teacher qualification. */
export function TeacherSkillTitle({
  skill,
  books,
}: {
  skill: TeacherSkillItem;
  books: readonly BookItem[];
}) {
  const { name, level } = describeTeacherSkill(skill, books);
  return (
    <div>
      <span className="font-semibold text-white">{name}</span>
      {level && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold border border-indigo-500/20">
          {level}
        </span>
      )}
    </div>
  );
}
