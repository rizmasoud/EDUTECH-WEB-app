# EDUTECH — Business Rules

## 1. Purpose

This document defines the business rules that EduTech must follow.

It is the reference for decisions about students, books, classes, scheduling, teachers, attendance, compensation, lesson plans, promotion, and communication.

Business rules describe what the application must do from the perspective of the language institute. They are separate from implementation details such as database tables, API routes, and UI components.

## 2. Rule Status

Every rule must have one of the following statuses:

- **Confirmed:** Explicitly approved by the product owner.
- **Proposed:** Suggested but not yet approved.
- **Needs clarification:** Insufficient information exists to define the rule safely.
- **Deprecated:** Previously used but no longer applicable.

Claude must not convert a proposed or unclear rule into a confirmed rule without explicit approval.

When documentation, existing code, and product-owner instructions disagree, report the conflict instead of silently choosing one.

## 3. Students and Book Levels

### BR-STU-001 — Student Book-Level Assignment

**Status:** Confirmed requirement; implementation needs verification.

A supervisor must be able to assign a student's appropriate book or level when creating the student.

The application must validate the assignment and prevent invalid relationships between students, books, and levels.

### BR-STU-002 — Student Data Import

**Status:** Confirmed requirement; detailed validation rules need verification.

The application must support importing relevant student and class data from the institute's existing Shahvar Excel files.

Financial information, discounts, debts, age, and phone numbers are not required for the intended import.

The existing three-digit Shahvar code may be retained if it helps identify records and avoid duplicate imports. Its exact meaning must be verified before it is used as a guaranteed unique identifier.

### BR-STU-003 — Duplicate Students

**Status:** Needs clarification.

The application must identify potential duplicate records during import or manual creation.

The matching criteria and the supervisor's options for resolving duplicates must be agreed upon before implementation.

## 4. Books and Levels

### BR-BOOK-001 — Book-Level Consistency

**Status:** Confirmed requirement; exact model needs verification.

Students and classes must reference valid books or levels. The application must prevent inconsistent assignments.

### BR-BOOK-002 — Book Sequence

**Status:** Needs clarification.

The application may need to represent the sequence of books and levels to determine the next level after promotion.

The sequence must be based on approved book configuration, not assumptions embedded in application code.

## 5. Class Types

### BR-CLASS-001 — Ordinary Group Classes and Private Classes

**Status:** Confirmed distinction.

Ordinary group classes and private classes are different class types and must not be treated as interchangeable.

### BR-CLASS-002 — Substitute Teachers

**Status:** Confirmed distinction.

A class temporarily assigned to a substitute teacher is not the same thing as a private class.

The data model and workflows must preserve this distinction.

## 6. Scheduling and Unavailable Times

### BR-SCHED-001 — Unavailable Times

**Status:** Confirmed requirement; detailed rules need clarification.

The system must support recording times when a teacher is unavailable for scheduling.

The product owner must confirm whether unavailable times also apply to classrooms or other resources.

The scheduling process must respect applicable unavailable times and explain why a proposed assignment cannot be accepted.

### BR-SCHED-002 — Conflict Detection

**Status:** Confirmed requirement; exact constraints need verification.

The system must identify scheduling conflicts involving relevant teachers, classes, and other constrained resources.

The exact conflict rules must be documented and tested.

### BR-SCHED-003 — Scheduling Proposals

**Status:** Existing workflow needs verification.

If the current application uses scheduling proposals, changes should be reviewed and validated before being committed to the actual schedule.

Inspect the current implementation before changing this workflow.

### BR-SCHED-004 — Weekly Schedule Patterns

**Status:** Needs clarification.

The exact permitted teaching days, recurring patterns, and time restrictions must be confirmed against the current requirements.

Do not invent a universal schedule or hard-code unverified assumptions.

## 7. Teacher Accounts and Responsibilities

### BR-TEACH-001 — Teacher Access

**Status:** Confirmed requirement; details need verification.

Teachers must have access to their own authorized workflows and must not automatically receive supervisor permissions.

### BR-TEACH-002 — Supervisor Who Also Teaches

**Status:** Proposed; requires confirmation.

If the supervisor also teaches classes, the application may need a separate teacher account for teaching activities.

Confirm the desired account relationship and login workflow before implementing it.

### BR-TEACH-003 — Teacher Corrections

**Status:** Needs clarification.

Determine which teacher-recorded information can be edited directly and which corrections require a ticket or supervisor approval.

Preserve an appropriate history of important changes.

## 8. Attendance and Compensation

### BR-PAY-001 — Attendance Records

**Status:** Confirmed requirement; detailed rules need verification.

The system must record attendance for relevant classes and allow authorized corrections.

### BR-PAY-002 — Compensation Calculation

**Status:** Needs clarification.

Teacher compensation must follow an explicitly approved formula.

The formula, applicable rates, counting rules, rounding behavior, and correction handling must be confirmed before implementation.

Do not infer a final formula from example values or existing code alone.

## 9. Lesson Plans and Syllabus

### BR-LESSON-001 — Book Requirements

**Status:** Existing requirement needs verification.

The supervisor must be able to define relevant lesson or syllabus requirements for each book.

### BR-LESSON-002 — Teacher Submissions

**Status:** Existing requirement needs verification.

Teachers must be able to submit relevant lesson-plan or syllabus progress information.

### BR-LESSON-003 — Attachments

**Status:** Needs clarification.

The application may support relevant file attachments. Confirm allowed file types, size limits, permissions, and retention requirements against existing approved requirements.

## 10. Student Promotion

### BR-PROMO-001 — End-of-Term Outcomes

**Status:** Existing requirement needs verification.

The application must support the approved end-of-term student outcomes, including passing, conditional progression, and failing, if those outcomes remain part of the approved workflow.

### BR-PROMO-002 — Promotion Decisions

**Status:** Needs clarification.

Confirm which outcomes trigger automatic promotion and which require a supervisor decision.

Any batch-promotion workflow must preserve the ability to identify and review individual decisions when necessary.

### BR-PROMO-003 — Missing Next Level

**Status:** Confirmed validation requirement.

The system must not silently promote a student when no valid next book or level exists. It must provide a clear explanation to the supervisor.

## 11. Tickets and Communication

### BR-COMM-001 — Teacher Tickets

**Status:** Confirmed requirement; workflow needs verification.

Teachers must be able to submit tickets to the supervisor.

The application should preserve ticket status and relevant communication history.

### BR-COMM-002 — Attachments in Tickets

**Status:** Needs verification.

If ticket attachments are supported, access control and file validation must be enforced.

### BR-COMM-003 — Chat Versus Tickets

**Status:** Needs clarification.

A ticket system and a real-time chat system are separate capabilities. Do not treat one as a replacement for the other without product-owner approval.

## 12. Substitute-Teacher Workflow

### BR-SUB-001 — Substitute Eligibility

**Status:** Existing requirement needs verification.

Only teachers who satisfy the approved eligibility rules should be considered for a substitute assignment.

### BR-SUB-002 — Approval

**Status:** Needs clarification.

Confirm whether supervisor approval is required before a substitute assignment becomes final and how teachers are notified.

## 13. General Data Integrity and Permissions

### BR-DATA-001 — Data Integrity

**Status:** Confirmed requirement.

The application must validate important relationships and prevent invalid data from being silently saved.

### BR-SEC-001 — Authorization

**Status:** Confirmed requirement.

Sensitive operations must be authorized on the backend. Hiding a UI control alone is not sufficient authorization.

### BR-AUDIT-001 — Important Changes

**Status:** Needs clarification.

Determine which business decisions and corrections require an audit history, including who made the change and when.

## 14. Decision Log

Maintain a decision log for all business rules that require clarification.

For each item, record:

- Rule ID
- Question or conflict
- Available evidence
- Possible interpretations, where useful
- Decision required from the product owner
- Final approved decision
- Date of approval

Do not create a new rule merely to fill a documentation gap.

## 15. Maintenance

Update this document whenever the product owner confirms, changes, or retires a business rule.

Before implementing a feature, check the relevant rules and identify unresolved dependencies.

If implementation reveals a contradiction or missing rule, pause the affected decision and ask for clarification rather than silently inventing behavior.