import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Student } from '../../apps/api/src/students/domain/entities/student.entity';
import { Teacher } from '../../apps/api/src/teachers/domain/entities/teacher.entity';
import { TeacherSkill } from '../../apps/api/src/teachers/domain/entities/teacher-skill.entity';

describe('Students & Teachers Domain Entities', () => {
  it('should construct Student and compute fullName correctly', () => {
    const student = new Student(
      '11111111-1111-1111-1111-111111111111',
      'John',
      'Doe',
      'SH-100',
      true,
      new Date(),
      new Date(),
    );

    assert.equal(student.id, '11111111-1111-1111-1111-111111111111');
    assert.equal(student.firstName, 'John');
    assert.equal(student.lastName, 'Doe');
    assert.equal(student.shahvarCode, 'SH-100');
    assert.equal(student.isActive, true);
    assert.equal(student.fullName, 'John Doe');
  });

  it('should construct Teacher and compute fullName correctly', () => {
    const teacher = new Teacher(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      'Sarah',
      'Connor',
      '25.00',
      true,
      new Date(),
      new Date(),
    );

    assert.equal(teacher.id, '22222222-2222-2222-2222-222222222222');
    assert.equal(teacher.accountId, '33333333-3333-3333-3333-333333333333');
    assert.equal(teacher.firstName, 'Sarah');
    assert.equal(teacher.lastName, 'Connor');
    assert.equal(teacher.baseRate, '25.00');
    assert.equal(teacher.isActive, true);
    assert.equal(teacher.fullName, 'Sarah Connor');
  });

  it('should construct TeacherSkill with relational book metadata', () => {
    const skill = new TeacherSkill(
      '44444444-4444-4444-4444-444444444444',
      '22222222-2222-2222-2222-222222222222',
      '55555555-5555-5555-5555-555555555555',
      new Date(),
      'Level 1 Book',
      'A1',
    );

    assert.equal(skill.id, '44444444-4444-4444-4444-444444444444');
    assert.equal(skill.teacherId, '22222222-2222-2222-2222-222222222222');
    assert.equal(skill.bookId, '55555555-5555-5555-5555-555555555555');
    assert.equal(skill.bookName, 'Level 1 Book');
    assert.equal(skill.bookLevel, 'A1');
  });
});
