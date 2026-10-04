import type { ICandidateGenerator } from './candidate-generator.interface';
import { DefaultCandidateGenerator } from './default-candidate-generator';
import type { IHardConstraint } from '../constraints/hard-constraint.interface';
import { FridayUnavailableConstraint } from '../constraints/friday-unavailable.constraint';
import { TimeValidityConstraint } from '../constraints/time-validity.constraint';
import { TeacherOverlapConstraint } from '../constraints/teacher-overlap.constraint';
import { ClassOverlapConstraint } from '../constraints/class-overlap.constraint';
import { TeacherSkillConstraint } from '../constraints/teacher-skill.constraint';
import { ClassCapacityConstraint } from '../constraints/class-capacity.constraint';
import { StudentConflictConstraint } from '../constraints/student-conflict.constraint';
import type { ISoftPreference } from '../preferences/soft-preference.interface';
import { ThursdayMorningPreference } from '../preferences/thursday-morning.preference';
import { TeacherPreferredTimePreference } from '../preferences/teacher-preferred-time.preference';
import { SessionDistributionPreference } from '../preferences/session-distribution.preference';
import { TimeSlot } from '../value-objects/time-slot.vo';
import type {
  SchedulingClassContext,
  SchedulingGlobalContext,
  ExistingClassSchedule,
} from './scheduling-context.interface';
import type {
  ScheduleEngineResultDto,
  SchedulingCandidateSlotDto,
  SchedulingConflictDto,
  ConstraintEvaluationReport,
  PreferenceEvaluationReport,
} from '@edutech/shared';

export interface SchedulingEngineConfig {
  candidateGenerator?: ICandidateGenerator;
  hardConstraints?: IHardConstraint[];
  softPreferences?: ISoftPreference[];
}

export class SchedulingEngine {
  private readonly candidateGenerator: ICandidateGenerator;
  private readonly hardConstraints: IHardConstraint[];
  private readonly softPreferences: ISoftPreference[];

  constructor(config?: SchedulingEngineConfig) {
    this.candidateGenerator = config?.candidateGenerator ?? new DefaultCandidateGenerator();
    this.hardConstraints = config?.hardConstraints ?? [
      new FridayUnavailableConstraint(),
      new TimeValidityConstraint(),
      new TeacherOverlapConstraint(),
      new ClassOverlapConstraint(),
      new TeacherSkillConstraint(),
      new ClassCapacityConstraint(),
      new StudentConflictConstraint(),
    ];
    this.softPreferences = config?.softPreferences ?? [
      new ThursdayMorningPreference(),
      new TeacherPreferredTimePreference(),
      new SessionDistributionPreference(),
    ];
  }

  evaluateSlot(
    slot: TimeSlot,
    context: SchedulingClassContext,
  ): {
    isValid: boolean;
    score: number;
    hardConstraintReports: ConstraintEvaluationReport[];
    preferenceReports: PreferenceEvaluationReport[];
    conflicts: SchedulingConflictDto[];
  } {
    const hardConstraintReports: ConstraintEvaluationReport[] = [];
    const conflicts: SchedulingConflictDto[] = [];
    let isValid = true;

    // 1. Evaluate Hard Constraints
    for (const constraint of this.hardConstraints) {
      const report = constraint.evaluate(slot, context);
      hardConstraintReports.push(report);
      if (!report.passed) {
        isValid = false;
        if (report.conflict) {
          conflicts.push(report.conflict);
        }
      }
    }

    // 2. Evaluate Soft Preferences (only if hard constraints pass or for evaluation scoring)
    const preferenceReports: PreferenceEvaluationReport[] = [];
    let score = 0;

    for (const preference of this.softPreferences) {
      const report = preference.evaluate(slot, context);
      preferenceReports.push(report);
      if (report.applied) {
        score += report.scoreContribution;
      }
    }

    // Soft preferences NEVER override hard constraints: if invalid, score does not make it valid
    return {
      isValid,
      score,
      hardConstraintReports,
      preferenceReports,
      conflicts,
    };
  }

  evaluateClass(context: SchedulingClassContext): ScheduleEngineResultDto {
    const candidateSlots = this.candidateGenerator.generateCandidates(context);
    const evaluatedCandidates: SchedulingCandidateSlotDto[] = [];
    const allConflicts: SchedulingConflictDto[] = [];

    for (const slot of candidateSlots) {
      const evaluation = this.evaluateSlot(slot, context);
      const candidateDto: SchedulingCandidateSlotDto = {
        classId: context.classInfo.id,
        teacherId: context.classInfo.teacherId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        score: evaluation.score,
        hardConstraintReports: evaluation.hardConstraintReports,
        preferenceReports: evaluation.preferenceReports,
        isValid: evaluation.isValid,
        conflicts: evaluation.conflicts,
      };

      evaluatedCandidates.push(candidateDto);
      if (!evaluation.isValid) {
        allConflicts.push(...evaluation.conflicts);
      }
    }

    // Deterministic sorting / tie-breaking:
    // 1. Valid candidates first (isValid: true > false)
    // 2. Score descending (highest score first)
    // 3. Day of week ascending (Saturday: 6 -> Sunday: 0 -> Mon: 1 -> Tue: 2 -> Wed: 3 -> Thu: 4)
    // 4. Start time ascending
    evaluatedCandidates.sort((a, b) => {
      if (a.isValid !== b.isValid) {
        return a.isValid ? -1 : 1;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return a.startTime.localeCompare(b.startTime);
    });

    const validCandidates = evaluatedCandidates.filter((c) => c.isValid);
    const recommendedSlot = validCandidates.length > 0 ? validCandidates[0] : null;

    // Build structured explanation
    const passedConstraints = new Set<string>();
    const failedConstraints = new Set<string>();
    const satisfiedPreferences = new Set<string>();
    const unsatisfiedPreferences = new Set<string>();

    if (recommendedSlot) {
      recommendedSlot.hardConstraintReports.forEach((r) => {
        if (r.passed) passedConstraints.add(r.constraintName);
        else failedConstraints.add(r.constraintName);
      });
      recommendedSlot.preferenceReports.forEach((p) => {
        if (p.applied) satisfiedPreferences.add(p.preferenceName);
        else unsatisfiedPreferences.add(p.preferenceName);
      });
    }

    const explanationSummary = recommendedSlot
      ? `Recommended slot Day ${recommendedSlot.dayOfWeek} (${recommendedSlot.startTime}-${recommendedSlot.endTime}) with score ${recommendedSlot.score}. Passed all hard constraints.`
      : `No valid schedule slot found for Class ${context.classInfo.id}. Evaluated ${evaluatedCandidates.length} candidate slots; all violated one or more hard constraints.`;

    return {
      classId: context.classInfo.id,
      recommendedSlot,
      candidateSlots: evaluatedCandidates,
      evaluatedCandidatesCount: evaluatedCandidates.length,
      validCandidatesCount: validCandidates.length,
      conflicts: allConflicts,
      explanation: {
        passedConstraints: Array.from(passedConstraints),
        failedConstraints: Array.from(failedConstraints),
        satisfiedPreferences: Array.from(satisfiedPreferences),
        unsatisfiedPreferences: Array.from(unsatisfiedPreferences),
        summary: explanationSummary,
      },
    };
  }

  evaluateMultipleClasses(globalContext: SchedulingGlobalContext): Map<string, ScheduleEngineResultDto> {
    const results = new Map<string, ScheduleEngineResultDto>();
    const accumulatedSchedules: ExistingClassSchedule[] = [...globalContext.allExistingSchedules];

    for (const cls of globalContext.classes) {
      // Build per-class context
      const existingClassSchedules = accumulatedSchedules.filter((s) => s.classId === cls.id);
      const existingTeacherSchedules = cls.teacherId
        ? accumulatedSchedules.filter((s) => s.teacherId === cls.teacherId)
        : [];

      const existingStudentSchedules = new Map<string, ExistingClassSchedule[]>();
      for (const studentId of cls.enrolledStudentIds || []) {
        const studentSchedules = accumulatedSchedules.filter(
          (s) => s.classId !== cls.id && (s.enrolledStudentIds?.includes(studentId) ?? false),
        );
        existingStudentSchedules.set(studentId, studentSchedules);
      }

      const teacherSkills = globalContext.teacherSkills.filter(
        (ts) => ts.teacherId === cls.teacherId,
      );

      const teacherPreferredTimeSlots = cls.teacherId
        ? globalContext.teacherPreferences?.get(cls.teacherId)
        : undefined;

      const classContext: SchedulingClassContext = {
        classInfo: cls,
        existingClassSchedules,
        existingTeacherSchedules,
        existingStudentSchedules,
        teacherSkills,
        teacherPreferredTimeSlots,
      };

      const result = this.evaluateClass(classContext);
      results.set(cls.id, result);

      // If recommended slot was selected, add it to accumulated schedules for downstream class evaluations
      if (result.recommendedSlot) {
        accumulatedSchedules.push({
          id: `simulated-${cls.id}-${result.recommendedSlot.dayOfWeek}`,
          classId: cls.id,
          teacherId: cls.teacherId,
          slot: new TimeSlot(
            result.recommendedSlot.dayOfWeek,
            result.recommendedSlot.startTime,
            result.recommendedSlot.endTime,
          ),
          enrolledStudentIds: cls.enrolledStudentIds,
        });
      }
    }

    return results;
  }
}
