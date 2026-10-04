import { Injectable } from '@nestjs/common';
import { PayrollItemType } from '@edutech/shared';

export interface PayrollItemDraft {
  type: PayrollItemType;
  quantity: string;
  rate: string;
  amount: string;
  referenceId: string | null;
  description: string;
}

export interface SessionCalculationInput {
  sessionId: string;
  sessionDate: string;
  sessionStatus: string;
  classType: string;
  className?: string | null;
  bookTitle?: string | null;
  teacherAttendanceStatus: string;
  isSubstitutedOut: boolean;
}

export interface SubstitutionCalculationInput {
  substitutionRequestId: string;
  sessionId: string;
  sessionDate: string;
  sessionStatus: string;
  classType: string;
  className?: string | null;
  teacherAttendanceStatus: string;
}

export interface LessonPlanCalculationInput {
  lessonPlanId: string;
  classId: string;
  status: string;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
}

@Injectable()
export class PayrollPolicy {
  /**
   * Private class pricing constants (Business Rules §20)
   * Private Class price: 500
   * Teacher share: 350 (70%)
   */
  public static readonly PRIVATE_CLASS_PRICE = 500;
  public static readonly PRIVATE_CLASS_TEACHER_SHARE = 350;

  /**
   * Syllabus / Lesson plan approved completion bonus per approved plan
   */
  public static readonly LESSON_PLAN_COMPLETION_RATE = 0; // Configurable policy default

  /**
   * Qualifying teacher attendance statuses for compensation
   */
  public static readonly QUALIFYING_ATTENDANCE_STATUSES = ['PRESENT', 'LATE'] as const;

  /**
   * Get teacher's effective base rate
   */
  getTeacherBaseRate(teacher: { baseRate?: string | number | null } | null | undefined): number {
    if (!teacher || teacher.baseRate === null || teacher.baseRate === undefined) {
      return 0;
    }
    const rate = typeof teacher.baseRate === 'string' ? parseFloat(teacher.baseRate) : teacher.baseRate;
    return isNaN(rate) ? 0 : Math.max(0, rate);
  }

  /**
   * Calculate compensation item for a regular or private class session
   */
  calculateSessionItem(
    input: SessionCalculationInput,
    teacherBaseRate: number,
  ): PayrollItemDraft | null {
    // Cancelled sessions do not generate teaching payment (Business Rules §21.6)
    if (input.sessionStatus === 'CANCELLED') {
      return null;
    }

    // Teacher must have qualifying attendance (PRESENT or LATE)
    if (!PayrollPolicy.QUALIFYING_ATTENDANCE_STATUSES.includes(input.teacherAttendanceStatus as any)) {
      return null;
    }

    // If session was substituted out to another teacher, original teacher does not receive session pay
    if (input.isSubstitutedOut) {
      return null;
    }

    // Private Class compensation (Business Rules §20)
    if (input.classType === 'PRIVATE') {
      const rate = PayrollPolicy.PRIVATE_CLASS_TEACHER_SHARE;
      const quantity = 1;
      const amount = (quantity * rate).toFixed(2);

      return {
        type: 'PRIVATE_CLASS',
        quantity: quantity.toFixed(2),
        rate: rate.toFixed(2),
        amount,
        referenceId: input.sessionId,
        description: `Private Class Session on ${input.sessionDate}`,
      };
    }

    // Regular Class compensation
    const rate = teacherBaseRate;
    const quantity = 1;
    const amount = (quantity * rate).toFixed(2);

    const descTitle = input.bookTitle ? ` (${input.bookTitle})` : '';
    return {
      type: 'SESSION',
      quantity: quantity.toFixed(2),
      rate: rate.toFixed(2),
      amount,
      referenceId: input.sessionId,
      description: `Class Session on ${input.sessionDate}${descTitle}`,
    };
  }

  /**
   * Calculate compensation item for a substituted class session
   */
  calculateSubstitutionItem(
    input: SubstitutionCalculationInput,
    teacherBaseRate: number,
  ): PayrollItemDraft | null {
    // Cancelled sessions do not generate teaching payment
    if (input.sessionStatus === 'CANCELLED') {
      return null;
    }

    // Substitute teacher must have qualifying attendance
    if (!PayrollPolicy.QUALIFYING_ATTENDANCE_STATUSES.includes(input.teacherAttendanceStatus as any)) {
      return null;
    }

    // Private classes or standard substitution rate
    const rate = input.classType === 'PRIVATE'
      ? PayrollPolicy.PRIVATE_CLASS_TEACHER_SHARE
      : teacherBaseRate;

    const quantity = 1;
    const amount = (quantity * rate).toFixed(2);

    return {
      type: 'SUBSTITUTION',
      quantity: quantity.toFixed(2),
      rate: rate.toFixed(2),
      amount,
      referenceId: input.sessionId,
      description: `Substitution Session on ${input.sessionDate}`,
    };
  }

  /**
   * Calculate syllabus / lesson plan completion items
   */
  calculateLessonPlanItems(
    lessonPlans: LessonPlanCalculationInput[],
    completionRate: number = PayrollPolicy.LESSON_PLAN_COMPLETION_RATE,
  ): PayrollItemDraft[] {
    if (completionRate <= 0) {
      return [];
    }

    const items: PayrollItemDraft[] = [];
    for (const lp of lessonPlans) {
      if (lp.status === 'APPROVED') {
        const quantity = 1;
        const amount = (quantity * completionRate).toFixed(2);
        items.push({
          type: 'SYLLABUS_COMPLETION',
          quantity: quantity.toFixed(2),
          rate: completionRate.toFixed(2),
          amount,
          referenceId: lp.lessonPlanId,
          description: `Approved Lesson Plan Completion (${lp.lessonPlanId})`,
        });
      }
    }
    return items;
  }

  /**
   * Create an adjustment payroll item draft
   */
  calculateAdjustmentItem(
    amount: number | string,
    description: string,
    referenceId?: string | null,
  ): PayrollItemDraft {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formattedAmount = isNaN(numAmount) ? '0.00' : numAmount.toFixed(2);

    return {
      type: 'ADJUSTMENT',
      quantity: '1.00',
      rate: formattedAmount,
      amount: formattedAmount,
      referenceId: referenceId || null,
      description,
    };
  }

  /**
   * Sum all item amounts and return total as string with 2 decimal precision
   */
  computeTotal(items: { amount: string | number }[]): string {
    const sum = items.reduce((acc, item) => {
      const val = typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    return sum.toFixed(2);
  }
}
