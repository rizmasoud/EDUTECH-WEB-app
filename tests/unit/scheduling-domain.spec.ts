import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeRange } from '../../apps/api/src/scheduling/domain/value-objects/time-range.vo';
import { TimeSlot } from '../../apps/api/src/scheduling/domain/value-objects/time-slot.vo';
import { Schedule } from '../../apps/api/src/scheduling/domain/entities/schedule.entity';
import { SchedulingDayPolicy } from '../../apps/api/src/scheduling/domain/policies/scheduling-day.policy';
import { SchedulingCapacityPolicy } from '../../apps/api/src/scheduling/domain/policies/scheduling-capacity.policy';
import { FridayUnavailableConstraint } from '../../apps/api/src/scheduling/domain/constraints/friday-unavailable.constraint';
import { TimeValidityConstraint } from '../../apps/api/src/scheduling/domain/constraints/time-validity.constraint';
import { TeacherOverlapConstraint } from '../../apps/api/src/scheduling/domain/constraints/teacher-overlap.constraint';
import { ClassOverlapConstraint } from '../../apps/api/src/scheduling/domain/constraints/class-overlap.constraint';
import { TeacherSkillConstraint } from '../../apps/api/src/scheduling/domain/constraints/teacher-skill.constraint';
import { ClassCapacityConstraint } from '../../apps/api/src/scheduling/domain/constraints/class-capacity.constraint';
import { StudentConflictConstraint } from '../../apps/api/src/scheduling/domain/constraints/student-conflict.constraint';
import { ThursdayMorningPreference } from '../../apps/api/src/scheduling/domain/preferences/thursday-morning.preference';
import { TeacherPreferredTimePreference } from '../../apps/api/src/scheduling/domain/preferences/teacher-preferred-time.preference';
import { SessionDistributionPreference } from '../../apps/api/src/scheduling/domain/preferences/session-distribution.preference';
import { SchedulingEngine } from '../../apps/api/src/scheduling/domain/engine/scheduling.engine';
import type {
  SchedulingClassContext,
  SchedulingClassInfo,
} from '../../apps/api/src/scheduling/domain/engine/scheduling-context.interface';
import {
  DayOfWeek,
  SchedulingConflictCode,
} from '@edutech/shared';

describe('Scheduling Domain Foundation & Engine Unit Tests', () => {
  const dummyClass: SchedulingClassInfo = {
    id: '11111111-1111-1111-1111-111111111111',
    academicTermId: '22222222-2222-2222-2222-222222222222',
    bookId: '33333333-3333-3333-3333-333333333333',
    teacherId: '44444444-4444-4444-4444-444444444444',
    capacity: 12,
    classType: 'REGULAR',
    status: 'DRAFT',
    enrolledStudentIds: ['stu-1', 'stu-2'],
  };

  const baseContext: SchedulingClassContext = {
    classInfo: dummyClass,
    existingClassSchedules: [],
    existingTeacherSchedules: [],
    existingStudentSchedules: new Map(),
    teacherSkills: [{ teacherId: '44444444-4444-4444-4444-444444444444', bookId: '33333333-3333-3333-3333-333333333333' }],
  };

  describe('1. Time Validity & Overlap Value Objects', () => {
    it('validates start time precedes end time', () => {
      const valid = new TimeRange('08:00', '09:30');
      assert.equal(valid.isValid(), true);
      assert.equal(valid.durationMinutes(), 90);

      const equalTime = new TimeRange('10:00', '10:00');
      assert.equal(equalTime.isValid(), false);

      const invertedTime = new TimeRange('11:00', '09:00');
      assert.equal(invertedTime.isValid(), false);
    });

    it('accurately detects time overlap and boundaries', () => {
      const slotA = new TimeRange('08:00', '09:30');
      const slotOverlap = new TimeRange('09:00', '10:30');
      const slotAdjacent = new TimeRange('09:30', '11:00'); // adjacent does not overlap
      const slotDisjoint = new TimeRange('14:00', '15:30');

      assert.equal(slotA.overlaps(slotOverlap), true);
      assert.equal(slotA.overlaps(slotAdjacent), false);
      assert.equal(slotA.overlaps(slotDisjoint), false);
    });

    it('evaluates TimeValidityConstraint', () => {
      const constraint = new TimeValidityConstraint();
      const validSlot = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');
      const invalidSlot = new TimeSlot(DayOfWeek.SUNDAY, '10:00', '08:00');

      const passReport = constraint.evaluate(validSlot, baseContext);
      assert.equal(passReport.passed, true);

      const failReport = constraint.evaluate(invalidSlot, baseContext);
      assert.equal(failReport.passed, false);
      assert.equal(failReport.conflict?.code, SchedulingConflictCode.INVALID_TIME_RANGE);
    });
  });

  describe('2. Friday Unavailable & Day Policies', () => {
    it('rejects Friday by default and accepts other days', () => {
      const constraint = new FridayUnavailableConstraint();
      const sundaySlot = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');
      const fridaySlot = new TimeSlot(DayOfWeek.FRIDAY, '08:00', '09:30');

      assert.equal(constraint.evaluate(sundaySlot, baseContext).passed, true);

      const fridayReport = constraint.evaluate(fridaySlot, baseContext);
      assert.equal(fridayReport.passed, false);
      assert.equal(fridayReport.conflict?.code, SchedulingConflictCode.FRIDAY_UNAVAILABLE);
    });

    it('configurable day policy can allow Friday if specified', () => {
      const customPolicy = new SchedulingDayPolicy({ allowFriday: true });
      const constraint = new FridayUnavailableConstraint(customPolicy);
      const fridaySlot = new TimeSlot(DayOfWeek.FRIDAY, '08:00', '09:30');

      assert.equal(constraint.evaluate(fridaySlot, baseContext).passed, true);
    });

    it('identifies odd and even day patterns', () => {
      const policy = new SchedulingDayPolicy();
      assert.equal(policy.getDayPattern(DayOfWeek.SUNDAY), 'ODD');
      assert.equal(policy.getDayPattern(DayOfWeek.TUESDAY), 'ODD');
      assert.equal(policy.getDayPattern(DayOfWeek.THURSDAY), 'ODD');

      assert.equal(policy.getDayPattern(DayOfWeek.SATURDAY), 'EVEN');
      assert.equal(policy.getDayPattern(DayOfWeek.MONDAY), 'EVEN');
      assert.equal(policy.getDayPattern(DayOfWeek.WEDNESDAY), 'EVEN');
    });
  });

  describe('3. Teacher Overlap & Teacher Skill Constraints', () => {
    it('rejects schedule if teacher has an overlapping session in another class', () => {
      const constraint = new TeacherOverlapConstraint();
      const slot = new TimeSlot(DayOfWeek.MONDAY, '09:45', '11:15');

      const contextWithTeacherBusy: SchedulingClassContext = {
        ...baseContext,
        existingTeacherSchedules: [
          {
            id: 'sch-busy',
            classId: 'other-class-999',
            teacherId: dummyClass.teacherId,
            slot: new TimeSlot(DayOfWeek.MONDAY, '09:00', '10:30'), // overlaps 09:45-11:15
          },
        ],
      };

      const report = constraint.evaluate(slot, contextWithTeacherBusy);
      assert.equal(report.passed, false);
      assert.equal(report.conflict?.code, SchedulingConflictCode.TEACHER_OVERLAP);
    });

    it('accepts schedule when teacher has non-overlapping session', () => {
      const constraint = new TeacherOverlapConstraint();
      const slot = new TimeSlot(DayOfWeek.MONDAY, '11:30', '13:00');

      const contextWithTeacherNonOverlap: SchedulingClassContext = {
        ...baseContext,
        existingTeacherSchedules: [
          {
            id: 'sch-busy',
            classId: 'other-class-999',
            teacherId: dummyClass.teacherId,
            slot: new TimeSlot(DayOfWeek.MONDAY, '09:00', '10:30'),
          },
        ],
      };

      assert.equal(constraint.evaluate(slot, contextWithTeacherNonOverlap).passed, true);
    });

    it('evaluates teacher skill qualification against class book', () => {
      const constraint = new TeacherSkillConstraint();
      const slot = new TimeSlot(DayOfWeek.SATURDAY, '08:00', '09:30');

      // Qualified
      assert.equal(constraint.evaluate(slot, baseContext).passed, true);

      // Unqualified teacher
      const unqualifiedContext: SchedulingClassContext = {
        ...baseContext,
        teacherSkills: [{ teacherId: dummyClass.teacherId!, bookId: 'different-book-999' }],
      };

      const failReport = constraint.evaluate(slot, unqualifiedContext);
      assert.equal(failReport.passed, false);
      assert.equal(failReport.conflict?.code, SchedulingConflictCode.UNQUALIFIED_TEACHER);
    });
  });

  describe('4. Class Overlap & Capacity Constraints', () => {
    it('rejects contradictory overlapping schedules for the same class', () => {
      const constraint = new ClassOverlapConstraint();
      const slot = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');

      const contextWithClassConflict: SchedulingClassContext = {
        ...baseContext,
        existingClassSchedules: [
          {
            id: 'sch-1',
            classId: dummyClass.id,
            slot: new TimeSlot(DayOfWeek.SUNDAY, '08:30', '10:00'),
          },
        ],
      };

      const report = constraint.evaluate(slot, contextWithClassConflict);
      assert.equal(report.passed, false);
      assert.equal(report.conflict?.code, SchedulingConflictCode.CLASS_OVERLAP);
    });

    it('enforces capacity bounds (1..15) and enrolled student counts', () => {
      const constraint = new ClassCapacityConstraint();
      const slot = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');

      // Normal valid capacity
      assert.equal(constraint.evaluate(slot, baseContext).passed, true);

      // Invalid capacity: 16 (exceeds max 15)
      const overCapacityContext: SchedulingClassContext = {
        ...baseContext,
        classInfo: { ...dummyClass, capacity: 16 },
      };
      const failReport = constraint.evaluate(slot, overCapacityContext);
      assert.equal(failReport.passed, false);
      assert.equal(failReport.conflict?.code, SchedulingConflictCode.CAPACITY_VIOLATION);

      // Enrolled students > capacity
      const studentOverloadContext: SchedulingClassContext = {
        ...baseContext,
        classInfo: {
          ...dummyClass,
          capacity: 5,
          enrolledStudentIds: ['s1', 's2', 's3', 's4', 's5', 's6'],
        },
      };
      const overloadReport = constraint.evaluate(slot, studentOverloadContext);
      assert.equal(overloadReport.passed, false);
      assert.equal(overloadReport.conflict?.code, SchedulingConflictCode.CAPACITY_VIOLATION);
    });
  });

  describe('5. Student Scheduling Conflicts', () => {
    it('detects when an enrolled student has an overlapping schedule in another class', () => {
      const constraint = new StudentConflictConstraint();
      const slot = new TimeSlot(DayOfWeek.TUESDAY, '14:00', '15:30');

      const studentSchedulesMap = new Map();
      studentSchedulesMap.set('stu-1', [
        {
          id: 'other-sch-1',
          classId: 'other-class-abc',
          slot: new TimeSlot(DayOfWeek.TUESDAY, '14:30', '16:00'), // overlaps!
        },
      ]);

      const contextWithStudentConflict: SchedulingClassContext = {
        ...baseContext,
        existingStudentSchedules: studentSchedulesMap,
      };

      const report = constraint.evaluate(slot, contextWithStudentConflict);
      assert.equal(report.passed, false);
      assert.equal(report.conflict?.code, SchedulingConflictCode.STUDENT_CONFLICT);
      assert.equal(report.conflict?.studentId, 'stu-1');
    });

    it('passes when student schedules do not overlap', () => {
      const constraint = new StudentConflictConstraint();
      const slot = new TimeSlot(DayOfWeek.TUESDAY, '14:00', '15:30');

      const studentSchedulesMap = new Map();
      studentSchedulesMap.set('stu-1', [
        {
          id: 'other-sch-1',
          classId: 'other-class-abc',
          slot: new TimeSlot(DayOfWeek.TUESDAY, '16:00', '17:30'), // non-overlapping
        },
      ]);

      const contextWithoutConflict: SchedulingClassContext = {
        ...baseContext,
        existingStudentSchedules: studentSchedulesMap,
      };

      assert.equal(constraint.evaluate(slot, contextWithoutConflict).passed, true);
    });
  });

  describe('6. Soft Preferences & Scoring', () => {
    it('awards bonus for Thursday morning slot without violating hard constraints', () => {
      const pref = new ThursdayMorningPreference();
      const thuMorning = new TimeSlot(DayOfWeek.THURSDAY, '08:00', '09:30');
      const thuAfternoon = new TimeSlot(DayOfWeek.THURSDAY, '14:00', '15:30');
      const sunMorning = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');

      const reportThu = pref.evaluate(thuMorning, baseContext);
      assert.equal(reportThu.applied, true);
      assert.equal(reportThu.scoreContribution, 10);

      const reportThuAft = pref.evaluate(thuAfternoon, baseContext);
      assert.equal(reportThuAft.applied, false);

      const reportSun = pref.evaluate(sunMorning, baseContext);
      assert.equal(reportSun.applied, false);
    });

    it('awards bonus for teacher preferred time slot', () => {
      const pref = new TeacherPreferredTimePreference();
      const targetSlot = new TimeSlot(DayOfWeek.MONDAY, '17:30', '19:00');

      const contextWithPref: SchedulingClassContext = {
        ...baseContext,
        teacherPreferredTimeSlots: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '17:30', endTime: '19:00' }],
      };

      const matchReport = pref.evaluate(targetSlot, contextWithPref);
      assert.equal(matchReport.applied, true);
      assert.equal(matchReport.scoreContribution, 15);

      const nonMatchSlot = new TimeSlot(DayOfWeek.MONDAY, '08:00', '09:30');
      const nonMatchReport = pref.evaluate(nonMatchSlot, contextWithPref);
      assert.equal(nonMatchReport.applied, false);
    });

    it('awards bonus for harmonic session distribution (odd/even pattern)', () => {
      const pref = new SessionDistributionPreference();
      const oddSlot = new TimeSlot(DayOfWeek.SUNDAY, '08:00', '09:30');
      const report = pref.evaluate(oddSlot, baseContext);

      assert.equal(report.applied, true);
      assert.equal(report.scoreContribution, 5);
    });
  });

  describe('7. Scheduling Engine Foundation & Explainability', () => {
    const engine = new SchedulingEngine();

    it('evaluates class candidates and produces recommended slot and structured explanation', () => {
      const result = engine.evaluateClass(baseContext);

      assert.equal(result.classId, dummyClass.id);
      assert.ok(result.recommendedSlot);
      assert.equal(result.recommendedSlot.isValid, true);
      assert.ok(result.evaluatedCandidatesCount > 0);
      assert.ok(result.validCandidatesCount > 0);
      assert.ok(result.explanation.summary.includes('Recommended slot'));
      assert.ok(result.explanation.passedConstraints.length > 0);
    });

    it('soft preference never makes an invalid hard-constraint slot valid', () => {
      // Friday morning slot (has Thursday-style morning time, but Friday is hard-rejected)
      const fridaySlot = new TimeSlot(DayOfWeek.FRIDAY, '08:00', '09:30');
      const evalResult = engine.evaluateSlot(fridaySlot, baseContext);

      assert.equal(evalResult.isValid, false);
      assert.ok(evalResult.conflicts.some((c) => c.code === SchedulingConflictCode.FRIDAY_UNAVAILABLE));
    });

    it('deterministic behavior: identical context produces identical result and candidate ranking', () => {
      const resultA = engine.evaluateClass(baseContext);
      const resultB = engine.evaluateClass(baseContext);

      assert.deepEqual(resultA.recommendedSlot, resultB.recommendedSlot);
      assert.equal(resultA.candidateSlots.length, resultB.candidateSlots.length);
      assert.equal(resultA.validCandidatesCount, resultB.validCandidatesCount);
    });

    it('evaluates multiple classes sequentially with accumulation', () => {
      const class2: SchedulingClassInfo = {
        id: '22222222-aaaa-bbbb-cccc-dddddddddddd',
        academicTermId: dummyClass.academicTermId,
        bookId: dummyClass.bookId,
        teacherId: dummyClass.teacherId, // same teacher!
        capacity: 10,
        classType: 'REGULAR',
        status: 'DRAFT',
        enrolledStudentIds: ['stu-3'],
      };

      const multiResults = engine.evaluateMultipleClasses({
        classes: [dummyClass, class2],
        allExistingSchedules: [],
        teacherSkills: baseContext.teacherSkills,
      });

      assert.equal(multiResults.size, 2);
      const res1 = multiResults.get(dummyClass.id)!;
      const res2 = multiResults.get(class2.id)!;

      assert.ok(res1.recommendedSlot);
      assert.ok(res2.recommendedSlot);

      // Verify that class2's recommended slot does not overlap with class1's slot for the same teacher!
      const slot1 = new TimeSlot(res1.recommendedSlot.dayOfWeek, res1.recommendedSlot.startTime, res1.recommendedSlot.endTime);
      const slot2 = new TimeSlot(res2.recommendedSlot.dayOfWeek, res2.recommendedSlot.startTime, res2.recommendedSlot.endTime);

      assert.equal(slot1.overlaps(slot2), false);
    });
  });

  describe('8. Schedule Entity & Multiple Sessions Support', () => {
    it('supports multiple distinct schedules for the same class on the same day', () => {
      const morningSchedule = new Schedule({
        id: 'sch-morn',
        classId: dummyClass.id,
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '08:00',
        endTime: '09:30',
      });

      const afternoonSchedule = new Schedule({
        id: 'sch-aft',
        classId: dummyClass.id,
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '14:00',
        endTime: '15:30',
      });

      assert.equal(morningSchedule.isValid(), true);
      assert.equal(afternoonSchedule.isValid(), true);
      assert.equal(morningSchedule.overlaps(afternoonSchedule), false);
      assert.equal(morningSchedule.toDto().dayOfWeek, DayOfWeek.SUNDAY);
    });
  });
});
