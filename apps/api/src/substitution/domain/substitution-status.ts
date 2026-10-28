/**
 * Substitution request statuses in which the approved substitute is the teacher
 * responsible for the session.
 *
 * `completeSession` moves an APPROVED request to COMPLETED, so anything that
 * attributes a session to its substitute (teacher attendance, payroll) must
 * accept both states, otherwise attribution disappears once the session is done.
 */
export const SUBSTITUTE_EFFECTIVE_STATUSES = ['APPROVED', 'COMPLETED'] as const;
