import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AcademicTerm } from '../../apps/api/src/academics/domain/entities/academic-term.entity';
import { Book } from '../../apps/api/src/academics/domain/entities/book.entity';
import { BookPart } from '../../apps/api/src/academics/domain/entities/book-part.entity';
import { BookSegment } from '../../apps/api/src/academics/domain/entities/book-segment.entity';

describe('Academics Domain Entities & Rules', () => {
  describe('AcademicTerm Domain Entity', () => {
    it('should validate that startDate must be before endDate', () => {
      assert.doesNotThrow(() => {
        AcademicTerm.validateDates('2026-01-01', '2026-06-30');
      });

      assert.throws(
        () => {
          AcademicTerm.validateDates('2026-06-30', '2026-01-01');
        },
        { message: 'startDate must be before endDate' },
      );

      assert.throws(
        () => {
          AcademicTerm.validateDates('2026-05-01', '2026-05-01');
        },
        { message: 'startDate must be before endDate' },
      );
    });

    it('should enforce valid lifecycle transitions (PLANNED -> ACTIVE -> CLOSED)', () => {
      const plannedTerm = new AcademicTerm(
        '11111111-1111-1111-1111-111111111111',
        'Fall 2026',
        '2026-09-01',
        '2026-12-31',
        'PLANNED',
        new Date(),
        new Date(),
      );

      assert.equal(plannedTerm.canTransitionTo('ACTIVE'), true);
      assert.equal(plannedTerm.canTransitionTo('CLOSED'), false);
      assert.equal(plannedTerm.canBeModified(), true);

      const activeTerm = new AcademicTerm(
        '11111111-1111-1111-1111-111111111111',
        'Fall 2026',
        '2026-09-01',
        '2026-12-31',
        'ACTIVE',
        new Date(),
        new Date(),
      );

      assert.equal(activeTerm.canTransitionTo('CLOSED'), true);
      assert.equal(activeTerm.canTransitionTo('PLANNED'), false);
      assert.equal(activeTerm.canBeModified(), true);

      const closedTerm = new AcademicTerm(
        '11111111-1111-1111-1111-111111111111',
        'Fall 2026',
        '2026-09-01',
        '2026-12-31',
        'CLOSED',
        new Date(),
        new Date(),
      );

      assert.equal(closedTerm.canTransitionTo('ACTIVE'), false);
      assert.equal(closedTerm.canTransitionTo('PLANNED'), false);
      assert.equal(closedTerm.canBeModified(), false);
    });
  });

  describe('Book Domain Entity', () => {
    it('should validate sequenceOrder is non-negative and sessionCount is positive', () => {
      assert.doesNotThrow(() => {
        Book.validateInvariants(0, 16);
        Book.validateInvariants(1, 20);
      });

      assert.throws(
        () => {
          Book.validateInvariants(-1, 20);
        },
        { message: 'sequenceOrder must be non-negative' },
      );

      assert.throws(
        () => {
          Book.validateInvariants(1, 0);
        },
        { message: 'sessionCount must be greater than zero' },
      );

      assert.throws(
        () => {
          Book.validateInvariants(1, -5);
        },
        { message: 'sessionCount must be greater than zero' },
      );
    });
  });

  describe('BookPart and BookSegment Invariants', () => {
    it('should validate BookPart non-negative sequenceOrder', () => {
      assert.doesNotThrow(() => BookPart.validateInvariants(0));
      assert.doesNotThrow(() => BookPart.validateInvariants(5));
      assert.throws(() => BookPart.validateInvariants(-1), {
        message: 'sequenceOrder must be non-negative',
      });
    });

    it('should validate BookSegment non-negative sequenceOrder', () => {
      assert.doesNotThrow(() => BookSegment.validateInvariants(0));
      assert.doesNotThrow(() => BookSegment.validateInvariants(3));
      assert.throws(() => BookSegment.validateInvariants(-2), {
        message: 'sequenceOrder must be non-negative',
      });
    });
  });
});
