import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { TeacherOwnershipPolicy } from '../../apps/api/src/auth/presentation/policies/teacher-ownership.policy';
import type { AuthUser } from '@edutech/shared';

describe('TeacherOwnershipPolicy', () => {
  const policy = new TeacherOwnershipPolicy();

  const supervisorUser: AuthUser = {
    id: '11111111-1111-1111-1111-111111111111',
    personnelCode: 'SUP-001',
    isActive: true,
    roles: ['SUPERVISOR'],
    teacherId: null,
  };

  const teacherA: AuthUser = {
    id: '22222222-2222-2222-2222-222222222222',
    personnelCode: 'TCH-001',
    isActive: true,
    roles: ['TEACHER'],
    teacherId: 'teacher-uuid-aaa',
  };

  const dualRoleUser: AuthUser = {
    id: '33333333-3333-3333-3333-333333333333',
    personnelCode: 'DUAL-001',
    isActive: true,
    roles: ['SUPERVISOR', 'TEACHER'],
    teacherId: 'teacher-uuid-dual',
  };

  it('should allow SUPERVISOR to access any teacher resource', () => {
    assert.strictEqual(policy.canAccessTeacher(supervisorUser, 'teacher-uuid-aaa'), true);
    assert.strictEqual(policy.canAccessTeacher(supervisorUser, 'teacher-uuid-bbb'), true);
    assert.doesNotThrow(() => policy.assertAccess(supervisorUser, 'teacher-uuid-aaa'));
  });

  it('should allow TEACHER to access their own resource', () => {
    assert.strictEqual(policy.canAccessTeacher(teacherA, 'teacher-uuid-aaa'), true);
    assert.doesNotThrow(() => policy.assertAccess(teacherA, 'teacher-uuid-aaa'));
  });

  it('should forbid TEACHER from accessing another teacher’s resource', () => {
    assert.strictEqual(policy.canAccessTeacher(teacherA, 'teacher-uuid-bbb'), false);
    assert.throws(
      () => policy.assertAccess(teacherA, 'teacher-uuid-bbb'),
      (err: any) => {
        assert.ok(err instanceof ForbiddenException);
        assert.strictEqual(err.getResponse().code, 'FORBIDDEN');
        return true;
      },
    );
  });

  it('should allow user with both SUPERVISOR and TEACHER roles to access another teacher’s resource', () => {
    assert.strictEqual(policy.canAccessTeacher(dualRoleUser, 'teacher-uuid-other'), true);
    assert.doesNotThrow(() => policy.assertAccess(dualRoleUser, 'teacher-uuid-other'));
  });

  it('should forbid user with null teacherId if role is TEACHER without supervisor', () => {
    const unlinkedTeacher: AuthUser = {
      id: '44444444-4444-4444-4444-444444444444',
      personnelCode: 'TCH-UNLINKED',
      isActive: true,
      roles: ['TEACHER'],
      teacherId: null,
    };
    assert.strictEqual(policy.canAccessTeacher(unlinkedTeacher, 'teacher-uuid-aaa'), false);
    assert.throws(() => policy.assertAccess(unlinkedTeacher, 'teacher-uuid-aaa'));
  });
});
