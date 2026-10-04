import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayrollPolicy } from '../../apps/api/src/payroll/domain/policies/payroll.policy';

describe('Payroll Domain Policy Unit Tests (Phase 11)', () => {
  const policy = new PayrollPolicy();

  describe('1. Teacher Base Rate Calculation', () => {
    it('extracts numeric rate from numeric or string values', () => {
      assert.strictEqual(policy.getTeacherBaseRate({ baseRate: '250.50' }), 250.5);
      assert.strictEqual(policy.getTeacherBaseRate({ baseRate: 300 }), 300);
      assert.strictEqual(policy.getTeacherBaseRate({ baseRate: '0' }), 0);
    });

    it('defaults to 0 for null, undefined, or missing baseRate', () => {
      assert.strictEqual(policy.getTeacherBaseRate(null), 0);
      assert.strictEqual(policy.getTeacherBaseRate(undefined), 0);
      assert.strictEqual(policy.getTeacherBaseRate({ baseRate: null }), 0);
      assert.strictEqual(policy.getTeacherBaseRate({} as any), 0);
    });
  });

  describe('2. Regular Class Session Compensation', () => {
    it('generates SESSION item for PRESENT teacher attendance', () => {
      const item = policy.calculateSessionItem(
        {
          sessionId: 'sess-1',
          sessionDate: '2026-03-01',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          bookTitle: 'Family and Friends 1',
          teacherAttendanceStatus: 'PRESENT',
          isSubstitutedOut: false,
        },
        200,
      );

      assert.notStrictEqual(item, null);
      assert.strictEqual(item?.type, 'SESSION');
      assert.strictEqual(item?.quantity, '1.00');
      assert.strictEqual(item?.rate, '200.00');
      assert.strictEqual(item?.amount, '200.00');
      assert.strictEqual(item?.referenceId, 'sess-1');
      assert.match(item!.description, /Class Session on 2026-03-01/);
    });

    it('generates SESSION item for LATE teacher attendance', () => {
      const item = policy.calculateSessionItem(
        {
          sessionId: 'sess-2',
          sessionDate: '2026-03-03',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'LATE',
          isSubstitutedOut: false,
        },
        200,
      );

      assert.notStrictEqual(item, null);
      assert.strictEqual(item?.type, 'SESSION');
      assert.strictEqual(item?.amount, '200.00');
    });

    it('excludes CANCELLED sessions from compensation (Business Rules §21.6)', () => {
      const item = policy.calculateSessionItem(
        {
          sessionId: 'sess-3',
          sessionDate: '2026-03-05',
          sessionStatus: 'CANCELLED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'PRESENT',
          isSubstitutedOut: false,
        },
        200,
      );

      assert.strictEqual(item, null);
    });

    it('excludes non-qualifying attendance statuses (ABSENT, EXCUSED)', () => {
      const absentItem = policy.calculateSessionItem(
        {
          sessionId: 'sess-4',
          sessionDate: '2026-03-07',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'ABSENT',
          isSubstitutedOut: false,
        },
        200,
      );
      assert.strictEqual(absentItem, null);

      const excusedItem = policy.calculateSessionItem(
        {
          sessionId: 'sess-5',
          sessionDate: '2026-03-09',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'EXCUSED',
          isSubstitutedOut: false,
        },
        200,
      );
      assert.strictEqual(excusedItem, null);
    });

    it('excludes substituted-out sessions from original teacher compensation', () => {
      const item = policy.calculateSessionItem(
        {
          sessionId: 'sess-6',
          sessionDate: '2026-03-11',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'PRESENT',
          isSubstitutedOut: true,
        },
        200,
      );

      assert.strictEqual(item, null);
    });
  });

  describe('3. Private Class Compensation (Business Rules §20)', () => {
    it('enforces 350 teacher share (70% of 500 price) for private class sessions', () => {
      assert.strictEqual(PayrollPolicy.PRIVATE_CLASS_PRICE, 500);
      assert.strictEqual(PayrollPolicy.PRIVATE_CLASS_TEACHER_SHARE, 350);

      const item = policy.calculateSessionItem(
        {
          sessionId: 'private-sess-1',
          sessionDate: '2026-03-12',
          sessionStatus: 'COMPLETED',
          classType: 'PRIVATE',
          teacherAttendanceStatus: 'PRESENT',
          isSubstitutedOut: false,
        },
        200, // Even if teacher base rate is 200, private class uses private class share (350)
      );

      assert.notStrictEqual(item, null);
      assert.strictEqual(item?.type, 'PRIVATE_CLASS');
      assert.strictEqual(item?.quantity, '1.00');
      assert.strictEqual(item?.rate, '350.00');
      assert.strictEqual(item?.amount, '350.00');
      assert.strictEqual(item?.referenceId, 'private-sess-1');
      assert.strictEqual(item?.description, 'Private Class Session on 2026-03-12');
    });

    it('excludes CANCELLED private class sessions', () => {
      const item = policy.calculateSessionItem(
        {
          sessionId: 'private-sess-2',
          sessionDate: '2026-03-14',
          sessionStatus: 'CANCELLED',
          classType: 'PRIVATE',
          teacherAttendanceStatus: 'PRESENT',
          isSubstitutedOut: false,
        },
        200,
      );

      assert.strictEqual(item, null);
    });
  });

  describe('4. Substitution Compensation (Business Rules §19.5, §21.4)', () => {
    it('generates SUBSTITUTION item for substitute teacher with PRESENT attendance', () => {
      const item = policy.calculateSubstitutionItem(
        {
          substitutionRequestId: 'sub-req-1',
          sessionId: 'sess-sub-1',
          sessionDate: '2026-03-15',
          sessionStatus: 'COMPLETED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'PRESENT',
        },
        220, // substitute teacher baseRate
      );

      assert.notStrictEqual(item, null);
      assert.strictEqual(item?.type, 'SUBSTITUTION');
      assert.strictEqual(item?.quantity, '1.00');
      assert.strictEqual(item?.rate, '220.00');
      assert.strictEqual(item?.amount, '220.00');
      assert.strictEqual(item?.referenceId, 'sess-sub-1');
      assert.strictEqual(item?.description, 'Substitution Session on 2026-03-15');
    });

    it('generates SUBSTITUTION item with private rate for private class substitution', () => {
      const item = policy.calculateSubstitutionItem(
        {
          substitutionRequestId: 'sub-req-2',
          sessionId: 'sess-sub-2',
          sessionDate: '2026-03-17',
          sessionStatus: 'COMPLETED',
          classType: 'PRIVATE',
          teacherAttendanceStatus: 'LATE',
        },
        220,
      );

      assert.notStrictEqual(item, null);
      assert.strictEqual(item?.type, 'SUBSTITUTION');
      assert.strictEqual(item?.rate, '350.00');
      assert.strictEqual(item?.amount, '350.00');
    });

    it('excludes substitution on cancelled sessions', () => {
      const item = policy.calculateSubstitutionItem(
        {
          substitutionRequestId: 'sub-req-3',
          sessionId: 'sess-sub-3',
          sessionDate: '2026-03-19',
          sessionStatus: 'CANCELLED',
          classType: 'REGULAR',
          teacherAttendanceStatus: 'PRESENT',
        },
        220,
      );

      assert.strictEqual(item, null);
    });
  });

  describe('5. Manual Adjustments (Business Rules §21.9)', () => {
    it('creates ADJUSTMENT item with positive amount', () => {
      const item = policy.calculateAdjustmentItem(150, 'Transportation allowance bonus');

      assert.strictEqual(item.type, 'ADJUSTMENT');
      assert.strictEqual(item.quantity, '1.00');
      assert.strictEqual(item.rate, '150.00');
      assert.strictEqual(item.amount, '150.00');
      assert.strictEqual(item.description, 'Transportation allowance bonus');
    });

    it('creates ADJUSTMENT item with negative deduction amount', () => {
      const item = policy.calculateAdjustmentItem(-50, 'Resource loss deduction', 'ticket-123');

      assert.strictEqual(item.type, 'ADJUSTMENT');
      assert.strictEqual(item.quantity, '1.00');
      assert.strictEqual(item.rate, '-50.00');
      assert.strictEqual(item.amount, '-50.00');
      assert.strictEqual(item.referenceId, 'ticket-123');
      assert.strictEqual(item.description, 'Resource loss deduction');
    });
  });

  describe('6. Total Computation & Explainability', () => {
    it('correctly aggregates multiple item types into totalAmount with 2 decimal precision', () => {
      const items = [
        { amount: '200.00' }, // regular session
        { amount: '200.00' }, // regular session
        { amount: '350.00' }, // private class
        { amount: '220.00' }, // substitution
        { amount: '100.00' }, // adjustment bonus
        { amount: '-50.00' }, // adjustment deduction
      ];

      const total = policy.computeTotal(items);
      assert.strictEqual(total, '1020.00');
    });

    it('returns 0.00 for empty items list', () => {
      assert.strictEqual(policy.computeTotal([]), '0.00');
    });
  });
});
