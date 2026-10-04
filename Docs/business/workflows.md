# EduTech — Business Workflows

## 1. Purpose

This document defines the main operational workflows of EduTech.

While the Business Rules document defines individual rules and constraints, this document describes how those rules work together in real user-facing and system-facing workflows.

Each workflow defines:

- Trigger
- Actor
- Preconditions
- Main steps
- Validation
- State changes
- Notifications
- Audit requirements
- Expected outcome
- Failure conditions

The workflows are designed around the real educational lifecycle rather than individual database entities.

---

# 2. System Lifecycle Overview

The core EduTech lifecycle is:

```text
Authentication
    ↓
Academic Term Setup
    ↓
Books / Syllabus Setup
    ↓
Teacher & Student Data
    ↓
Shahvar Import
    ↓
Class Creation & Enrollment
    ↓
Scheduling
    ↓
Class Sessions
    ↓
Attendance + Lesson Plans
    ↓
Exams
    ↓
Promotion
    ↓
Next Educational Cycle
    ↓
Payroll
```

Supporting workflows operate throughout the lifecycle:

```text
Tickets
Substitution
Notifications
Audit
Data Corrections
```

Private Classes operate alongside the regular class lifecycle.

---

# 3. Authentication Workflow

## 3.1 Purpose

Allow an active EduTech Account to securely access the system.

---

## 3.2 Actor

Any authorized Account.

---

## 3.3 Preconditions

- Account exists.
- Account is active.
- Personnel Code is valid.
- Password is valid.

---

## 3.4 Workflow

```text
Enter Personnel Code
        ↓
Enter Password
        ↓
Backend validates credentials
        ↓
Check Account status
        ↓
Create authenticated session
        ↓
Load roles and permissions
        ↓
Open appropriate dashboard
```

---

## 3.5 Success

The user receives an authenticated session.

The system determines the available capabilities based on the Account's roles.

If the Account has both Supervisor and Teacher roles, the application must support both role contexts according to the authorization model.

---

## 3.6 Failure

Invalid credentials must not reveal whether the Personnel Code or password was specifically incorrect.

Inactive Accounts must not be allowed to authenticate.

Authentication failures should be logged as security events.

---

# 4. Academic Term Setup Workflow

## 4.1 Actor

Supervisor.

---

## 4.2 Purpose

Create and activate an academic period.

---

## 4.3 Workflow

```text
Supervisor creates Term
        ↓
Enter name and dates
        ↓
Validate start < end
        ↓
Term created as PLANNED
        ↓
Supervisor reviews configuration
        ↓
Term becomes ACTIVE
```

---

## 4.4 Rules

A Term must have:

- Name
- Start date
- End date
- Valid status

The start date must precede the end date.

A closed Term represents historical data.

---

## 4.5 Audit

Creation, activation, closure, and sensitive changes must be auditable.

---

# 5. Book and Syllabus Setup Workflow

## 5.1 Actor

Supervisor.

---

## 5.2 Purpose

Define the educational structure before Classes operate.

---

## 5.3 Workflow

```text
Create / Configure Book
        ↓
Define Book Parts
        ↓
Define Book Segments
        ↓
Set Book ordering
        ↓
Mark terminal status if applicable
        ↓
Create Syllabus
        ↓
Add Syllabus Items
        ↓
Mark required items
        ↓
Define sequence
        ↓
Publish/use Syllabus
```

---

## 5.4 Rules

The Supervisor owns canonical Syllabus information.

Teachers must not modify the canonical Syllabus.

A BookSegment must belong to its Book.

The system must preserve historical educational records if a Book or Syllabus changes later.

---

# 6. Teacher Setup Workflow

## 6.1 Actor

Supervisor.

---

## 6.2 Workflow

```text
Create Teacher
      ↓
Enter basic information
      ↓
Set base rate
      ↓
Activate Teacher
      ↓
Assign Teacher Skills
      ↓
Optionally connect Account
```

---

## 6.3 Account Connection

A Teacher does not automatically require an Account.

If the Teacher needs to access the system:

```text
Teacher
   ↓
Account created/linked
   ↓
Personnel Code + Password
   ↓
TEACHER role
```

The Account and Teacher remain separate domain entities.

---

## 6.4 Rules

An inactive Teacher should not be eligible for new Class or Substitution assignments.

Historical records must remain intact.

---

# 7. Student Creation Workflow

## 7.1 Actor

Supervisor or authorized operational workflow.

---

## 7.2 Workflow

```text
Create Student
      ↓
Enter first name
      ↓
Enter last name
      ↓
Optional Shahvar code
      ↓
Validate identity information
      ↓
Create Student
```

---

## 7.3 Rules

The EduTech Student ID is the system identity.

Full name must not be used as a unique identity key.

Shahvar code is an external reference.

---

# 8. Shahvar Import Workflow

## 8.1 Purpose

Import student/class data from Shahvar Excel files without destroying or duplicating existing EduTech data.

---

## 8.2 Actor

Supervisor.

---

## 8.3 Workflow

```text
Upload Excel
      ↓
Create ImportJob
      ↓
Parse file
      ↓
Validate structure
      ↓
Validate rows
      ↓
Match Students
      ↓
Match / Create Classes
      ↓
Determine Enrollments
      ↓
Generate Preview
      ↓
Supervisor reviews
      ↓
Commit
      ↓
Generate Import Results
      ↓
Complete ImportJob
```

---

## 8.4 Parse Phase

The system reads only the required columns.

Unnecessary Shahvar fields such as:

- Age
- Phone
- Discount
- Debt
- Other irrelevant financial information

must not be imported into the EduTech domain.

---

## 8.5 Validation Phase

The system validates:

- Required columns
- Data types
- Student identity information
- Shahvar identifiers where present
- Class information
- Book mapping
- Academic Term
- Other required fields

Invalid rows receive an error result.

Suspicious but potentially recoverable rows may receive warnings.

---

## 8.6 Matching Phase

The system attempts to match Students using stable Shahvar identity where available.

If a reliable match cannot be made:

```text
No reliable match
      ↓
Manual review required
```

The system must not automatically merge students based only on name similarity.

---

## 8.7 Class Handling

The Supervisor explicitly selects or confirms:

- Academic Term
- Book
- Class mapping

The system may create a Class when appropriate.

---

## 8.8 Preview

Before committing:

The Supervisor sees:

- Students to create
- Students to update
- Classes to create
- Enrollments to create
- Warnings
- Errors
- Ambiguous matches

The Supervisor can cancel without modifying production data.

---

## 8.9 Commit

After confirmation:

```text
Commit
  ↓
Create/update allowed Student records
  ↓
Create Classes if required
  ↓
Create Enrollments
  ↓
Write Import Results
  ↓
Write Audit
```

The operation must be transaction-safe or batch-safe.

---

## 8.10 Idempotency

Repeating the same import must not create duplicate Students or Enrollments when reliable matching information exists.

---

# 9. Class Creation Workflow

## 9.1 Actor

Supervisor.

---

## 9.2 Workflow

```text
Create Class
      ↓
Select Academic Term
      ↓
Select Book
      ↓
Optionally select Book Segment
      ↓
Select Class Type
      ↓
Set capacity
      ↓
Optionally assign Teacher
      ↓
Add Enrollments
      ↓
Configure Schedule
      ↓
Validate
      ↓
Activate Class
```

---

## 9.3 Draft State

A Class may remain `DRAFT` while incomplete.

For example:

```text
Class created
Teacher not assigned
Schedule not configured
Students not enrolled
```

This is valid for a Draft.

---

## 9.4 Activation

Before activation, the backend validates the required configuration.

The Class must satisfy:

- Valid Term
- Valid Book
- Valid Segment if provided
- Valid Class Type
- Valid Teacher where required
- Teacher eligibility
- Capacity
- Enrollment
- Schedule
- Scheduling constraints

---

# 10. Enrollment Workflow

## 10.1 Actor

Supervisor or authorized workflow.

---

## 10.2 Workflow

```text
Select Student
      ↓
Select Class
      ↓
Validate Student eligibility
      ↓
Validate Class capacity
      ↓
Validate educational compatibility
      ↓
Create Enrollment
```

---

## 10.3 Validation

The backend checks:

- Student exists
- Class exists
- Class is eligible for enrollment
- Student is not already enrolled in the same Class
- Capacity is not exceeded
- Educational progression is valid
- Other hard constraints

---

## 10.4 Withdrawal

A student leaving a Class should normally transition the Enrollment to:

`WITHDRAWN`

The Enrollment record should remain for historical purposes.

---

# 11. Teacher Assignment Workflow

## 11.1 Actor

Supervisor.

---

## 11.2 Workflow

```text
Select Class
      ↓
Select Teacher
      ↓
Check Teacher active
      ↓
Check TeacherSkill
      ↓
Check schedule conflicts
      ↓
Assign Teacher
      ↓
Audit change
```

---

## 11.3 Historical Rule

Changing the current Class Teacher must not rewrite the actual Teacher recorded on past ClassSessions.

Past operational history remains unchanged.

---

# 12. Scheduling Workflow

## 12.1 Purpose

Create valid recurring schedules while allowing the Supervisor to review and control the final result.

---

## 12.2 Actor

Supervisor.

---

## 12.3 Proposal Workflow

```text
Supervisor starts scheduling
        ↓
Select Classes
        ↓
Scheduling Engine evaluates constraints
        ↓
Generate proposed schedules
        ↓
Calculate conflicts/preferences
        ↓
Generate explanations
        ↓
Create Proposal
        ↓
PENDING_REVIEW
        ↓
Supervisor reviews
        ↓
Accept / Modify / Reject
```

---

## 12.4 Scheduling Engine

The Scheduling Engine evaluates:

### Hard Constraints

- Friday unavailable
- Teacher conflicts
- Class conflicts
- TeacherSkill
- Capacity
- Valid time ranges
- Other configured hard rules

### Soft Preferences

- Thursday morning
- Preferred Teacher slots
- Better distribution
- Other configured preferences

---

## 12.5 No Valid Schedule

If no valid schedule exists:

The system must not generate a random or partially invalid schedule.

Instead it should provide understandable reasons, such as:

```text
Teacher A:
No available slot without conflict.

Class B:
All valid slots conflict with another Class.

Teacher C:
Required Book skill is missing.
```

---

## 12.6 Supervisor Modification

If the Supervisor modifies the proposal manually:

The backend must revalidate the final schedule.

The UI must not be able to save an invalid schedule simply because it originated from a valid proposal.

---

# 13. Schedule Activation Workflow

After a Proposal is accepted or a valid manual Schedule is created:

```text
Validated Schedule
      ↓
Persist Schedule
      ↓
Generate/prepare ClassSessions
      ↓
Class operates according to Schedule
```

Historical Sessions must remain unchanged if the future Schedule is modified later.

---

# 14. ClassSession Workflow

## 14.1 Purpose

Represent the actual occurrence of a Class.

---

## 14.2 Workflow

```text
Recurring Schedule
      ↓
Generate Session
      ↓
SCHEDULED
      ↓
Session occurs
      ↓
Attendance / Lesson Plan activity
      ↓
COMPLETED
```

A Session may also become:

`CANCELLED`

---

## 14.3 Session Data

The Session retains:

- Class
- Schedule reference when applicable
- Actual date
- Start time
- End time
- Status

This allows actual execution to remain distinct from the recurring plan.

---

# 15. Student Attendance Workflow

## 15.1 Actor

Assigned Teacher or authorized Substitute.

---

## 15.2 Workflow

```text
Open Session
      ↓
View enrolled Students
      ↓
Record attendance
      ↓
Validate Student enrollment
      ↓
Save Attendance
      ↓
Session continues
```

---

## 15.3 Attendance Recording

Each enrolled Student receives an appropriate status:

- Present
- Absent
- Late
- Excused

Attendance must be unique per Student per Session.

---

## 15.4 Attendance Correction

```text
Teacher notices mistake
      ↓
Create Ticket
      ↓
Supervisor reviews
      ↓
Supervisor approves/rejects
      ↓
If approved:
Update Attendance
      ↓
Create AuditLog
```

Teachers cannot bypass this workflow by directly deleting or rewriting Attendance.

---

# 16. Teacher Attendance Workflow

Teacher attendance is handled separately.

```text
Session occurs
      ↓
Actual Teacher identified
      ↓
Teacher Attendance recorded
      ↓
Payroll later consumes record
```

The system must distinguish:

- Student attendance
- Teacher attendance

A student's absence must not automatically mean that the Teacher was absent.

---

# 17. Lesson Plan Workflow

## 17.1 Actor

Teacher.

---

## 17.2 Workflow

```text
Teacher opens Class
      ↓
Views canonical Syllabus
      ↓
Creates Lesson Plan
      ↓
Adds relevant Lesson Plan Items
      ↓
Saves Draft
      ↓
Submits
      ↓
Supervisor reviews
      ↓
Approve / Reject
```

---

## 17.3 Rejection

If rejected:

```text
REJECTED
   ↓
Teacher revises
   ↓
SUBMITTED
```

The exact editing restrictions after rejection should be enforced by backend state rules.

---

## 17.4 Completion

Teacher marks appropriate Lesson Plan items as completed.

Completion information may later be consumed by Payroll according to Payroll Policy.

---

# 18. Substitute Lesson Plan Workflow

When a substitute is approved:

```text
Approved Substitute
      ↓
Open Session
      ↓
View relevant Lesson Plan
      ↓
Teach Session
      ↓
Record permitted operational data
```

The substitute receives read access to the relevant Lesson Plan.

The substitute does not gain ownership of the canonical Syllabus.

---

# 19. Substitution Workflow

## 19.1 Normal Workflow

```text
Session requires substitute
        ↓
Create SubstitutionRequest
        ↓
Find eligible Teachers
        ↓
Broadcast request
        ↓
Teachers respond
        ↓
Supervisor reviews responses
        ↓
Select Teacher
        ↓
Revalidate eligibility
        ↓
Approve
        ↓
Session assigned to substitute
```

---

## 19.2 Teacher Response

A Teacher may:

- Accept
- Decline

Accepting does not automatically assign the Session.

---

## 19.3 Final Approval

The Supervisor makes the final approval.

The backend rechecks:

- Teacher active status
- TeacherSkill
- Time conflict
- Other hard constraints

If validation fails, approval must be rejected or another candidate selected.

---

# 20. Emergency Substitution Workflow

When an emergency occurs:

```text
Emergency substitution required
        ↓
Substitute teaches
        ↓
System records emergency state
        ↓
Supervisor reviews
        ↓
Approve / Reject
```

The system must preserve the fact that the Session occurred before formal approval.

This workflow must be auditable.

---

# 21. Exam Workflow

## 21.1 Actor

Supervisor or authorized academic workflow.

---

## 21.2 Workflow

```text
Create Exam
      ↓
Associate with Class
      ↓
Enter Student Results
      ↓
Validate score 0–100
      ↓
Save ExamResults
      ↓
Run Promotion Policy
```

---

## 21.3 Result Validation

The Student must be enrolled in the Class.

Invalid scores are rejected.

Duplicate results for the same Exam and Student are not allowed.

---

# 22. Automatic Promotion Workflow

For score >=70:

```text
ExamResult saved
      ↓
Promotion Policy
      ↓
Score >=70
      ↓
Find next Book
      ↓
If next Book exists:
    Promote
If terminal:
    Terminal Completion
      ↓
Save Promotion
      ↓
Audit
      ↓
Optional Notification
```

No Supervisor approval step is required.

---

# 23. Conditional Promotion Workflow

For score 60–69:

```text
ExamResult saved
      ↓
Promotion Policy
      ↓
PENDING_DECISION
      ↓
Notify Supervisor
      ↓
Supervisor reviews
      ↓
Promote / Do Not Promote / Repeat / Remedial
      ↓
Persist Decision
      ↓
Audit
```

The system must not automatically promote the Student before the Supervisor decision.

---

# 24. Failed Result Workflow

For score <60:

```text
ExamResult saved
      ↓
PENDING_DECISION
      ↓
Supervisor notified
      ↓
Supervisor reviews
      ↓
Select outcome
      ↓
Persist Promotion decision
      ↓
Audit
```

The exact academic outcome may depend on the available configured decisions.

---

# 25. Terminal Completion Workflow

When a passing result belongs to a terminal Book:

```text
Passing ExamResult
      ↓
Book.isTerminal = true
      ↓
Create Promotion
      ↓
Status = TERMINAL_COMPLETION
      ↓
toBookId = null
      ↓
Audit
```

The system must not throw an error because there is no next Book.

---

# 26. Promotion and Next Enrollment Workflow

Promotion and enrollment remain separate.

After a student is promoted:

```text
Promotion completed
      ↓
Student becomes eligible for next Book
      ↓
Supervisor may enroll Student
      ↓
New Enrollment created
```

The system should not silently create a new Class Enrollment unless the specific workflow explicitly requires it.

---

# 27. Ticket Workflow

## 27.1 Creation

```text
User identifies issue
      ↓
Create Ticket
      ↓
Select Type
      ↓
Enter Description
      ↓
Optional Attachments
      ↓
OPEN
```

---

## 27.2 Assignment

A Supervisor may assign the Ticket to an appropriate Account.

```text
OPEN
 ↓
IN_PROGRESS
```

---

## 27.3 Resolution

```text
Issue investigated
      ↓
Action taken
      ↓
Ticket RESOLVED
      ↓
Audit if sensitive data changed
```

---

## 27.4 Rejection

If the request is invalid:

```text
OPEN / IN_PROGRESS
      ↓
REJECTED
```

The reason should be clear to the requester.

---

# 28. Attendance Correction Ticket Workflow

This is a specialized Ticket workflow.

```text
Teacher identifies incorrect Attendance
        ↓
Create ATTENDANCE_CORRECTION Ticket
        ↓
Reference Session/Student/Attendance
        ↓
Explain correction
        ↓
Supervisor reviews
        ↓
Approve or Reject
```

If approved:

```text
Update Attendance
      ↓
Record before/after information
      ↓
Create AuditLog
      ↓
Resolve Ticket
      ↓
Notify Teacher
```

If rejected:

```text
Keep Attendance unchanged
      ↓
Record reason
      ↓
Reject/Resolve Ticket
      ↓
Notify Teacher
```

---

# 29. Payroll Calculation Workflow

## 29.1 Actor

Supervisor.

---

## 29.2 Workflow

```text
Select Teacher
      ↓
Select Academic Term
      ↓
Load eligible Sessions
      ↓
Load Teacher Attendance
      ↓
Load eligible Lesson Plan/Syllabus completions
      ↓
Load Private Class records
      ↓
Load Substitute work
      ↓
Apply Payroll Policy
      ↓
Generate PayrollItems
      ↓
Calculate Total
      ↓
CALCULATED
```

---

## 29.3 Breakdown

The Supervisor must be able to inspect the resulting PayrollItems.

Example:

```text
Teaching Sessions
  12 × Base Rate

Syllabus Completion
  8 × Completion Rate

Private Classes
  3 × Private Class Teacher Share

Substitution
  2 × Substitute Rate

Adjustment
  +/− configured amount
```

The exact rates remain policy-driven.

---

# 30. Payroll Review Workflow

```text
CALCULATED
    ↓
Supervisor reviews breakdown
    ↓
Issues corrected if necessary
    ↓
REVIEWED
```

The Supervisor should correct underlying records or create explicit Payroll Adjustments rather than directly changing the total.

---

# 31. Payroll Finalization Workflow

```text
REVIEWED
    ↓
Supervisor finalizes
    ↓
Validate all items
    ↓
Validate total
    ↓
Lock Payroll
    ↓
FINALIZED
    ↓
Audit
    ↓
Notify Teacher
```

After finalization, normal editing is blocked.

---

# 32. Payroll Issue Workflow

If a Teacher believes payroll is incorrect:

```text
Teacher opens Payroll
      ↓
Views breakdown
      ↓
Creates PAYROLL_ISSUE Ticket
      ↓
References Payroll/PayrollItem
      ↓
Supervisor investigates
```

The Supervisor may:

- Correct an underlying record
- Recalculate Payroll if not finalized
- Create an explicit Adjustment where appropriate
- Use an audited correction process for finalized payroll

---

# 33. Private Class Workflow

Private Classes follow their own operational path.

```text
Create PRIVATE Class
      ↓
Assign Teacher
      ↓
Add Student(s) as appropriate
      ↓
Configure Schedule/Session
      ↓
Conduct Session
      ↓
Record Teacher Attendance
      ↓
Payroll processes Private Class compensation
```

Current business rule:

```text
Private Class price = 500
Teacher share = 350
```

This workflow is independent from Substitution.

---

# 34. Notification Workflow

Notifications are generated from important operational events.

Example:

```text
Promotion requires decision
        ↓
Promotion event committed
        ↓
Create Notification
        ↓
Supervisor sees unread notification
        ↓
Supervisor opens notification
        ↓
Navigate to Promotion
        ↓
Mark notification as read
```

Notifications should reference the relevant entity when useful.

Failure to create a non-critical notification should not normally roll back the primary business operation.

---

# 35. Audit Workflow

Audit is generally generated as a consequence of sensitive operations.

Example:

```text
Supervisor approves Attendance correction
        ↓
Attendance changed
        ↓
AuditLog created
```

Audit records must capture:

- Actor
- Action
- Entity
- Entity ID
- Timestamp
- Relevant metadata

Audit records are not ordinary user-editable data.

---

# 36. Class Lifecycle

The expected Class lifecycle is:

```text
DRAFT
  │
  ├──────────────→ CANCELLED
  │
  ↓
ACTIVE
  │
  ↓
COMPLETED
```

A Class should not be deleted simply because it is no longer operational.

---

# 37. Lesson Plan Lifecycle

```text
DRAFT
  ↓
SUBMITTED
  ├────────→ REJECTED
  │             │
  │             ↓
  │           DRAFT
  │
  ↓
APPROVED
```

Exact transition permissions must be enforced by the backend.

---

# 38. Substitution Lifecycle

Normal flow:

```text
REQUESTED
    ↓
BROADCASTED
    ↓
RESPONDED
    ↓
APPROVED
    ↓
COMPLETED
```

Alternative outcomes include:

```text
REQUESTED → CANCELLED
REQUESTED → REJECTED
BROADCASTED → CANCELLED
```

Emergency substitution may use a dedicated state such as:

`EMERGENCY_PENDING_APPROVAL`

---

# 39. Import Lifecycle

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED
```

Possible alternative outcomes:

```text
PROCESSING → COMPLETED_WITH_ERRORS
PROCESSING → FAILED
PENDING → CANCELLED
```

An ImportJob must retain its results and status.

---

# 40. Ticket Lifecycle

```text
OPEN
  ↓
IN_PROGRESS
  ├────────→ REJECTED
  │
  ↓
RESOLVED
```

Appropriate Tickets may also be:

```text
OPEN → CANCELLED
```

---

# 41. Payroll Lifecycle

```text
DRAFT
  ↓
CALCULATED
  ↓
REVIEWED
  ↓
FINALIZED
```

A finalized Payroll must not return to normal editable states.

---

# 42. Cross-Workflow Integrity

The following relationships must remain consistent.

## 42.1 Student Progression

```text
ExamResult
    ↓
Promotion
    ↓
Eligible next Book
    ↓
Enrollment
```

Promotion must not be silently bypassed.

---

## 42.2 Class Execution

```text
Class
    ↓
Schedule
    ↓
ClassSession
    ↓
Attendance
    ↓
Payroll
```

Each layer represents a different concept.

---

## 42.3 Educational Content

```text
Book
    ↓
Syllabus
    ↓
LessonPlan
    ↓
Completion
    ↓
Potential Payroll contribution
```

Syllabus and LessonPlan must not be treated as the same entity.

---

## 42.4 Teacher Assignment

```text
Class Teacher
      ↓
ClassSession
      ↓
Actual Session Teacher
      ↓
Teacher Attendance
      ↓
Payroll
```

A substitute must not overwrite the historical Class Teacher.

---

# 43. Error and Recovery Principles

A workflow must fail safely.

Examples:

### Import Failure

Do not leave half-created educational records.

### Promotion Failure

Do not create an incomplete Promotion state.

### Payroll Failure

Do not finalize partially calculated payroll.

### Substitution Approval Failure

Do not assign a Teacher who fails final eligibility checks.

### Attendance Correction Failure

Do not partially modify Attendance without corresponding audit information.

---

# 44. Concurrency-Sensitive Workflows

The following workflows require particular attention to concurrent requests:

- Enrollment
- Capacity validation
- Teacher assignment
- Scheduling
- Substitution approval
- Promotion processing
- Payroll calculation/finalization
- Import commit

Transactions, unique constraints, locking, or other appropriate mechanisms must be used where necessary.

---

# 45. Workflow Design Principles

All workflows should follow these principles:

1. Validate before changing state.
2. Keep business rules in the backend/domain layer.
3. Preserve historical information.
4. Make sensitive operations auditable.
5. Use transactions for critical multi-step operations.
6. Make repeated operations idempotent where appropriate.
7. Do not hide exceptional workflows inside normal states.
8. Do not use UI restrictions as authorization.
9. Keep related domain concepts separate.
10. Prefer explicit state transitions over implicit behavior.
11. Make important calculations explainable.
12. Avoid destructive operations when historical information exists.

---

# 46. End-to-End Example

A typical regular Class lifecycle may look like:

```text
Supervisor creates Academic Term
        ↓
Books and Syllabus configured
        ↓
Teachers configured
        ↓
Students imported from Shahvar
        ↓
Classes created
        ↓
Students enrolled
        ↓
Teachers assigned
        ↓
Scheduling Proposal generated
        ↓
Supervisor reviews
        ↓
Schedule accepted
        ↓
ClassSessions generated
        ↓
Teacher teaches Session
        ↓
Student Attendance recorded
        ↓
Teacher Attendance recorded
        ↓
Lesson Plan submitted
        ↓
Lesson Plan reviewed
        ↓
Exam conducted
        ↓
Exam Results entered
        ↓
Promotion Policy executed
        ↓
Automatic promotion OR Supervisor decision
        ↓
Student becomes eligible for next educational stage
        ↓
Payroll calculated
        ↓
Supervisor reviews
        ↓
Payroll finalized
```

Supporting workflows may occur at any point:

```text
Substitution
Tickets
Attendance Corrections
Notifications
Audit
```

---

# 47. Final Workflow Principle

EduTech should model the actual lifecycle of educational operations rather than treating every feature as an isolated CRUD operation.

The main system flow is:

```text
Prepare
  ↓
Organize
  ↓
Schedule
  ↓
Teach
  ↓
Record
  ↓
Evaluate
  ↓
Progress
  ↓
Compensate
```

Every major workflow should preserve:

- Correctness
- Authorization
- Historical integrity
- Auditability
- Explainability
- Transactional consistency

**Principle: Every important action should have a clear actor, a valid starting state, explicit validation, a controlled state transition, and an understandable outcome.**
