import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Class } from '../../apps/api/src/classes/domain/entities/class.entity';
import { Enrollment } from '../../apps/api/src/classes/domain/entities/enrollment.entity';
import { CreateClassSchema, UpdateClassSchema } from '@edutech/shared';

describe('Classes & Enrollment Domain Entities & Rules', () => {
  describe('Class Domain Entity', () => {
    it('should enforce capacity boundaries (1 <= capacity <= 15) and integer constraint', () => {
      assert.doesNotThrow(() => {
        Class.validateCapacity(1);
        Class.validateCapacity(12);
        Class.validateCapacity(15);
      });

      assert.throws(
        () => {
          Class.validateCapacity(0);
        },
        { message: 'Class capacity must be between 1 and 15' },
      );

      assert.throws(
        () => {
          Class.validateCapacity(-5);
        },
        { message: 'Class capacity must be between 1 and 15' },
      );

      assert.throws(
        () => {
          Class.validateCapacity(16);
        },
        { message: 'Class capacity must be between 1 and 15' },
      );

      assert.throws(
        () => {
          Class.validateCapacity(12.5);
        },
        { message: 'Class capacity must be an integer' },
      );
    });

    it('should enforce valid Class lifecycle transitions (DRAFT -> ACTIVE -> COMPLETED / CANCELLED)', () => {
      const draftClass = new Class(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        null,
        null,
        'REGULAR',
        'DRAFT',
        12,
        new Date(),
        new Date(),
      );

      assert.equal(draftClass.canTransitionTo('ACTIVE'), true);
      assert.equal(draftClass.canTransitionTo('CANCELLED'), true);
      assert.equal(draftClass.canTransitionTo('COMPLETED'), false);
      assert.equal(draftClass.canBeModified(), true);
      assert.equal(draftClass.isDraft(), true);
      assert.equal(draftClass.isTerminal(), false);

      const activeClass = new Class(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        null,
        '44444444-4444-4444-4444-444444444444',
        'REGULAR',
        'ACTIVE',
        12,
        new Date(),
        new Date(),
      );

      assert.equal(activeClass.canTransitionTo('COMPLETED'), true);
      assert.equal(activeClass.canTransitionTo('CANCELLED'), true);
      assert.equal(activeClass.canTransitionTo('DRAFT'), false);
      assert.equal(activeClass.canBeModified(), true);
      assert.equal(activeClass.isActive(), true);
      assert.equal(activeClass.isTerminal(), false);

      const completedClass = new Class(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        null,
        '44444444-4444-4444-4444-444444444444',
        'REGULAR',
        'COMPLETED',
        12,
        new Date(),
        new Date(),
      );

      assert.equal(completedClass.canTransitionTo('ACTIVE'), false);
      assert.equal(completedClass.canTransitionTo('DRAFT'), false);
      assert.equal(completedClass.canTransitionTo('CANCELLED'), false);
      assert.equal(completedClass.canBeModified(), false);
      assert.equal(completedClass.isTerminal(), true);
    });
  });

  describe('Enrollment Domain Entity', () => {
    it('should validate enrollment lifecycle transitions (ACTIVE -> COMPLETED / WITHDRAWN)', () => {
      const activeEnrollment = new Enrollment(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'ACTIVE',
        new Date(),
        null,
        new Date(),
        new Date(),
      );

      assert.equal(activeEnrollment.isActive(), true);
      assert.equal(activeEnrollment.isTerminated(), false);
      assert.equal(activeEnrollment.canTransitionTo('WITHDRAWN'), true);
      assert.equal(activeEnrollment.canTransitionTo('COMPLETED'), true);

      const withdrawnEnrollment = new Enrollment(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'WITHDRAWN',
        new Date(),
        new Date(),
        new Date(),
        new Date(),
      );

      assert.equal(withdrawnEnrollment.isActive(), false);
      assert.equal(withdrawnEnrollment.isTerminated(), true);
      assert.equal(withdrawnEnrollment.canTransitionTo('ACTIVE'), false);
      assert.equal(withdrawnEnrollment.canTransitionTo('COMPLETED'), false);
    });
  });
  describe('Class name validation contract', () => {
    const base = {
      academicTermId: '11111111-1111-4111-8111-111111111111',
      bookId: '22222222-2222-4222-8222-222222222222',
    };

    it('Class entity defaults to a null name for legacy rows', () => {
      const now = new Date();
      const legacy = new Class('c1', 't1', 'b1', null, null, 'REGULAR', 'DRAFT', 10, now, now);
      assert.equal(legacy.name, null);
      const named = new Class('c2', 't1', 'b1', null, null, 'REGULAR', 'DRAFT', 10, now, now, 'blue', 'Section A');
      assert.equal(named.name, 'Section A');
    });

    it('CreateClassSchema accepts a missing, null, or valid name and trims it', () => {
      assert.equal(CreateClassSchema.safeParse(base).success, true);
      assert.equal(CreateClassSchema.safeParse({ ...base, className: null }).success, true);
      const parsed = CreateClassSchema.safeParse({ ...base, className: '  Touchstone 1 - A  ' });
      assert.equal(parsed.success, true);
      if (parsed.success) assert.equal(parsed.data.className, 'Touchstone 1 - A');
    });

    it('CreateClassSchema rejects empty, whitespace-only, and over-128-character names', () => {
      for (const bad of ['', '   ', 'a'.repeat(129)]) {
        assert.equal(CreateClassSchema.safeParse({ ...base, className: bad }).success, false);
      }
      assert.equal(CreateClassSchema.safeParse({ ...base, className: 'a'.repeat(128) }).success, true);
    });

    it('UpdateClassSchema distinguishes "leave unchanged" (omitted) from "clear" (null) and validates names', () => {
      const omitted = UpdateClassSchema.safeParse({ capacity: 9 });
      assert.equal(omitted.success, true);
      if (omitted.success) assert.equal(omitted.data.className, undefined);

      const cleared = UpdateClassSchema.safeParse({ className: null });
      assert.equal(cleared.success, true);
      if (cleared.success) assert.equal(cleared.data.className, null);

      assert.equal(UpdateClassSchema.safeParse({ className: '  ' }).success, false);
      assert.equal(UpdateClassSchema.safeParse({ className: 'b'.repeat(129) }).success, false);
    });
  });
});
