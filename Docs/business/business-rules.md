# EduTech — Business Rules

## 1. Purpose

This document defines the business rules and domain policies that govern EduTech.

The purpose of these rules is to establish how the system must behave independently of the user interface, database implementation, or specific API design.

Business rules are authoritative for:

- Validation of domain operations
- State transitions
- Scheduling decisions
- Student progression
- Attendance
- Lesson plans and syllabus completion
- Substitution
- Payroll
- Imports
- Tickets
- Authorization-sensitive operations
- Historical data integrity

The frontend may provide validation and guidance for usability, but it must never be the final authority for business rules.

The backend and domain/application layers must enforce these rules.

---

# 2. Core Business Principles

## 2.1 Backend Is the Final Authority

Business rules must be enforced on the backend.

Frontend validation exists for usability and early feedback only.

A request must still be validated when it reaches the backend, even if the frontend has already validated it.

The system must never rely on the browser to enforce:

- Permissions
- Ownership
- Role restrictions
- Capacity
- Scheduling constraints
- Promotion rules
- Payroll rules
- Attendance restrictions
- Enrollment validity
- State transitions
- Import integrity

---

## 2.2 Historical Data Must Be Preserved

EduTech manages educational history.

Historical records must not be silently rewritten when current data changes.

Examples:

- Changing a Class teacher must not rewrite the teacher of previous ClassSessions.
- Changing a Student's current class must not erase previous enrollments.
- Changing a Book must not invalidate historical exam results.
- Changing a Teacher's base rate must not rewrite finalized payroll.
- Correcting Attendance must create an auditable change rather than silently replacing history.

When an entity becomes inactive, the preferred approach is deactivation/status changes rather than destructive deletion.

---

## 2.3 Critical Operations Must Be Transactional

Operations that modify multiple related records must be performed atomically where appropriate.

Examples include:

- Promotion processing
- Promotion decisions
- Payroll calculation/finalization
- Import commit
- Substitution approval
- Attendance correction
- Critical class/schedule changes

The system must avoid partially completed business operations.

---

## 2.4 State Transitions Must Be Controlled

Entities with lifecycle states must not be allowed to move arbitrarily between states.

The backend must define valid transitions.

For example:

```text
DRAFT → ACTIVE → COMPLETED
DRAFT → CANCELLED
```

A request attempting an invalid transition must be rejected.

---

# 3. Academic Terms

## 3.1 Term Structure

An AcademicTerm represents an academic period.

An AcademicTerm has:

- Name
- Start date
- End date
- Status

Valid statuses:

- `PLANNED`
- `ACTIVE`
- `CLOSED`

The start date must be before the end date.

---

## 3.2 Term Lifecycle

A planned term can become active.

An active term can become closed.

A closed term represents a historical academic period and must not be casually modified.

Historical data belonging to a closed term must remain preserved.

Operations affecting historical records should require explicit authorization and auditing.

---

# 4. Books, Levels and Educational Structure

## 4.1 Book Ordering

Books are ordered using `sequenceOrder`.

The next book for a student is determined from the book sequence rather than hard-coded book names.

The system must not assume specific book names represent progression.

---

## 4.2 Book Hierarchy

The educational hierarchy is:

```text
Book
  └── BookPart
        └── BookSegment
```

A BookSegment must belong to the BookPart it references.

A BookPart must belong to the Book it references.

A Class may optionally target a specific BookSegment.

If a Class specifies a BookSegment, the BookSegment must belong to the same Book assigned to the Class.

---

## 4.3 Terminal Books

A Book may be marked as terminal.

If a student successfully completes a terminal Book:

- The system must not attempt to find a nonexistent next Book.
- The result must become `TERMINAL_COMPLETION`.
- No `toBookId` is required.
- The operation must complete successfully.

Terminal completion is a valid business outcome, not an error.

---

# 5. Students

## 5.1 Student Identity

The EduTech Student ID is the system's primary identity.

The Shahvar code is an external reference.

The system must not treat a student's full name as a reliable unique identifier.

---

## 5.2 Shahvar Code

A Shahvar code may be stored when available.

The system must not assume that the Shahvar code is globally unique unless the actual Shahvar data and operational process establish that guarantee.

If a stable Shahvar identifier exists, it should be preferred for import matching.

---

## 5.3 Student Historical State

Student educational history must be preserved.

A student may have:

- Multiple enrollments over time
- Multiple classes
- Multiple books
- Multiple exam results
- Multiple promotion records

Current educational state must not be confused with historical records.

---

# 6. Teachers

## 6.1 Teacher Identity

A Teacher is a domain entity separate from an Account.

A Teacher may have an Account for system access.

An Account does not automatically represent a Teacher.

---

## 6.2 Teacher Activation

A Teacher may be deactivated.

Deactivation does not remove historical:

- Classes
- Sessions
- Attendance
- Payroll
- Lesson Plans
- Substitution records
- Audit records

A deactivated Teacher must not be treated as eligible for new operational assignments unless explicitly reactivated.

---

## 6.3 Teacher Skills

A Teacher must have the required skill for a Book before being assigned to a Class or Session where that skill is required.

Teacher eligibility must be checked by the backend.

TeacherSkill granularity may be expanded to BookSegment in the future if operational requirements justify it.

---

# 7. Classes

## 7.1 Class Types

A Class has one of two types:

- `REGULAR`
- `PRIVATE`

These represent different educational/payment contexts.

Private Classes must not be treated as substitution requests.

Substitution is a Session-level operational concept.

---

## 7.2 Class Status

Valid Class statuses:

- `DRAFT`
- `ACTIVE`
- `COMPLETED`
- `CANCELLED`

A Draft Class may be incomplete.

For example, it may temporarily lack:

- Teacher
- Schedule
- Students

An Active Class must satisfy the required operational constraints.

---

## 7.3 Active Class Requirements

Before a Class becomes active, the backend should verify:

- Valid AcademicTerm
- Valid Book
- Valid BookSegment if provided
- Appropriate Teacher
- Teacher eligibility
- Valid capacity
- Appropriate enrollment
- Valid Schedule
- No major scheduling conflicts
- Required operational configuration

The exact minimum capacity remains configurable and is currently an open implementation decision between the previously discussed values of 8 and 10.

The normal target capacity is 12.

The maximum capacity is 15.

---

## 7.4 Class Deletion

A Class with historical operational records must not be hard-deleted.

This includes Classes with:

- ClassSessions
- Attendance
- Exams
- Promotions
- Payroll references
- Substitution records
- Other historical records

Such Classes should normally be completed or cancelled instead.

---

# 8. Enrollment

## 8.1 Enrollment

Students are connected to Classes through Enrollment.

An Enrollment must reference:

- One Student
- One Class

The same Student must not have duplicate active Enrollment records in the same Class.

---

## 8.2 Enrollment Status

Valid Enrollment statuses:

- `ACTIVE`
- `COMPLETED`
- `WITHDRAWN`

Changing a student's current class must not erase previous Enrollment history.

---

## 8.3 Enrollment and Promotion

Promotion and Enrollment are separate concepts.

A successful Promotion allows a student to progress educationally.

It does not automatically mean that a new Class Enrollment must immediately be created unless the specific workflow explicitly performs that operation.

A student must not be placed into a higher Book without a valid educational progression decision.

---

# 9. Capacity Rules

The standard Class capacity policy is:

- Target: 12 students
- Maximum: 15 students
- Minimum: configurable

The backend must reject enrollment that exceeds the maximum capacity.

Capacity checks must be transaction-safe to prevent concurrent requests from exceeding the limit.

Capacity rules must be centralized rather than duplicated across frontend components.

---

# 10. Scheduling Rules

## 10.1 Scheduling Philosophy

EduTech scheduling is decision support.

The system proposes schedules based on rules and preferences.

The Supervisor remains in control of the final schedule.

The system must provide understandable reasons for scheduling decisions and conflicts.

---

## 10.2 Days

The normal day patterns are:

### Odd Classes

- Sunday
- Tuesday
- Thursday

### Even Classes

- Saturday
- Monday
- Wednesday

Friday is closed.

These rules should be configurable rather than deeply hard-coded where practical.

---

## 10.3 Thursday Preference

Thursday morning is a scheduling preference.

It is not an absolute requirement unless explicitly configured as a hard constraint.

---

## 10.4 Hard Scheduling Constraints

The scheduling system must enforce hard constraints such as:

- Friday is unavailable
- Teacher cannot have overlapping sessions
- Class cannot have contradictory schedules
- Teacher must have required skills
- Capacity must remain valid
- Start time must precede end time
- Other configured hard conflicts must not be violated

A schedule violating a hard constraint must not be presented as valid.

---

## 10.5 Soft Scheduling Preferences

Soft preferences may include:

- Thursday morning preference
- Teacher preferred time slots
- Better distribution of sessions
- Other configurable scheduling preferences

Soft preferences may affect scheduling scores but must not override hard constraints.

---

## 10.6 Student Scheduling Conflicts

If a student is enrolled in multiple Classes with overlapping schedules, the system must detect the conflict.

The conflict should be visible to the Supervisor.

The system must not silently ignore such conflicts.

---

# 11. Scheduling Proposals

## 11.1 Proposal Principle

The scheduling engine should normally generate a proposal before final schedule changes are committed.

A Proposal may contain:

- Suggested Classes
- Suggested Schedules
- Constraint results
- Detected conflicts
- Preference information
- Explanatory scoring
- Creator
- Timestamp
- Status

---

## 11.2 Proposal Status

Valid statuses:

- `DRAFT`
- `PENDING_REVIEW`
- `ACCEPTED`
- `MODIFIED`
- `REJECTED`

---

## 11.3 Supervisor Review

The Supervisor may:

- Accept the proposal
- Modify the proposal
- Reject the proposal

A modified proposal must preserve the final decision context.

The system must not treat a rejected proposal as an active schedule.

---

## 11.4 Manual Scheduling

Manual scheduling is allowed.

However, manually created schedules must still pass backend validation.

Manual scheduling must not bypass:

- Teacher conflicts
- Class conflicts
- Teacher skill requirements
- Capacity constraints
- Time validity
- Other hard constraints

---

# 12. Schedule vs ClassSession

A Schedule represents the recurring plan.

A ClassSession represents a specific occurrence.

Example:

```text
Schedule
Sunday 18:00–20:00

ClassSession
2026-10-04 18:00–20:00
```

Changing a future Schedule must not rewrite already completed historical Sessions.

A Session stores its actual execution information.

Multiple Sessions on the same day must remain possible unless a future business decision explicitly restricts them.

---

# 13. Class Sessions

## 13.1 Session Status

Valid statuses:

- `SCHEDULED`
- `COMPLETED`
- `CANCELLED`

A cancelled Session must not normally be treated as a completed teaching Session.

---

## 13.2 Session Teacher

The teacher associated with the Class is not necessarily the actual teacher for every Session.

Substitution occurs at Session level.

The system must preserve which Teacher actually conducted a Session.

This distinction is important for:

- Attendance
- Payroll
- Substitution
- Audit

---

# 14. Student Attendance

## 14.1 Attendance Status

Valid student attendance statuses:

- `PRESENT`
- `ABSENT`
- `LATE`
- `EXCUSED`

Attendance belongs to a ClassSession.

It does not belong directly to a recurring Schedule.

---

## 14.2 Attendance Eligibility

Attendance may only be recorded when:

- The Session exists
- The Session is not cancelled
- The Student is enrolled in the Class
- The Teacher/Account has permission to record the attendance

The backend must verify these conditions.

---

## 14.3 Teacher Attendance

Teacher attendance is a separate domain concept.

`TeacherAttendanceRecord` must not be confused with Student Attendance.

Teacher attendance is relevant to payroll and represents whether the Teacher actually fulfilled the teaching Session.

---

## 14.4 Attendance Corrections

Teachers must not directly delete attendance records.

If an Attendance record is incorrect:

1. The Teacher creates an appropriate Ticket.
2. The Supervisor reviews the request.
3. The Supervisor may approve/correct the Attendance.
4. The correction is recorded in AuditLog.
5. The correction should preserve the reason and actor.

Sensitive attendance changes must be auditable.

---

# 15. Syllabus

## 15.1 Syllabus Ownership

The Syllabus represents canonical educational requirements.

The Supervisor owns and manages the Syllabus.

Teachers must not modify the canonical Syllabus.

---

## 15.2 Syllabus Scope

A Syllabus may belong to:

- A Book
- Optionally a specific BookSegment

Syllabus items may represent requirements such as:

- Film
- Workbook exercise
- Conversation
- Grammar
- Vocabulary
- Other educational activities

---

## 15.3 Required Items

A SyllabusItem may be marked as required.

The `sequenceOrder` provides a recommended ordering.

Sequence order must not automatically be interpreted as a strict dependency unless explicitly configured.

---

# 16. Lesson Plans

## 16.1 Lesson Plan Ownership

A LessonPlan belongs to a Class and is created by its Teacher.

A LessonPlan is an execution plan based on the canonical Syllabus.

---

## 16.2 Lesson Plan Status

Valid statuses:

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `REJECTED`

---

## 16.3 Teacher Workflow

The normal workflow is:

```text
View Syllabus
      ↓
Create Lesson Plan
      ↓
Submit
      ↓
Supervisor Review
      ↓
Approve / Reject
```

The Teacher may edit a Draft.

Once submitted, the appropriate review rules apply.

---

## 16.4 Lesson Plan Completion

Lesson Plan items may be explicitly marked completed.

Completion should record completion time where applicable.

Lesson Plan completion is separate from payroll calculation.

Payroll may consume valid completion information according to the Payroll Policy.

---

## 16.5 Substitute Access

An approved substitute Teacher may view the relevant Lesson Plan as needed to conduct the Session.

The substitute must not be able to alter the canonical Syllabus.

---

# 17. Exams

## 17.1 Exam Types

Supported exam types include:

- `FINAL`
- `MIDTERM`
- `OTHER`

The system may add additional types later without changing the fundamental promotion model.

---

## 17.2 Score Range

Exam scores must be between:

```text
0 and 100
```

inclusive.

Invalid scores must be rejected.

---

## 17.3 Exam Result Eligibility

An ExamResult must belong to:

- A valid Exam
- A Student enrolled in the relevant Class

A student must not receive an exam result for a Class in which they were not enrolled.

---

# 18. Promotion Rules

## 18.1 Promotion Thresholds

Promotion is determined by exam score.

### Score >= 70

The result is automatically successful.

No Supervisor approval is required.

The system may notify the Supervisor or display the result in the appropriate dashboard, but approval is not a prerequisite.

---

### Score 60–69

The result requires Supervisor decision.

The Promotion status becomes:

`PENDING_DECISION`

The Supervisor may choose an appropriate decision such as:

- Promote
- Do Not Promote
- Repeat
- Remedial

---

### Score < 60

The result requires Supervisor decision.

The Supervisor determines the appropriate outcome according to the available policy.

Possible decisions include:

- Repeat
- Remedial
- Do Not Promote
- Other configured outcome

---

## 18.2 Promotion Decision Audit

Supervisor decisions must record:

- Decision
- Decision maker
- Decision time
- Relevant ExamResult
- Relevant Student
- From Book
- To Book where applicable

---

## 18.3 Promotion Idempotency

Promotion processing must be idempotent.

The same ExamResult must not accidentally create multiple conflicting Promotion records because the processing operation was repeated.

---

## 18.4 Score Changes

Changing an ExamResult after promotion processing is a sensitive operation.

The backend must handle the resulting promotion state transactionally.

The change must be audited.

The system must not leave the Student in a contradictory educational state.

---

# 19. Substitution

## 19.1 Session-Level Substitution

Substitution applies to a specific ClassSession.

It does not permanently replace the Class's assigned Teacher.

---

## 19.2 Eligibility

A substitute candidate must satisfy the required eligibility rules, including:

- Active Teacher
- Appropriate TeacherSkill
- No scheduling conflict
- No other hard eligibility violation

Eligibility must be rechecked when the Supervisor approves the substitution.

A Teacher being eligible when the request was created does not guarantee eligibility later.

---

## 19.3 Broadcast Workflow

The normal workflow is:

```text
Supervisor/authorized user creates request
        ↓
Eligible Teachers receive request
        ↓
Teachers Accept / Decline
        ↓
Supervisor selects candidate
        ↓
Backend revalidates eligibility
        ↓
Supervisor approves
        ↓
Session uses approved substitute
```

Teacher responses are not final approval.

---

## 19.4 Emergency Substitution

An emergency/fallback workflow may allow:

```text
Teacher teaches
      ↓
Supervisor approval afterward
```

This state must be explicit.

The system must not hide emergency substitution inside the normal approval state.

The event must be audited.

---

## 19.5 Substitution and Payroll

Payroll must distinguish:

- Original Class Teacher
- Actual Session Teacher

The exact substitute payment policy remains an implementation-time business decision.

Substitution must not be confused with Private Class payment.

---

# 20. Private Classes

Private Classes are a separate ClassType.

They are not a special form of substitution.

The currently defined business rule is:

```text
Private Class price: 500
Teacher share:       350
```

The teacher share therefore represents 70% of the current private-class price.

These values should be represented through the appropriate Payroll/Private Class policy rather than scattered as magic numbers throughout the application.

If the business later changes these amounts, the policy should be changed centrally.

---

# 21. Payroll

## 21.1 Payroll Principle

Payroll must be explainable.

The system must not simply show a final number without showing how it was calculated.

A Supervisor should be able to understand:

- Which Sessions contributed
- Which Teacher Attendance records contributed
- Which Syllabus/Lesson Plan completions contributed
- Which Private Classes contributed
- Which Substitution work contributed
- Which Adjustments contributed
- Which rates were used

---

## 21.2 Teacher Base Rate

Each Teacher may have an individual `baseRate`.

Payroll must use the appropriate Teacher-specific rate according to the Payroll Policy.

Changing the current Teacher base rate must not silently rewrite finalized historical payroll.

---

## 21.3 Payroll Items

Payroll should be composed of itemized records.

Supported item categories include:

- `SESSION`
- `SYLLABUS_COMPLETION`
- `PRIVATE_CLASS`
- `SUBSTITUTION`
- `ADJUSTMENT`

Each item should provide enough information to explain its amount.

---

## 21.4 Payroll Calculation

Base payroll items follow:

```text
amount = quantity × rate
```

The exact meaning of quantity and rate depends on the item type.

The exact formulas for:

- Session payment
- Syllabus completion
- Substitution payment
- Other compensation

remain configurable Payroll Policy decisions.

---

## 21.5 Attendance and Payroll

Teacher payroll must use TeacherAttendanceRecord and the applicable Payroll Policy.

Student attendance alone must never be used as a direct replacement for Teacher attendance.

---

## 21.6 Cancelled Sessions

Cancelled Sessions should not normally generate teaching payment.

Any exception must be explicitly defined by Payroll Policy.

---

## 21.7 Payroll Lifecycle

Payroll statuses:

- `DRAFT`
- `CALCULATED`
- `REVIEWED`
- `FINALIZED`

The system may calculate payroll multiple times before finalization.

Calculation must be idempotent.

---

## 21.8 Finalized Payroll

Once finalized:

- Normal editing must be blocked.
- Total must match the PayrollItems.
- Changes must use an explicit audited correction process.
- Historical values must remain explainable.

The Supervisor should not directly overwrite `totalAmount` without corresponding PayrollItems and audit information.

---

## 21.9 Payroll Adjustments

Manual corrections must use an explicit `ADJUSTMENT` PayrollItem.

An adjustment should contain:

- Amount
- Reason
- Actor
- Relevant payroll
- Audit information

Directly editing the final total is not an acceptable normal workflow.

---

# 22. Shahvar Import

## 22.1 Import Scope

Shahvar import is designed to transfer required educational data into EduTech.

Only relevant fields should be imported.

The import should not bring unnecessary Shahvar information into EduTech.

Examples of excluded information include:

- Age
- Phone number
- Discount
- Debt
- Other financial or irrelevant fields

---

## 22.2 Import Workflow

The normal workflow is:

```text
Upload
  ↓
Parse
  ↓
Validate
  ↓
Match / Create
  ↓
Preview
  ↓
Supervisor Review
  ↓
Commit
```

The system must not immediately modify production data merely because an Excel file was uploaded.

---

## 22.3 Student Matching

Preferred matching order:

1. Stable Shahvar identifier when available
2. Explicit/manual review for ambiguous cases

Full name alone must not be treated as sufficient identity matching.

If multiple students could match the same import row, the system must request review rather than guessing.

---

## 22.4 Class Matching

The Supervisor must explicitly control:

- AcademicTerm
- Book mapping
- Class mapping/creation

The import must not blindly create Classes based only on similar text.

---

## 22.5 Import Idempotency

Repeating the same import must not create duplicate Students, Classes, or Enrollments when the same records can be reliably matched.

---

## 22.6 Import Errors

The system must distinguish:

- Success
- Warning
- Error
- Skipped

Import errors must be visible to the Supervisor.

The system must not silently discard invalid rows.

---

## 22.7 Import Transaction Safety

Import commit must avoid leaving the database in an inconsistent partial state.

Large imports may use controlled batching or background processing, but the business result must remain consistent and auditable.

---

# 23. Tickets

## 23.1 Ticket Purpose

Tickets are used for controlled requests, corrections, and operational issues.

Tickets are not a general-purpose chat system.

Tickets do not replace AuditLog.

Tickets do not replace Notifications.

---

## 23.2 Ticket Types

Supported ticket types include:

- `ATTENDANCE_CORRECTION`
- `CLASS_CORRECTION`
- `LESSON_PLAN_ISSUE`
- `SUBSTITUTION_ISSUE`
- `PAYROLL_ISSUE`
- `STUDENT_DATA_CORRECTION`
- `TEACHER_DATA_CORRECTION`
- `SYSTEM_ISSUE`
- `OTHER`

---

## 23.3 Ticket Status

Valid statuses:

- `OPEN`
- `IN_PROGRESS`
- `RESOLVED`
- `REJECTED`
- `CANCELLED`

---

## 23.4 Teacher Ticket Permissions

Teachers may:

- Create allowed Tickets
- View their own Tickets
- Add Messages
- Add Attachments
- Cancel appropriate Tickets

Teachers must not directly use Tickets as a mechanism to bypass authorization and edit protected records themselves.

---

## 23.5 Supervisor Ticket Permissions

Supervisors may:

- View Tickets within their scope
- Assign Tickets
- Respond
- Change Ticket status
- Resolve or reject Tickets
- Perform the authorized underlying correction

Sensitive corrections must still obey the relevant domain rules and auditing requirements.

---

# 24. Attachments

Attachments may be added to Tickets.

Initially supported categories include:

- Images
- PDF
- Documents

Initial maximum file size:

```text
5 MB per file
```

The limit must be configurable.

Files should be stored in external file storage.

The database stores metadata and the secure storage reference.

File access must be authorization-controlled.

---

# 25. Notifications

## 25.1 Notification Principle

Notifications are operational signals, not a complete communication system.

MVP notifications are in-app.

Real-time WebSocket delivery is not required.

Polling or normal refetching is acceptable.

---

## 25.2 Notification Events

Examples include:

- Ticket created/updated
- Substitution request
- Substitution approval
- Lesson Plan submitted
- Lesson Plan result
- Promotion decision required
- Payroll ready
- Payroll finalized
- Import completed
- Import completed with errors
- System alerts

---

## 25.3 Promotion Notifications

For scores >=70, promotion is automatic.

For scores 60–69 and below 60, the Supervisor should receive an appropriate decision-required notification.

---

## 25.4 Notification Independence

Failure to create a non-critical notification should generally not roll back the core business operation.

For example, failure to create a notification should not undo a valid attendance correction.

Sensitive notification content should avoid unnecessary private information.

---

# 26. Authentication and Authorization

## 26.1 Login

Users authenticate using:

- Personnel Code
- Password

Passwords must be securely hashed.

Plain-text passwords must never be stored, returned, logged, or included in audit metadata.

---

## 26.2 Roles

The MVP has only:

- `SUPERVISOR`
- `TEACHER`

There is no Secretary role in the current design.

---

## 26.3 Multiple Roles

An Account may have multiple roles.

For example, the same Account may be:

- Supervisor
- Teacher

at the same time.

Role checks must therefore support multiple assigned roles.

---

## 26.4 Teacher Authorization

A Teacher must only access resources they are authorized to access.

Authorization must consider:

- Role
- Ownership
- Assigned Classes
- Assigned Sessions
- Substitution responsibility
- Ticket scope
- Other resource-specific rules

A Teacher must not gain access merely by changing an ID in a request.

---

## 26.5 Supervisor Authorization

Supervisor access is broader, but it does not bypass domain integrity rules.

A Supervisor cannot perform an operation that violates a hard business rule merely because they have a higher role.

Where a rule explicitly permits Supervisor override, the override must be explicit and auditable.

---

# 27. Audit Rules

The following categories must be auditable where applicable:

- Login/security events
- Account activation/deactivation
- Role changes
- Password/security changes
- Student changes
- Teacher changes
- Class changes
- Schedule changes
- Attendance corrections
- Syllabus changes
- Lesson Plan review
- Exam changes
- Promotion processing and decisions
- Substitution
- Payroll calculation/finalization/adjustment
- Import operations
- Ticket resolution
- Other sensitive administrative operations

Audit records must contain enough context to understand:

- Who performed the action
- What entity was affected
- What action occurred
- When it occurred
- Relevant metadata

---

# 28. Data Integrity Rules

The database and backend must jointly protect important invariants.

Examples include:

- Unique personnel codes
- Valid foreign-key relationships
- Valid score range
- Valid enrollment uniqueness
- Valid exam result uniqueness
- Valid teacher-book skill uniqueness
- Valid attendance uniqueness per Session/Student
- Valid substitution response uniqueness
- Valid state transitions
- Valid payroll relationships
- Valid Class/Book/Segment relationships

The frontend must not be treated as a security or integrity boundary.

---

# 29. Concurrency Rules

Business-critical operations must account for concurrent requests.

Examples:

### Capacity

Two simultaneous enrollment requests must not both succeed if they would exceed Class capacity.

### Substitution

Two Supervisors or processes must not approve conflicting substitutes for the same Session.

### Payroll

Two calculations/finalization operations must not create duplicate or contradictory PayrollItems.

### Promotion

Repeated processing of the same ExamResult must not create conflicting Promotion records.

Database constraints and transactions should be used where appropriate.

---

# 30. Error Handling Principles

Business rule violations should produce meaningful, stable backend errors.

Errors should distinguish between cases such as:

- Invalid input
- Unauthorized operation
- Resource not found
- Conflict
- Invalid state transition
- Business rule violation

The frontend should be able to display useful messages without needing to understand internal database implementation details.

---

# 31. Business Rules vs UI Behavior

UI behavior must not redefine business rules.

For example:

The UI may show:

> "This class is full."

But the backend must independently verify the capacity.

The UI may disable a button for a Teacher.

The backend must still reject an unauthorized request if the button is bypassed.

The UI may display:

> "Score 70 or higher will promote automatically."

The backend must independently execute and enforce the promotion policy.

---

# 32. Business Rules vs Database Constraints

Not every business rule should be implemented exclusively as a database constraint.

Database constraints are appropriate for structural invariants.

Application/domain policies are appropriate for complex behavior.

Examples:

### Database

- Unique personnel code
- Unique enrollment per Class/Student
- Foreign keys
- Score range
- Required fields

### Domain/Application

- Promotion thresholds
- Scheduling policies
- Teacher eligibility
- Payroll formulas
- Import matching
- Substitution workflow
- Ticket-driven corrections

The system should use both layers where appropriate.

---

# 33. Open Business Decisions

The following decisions remain intentionally open and must be finalized during implementation when enough real-world information is available.

## 33.1 Minimum Class Capacity

Previously discussed values:

- 8
- 10

The final policy should be configurable if operationally appropriate.

---

## 33.2 Payroll Formula

The following require final business definition:

- Exact Session payment formula
- Syllabus completion payment
- Substitution payment
- Exceptions for cancelled sessions
- Any special payroll adjustments

---

## 33.3 Teacher Skill Granularity

Current default:

```text
Teacher → Book
```

Future possibility:

```text
Teacher → BookSegment
```

The simpler Book-level model should be used unless real requirements require finer granularity.

---

## 33.4 Multiple Sessions Per Day

The current design intentionally does not enforce:

```text
UNIQUE(classId, sessionDate)
```

until the real operational requirement is confirmed.

---

## 33.5 File Storage

The following remain implementation decisions:

- Storage provider
- Maximum file size
- MIME restrictions
- Retention
- Secure access mechanism

The initial attachment size is 5 MB per file.

---

## 33.6 Authentication Session Mechanism

The preferred web approach is secure cookie-based authentication, but exact implementation details remain an implementation decision.

---

## 33.7 Institute Scope

If the application must manage two independent institutes from the beginning, an `Institute` entity should be introduced and relevant data scoped to it.

This decision should be made before finalizing production schema and authorization boundaries if multi-institute operation is required.

---

## 33.8 Shahvar Import Mapping

The exact Excel column mapping must be finalized against real sample files.

The import system must not assume that similarly named columns always have identical meaning.

---

# 34. Explicitly Out of Scope

The following are not part of the current MVP business rules unless explicitly added later:

- Secretary role
- Student login
- Parent portal
- Online student registration
- Online payments
- Accounting system
- CRM
- SMS
- Email notification infrastructure
- Full chat system
- Advanced BI
- Shahvar replacement
- Offline-first synchronization
- Native mobile application
- Microservice architecture
- Complex task-management system
- General-purpose notes system

---

# 35. Business Rule Implementation Principles

When implementing these rules:

1. Business-critical logic must not live only in React/Next.js UI code.
2. Backend authorization must be enforced independently.
3. Domain policies should be isolated when they contain meaningful complexity.
4. Scheduling, Promotion, Payroll, Import, and other complex workflows should have dedicated application/domain services or policies.
5. Simple CRUD operations should not be over-engineered unnecessarily.
6. Historical records should be preserved.
7. Sensitive corrections must be explicit and auditable.
8. Critical multi-step operations should be transactional.
9. Repeated operations should be idempotent where appropriate.
10. Configuration values should not be scattered as magic numbers.
11. Error messages should describe business failures clearly.
12. Business rules should be testable independently of the UI.

---

# 36. Priority of Business Concerns

When business requirements conflict, implementation priorities are:

1. Correctness
2. Security
3. Data integrity
4. Historical integrity
5. Maintainability
6. Usability
7. Performance
8. Scalability

The system should prefer a correct and auditable workflow over a shortcut that produces ambiguous or inconsistent data.

---

# 37. Final Principle

EduTech is an operational educational management system, not merely a collection of CRUD screens.

The implementation must preserve the distinction between:

- Current state and historical state
- Account and Teacher
- Student and Enrollment
- Book and AcademicTerm
- Schedule and ClassSession
- Syllabus and LessonPlan
- Student Attendance and Teacher Attendance
- Promotion and Enrollment
- Class Teacher and Session/Substitute Teacher
- Ticket and AuditLog
- Notification and Ticket
- Private Class and Substitution

These distinctions are fundamental to the correctness of the system.

The implementation should therefore be driven by domain behavior first and UI/database convenience second.

**Principle: Model the real educational workflow accurately, then build the software around it.**
