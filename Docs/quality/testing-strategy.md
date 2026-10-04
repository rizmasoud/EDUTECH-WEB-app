# EduTech — Testing Strategy & Quality Specification

## 1. Purpose

This document defines the testing and quality strategy for EduTech.

The goal is not to maximize test count.

The goal is to provide confidence that EduTech:

- preserves business rules
- protects user data
- enforces authorization
- maintains historical integrity
- handles critical workflows correctly
- remains stable as the codebase evolves

Testing effort should be concentrated where incorrect behavior can cause meaningful damage.

---

# 2. Quality Priorities

Testing priorities follow the project's overall priorities:

```text
Correctness
    >
Security
    >
Maintainability
    >
Usability
    >
Performance
    >
Scalability
```

A small number of high-value tests for critical business rules is more important than large numbers of shallow tests.

---

# 3. Testing Pyramid

EduTech should use multiple levels of testing.

```text
                 E2E
              /-------\
             /   API   \
            /-----------\
           / Integration \
          /---------------\
         /      Unit       \
        /-------------------\
```

### Unit Tests

Fast tests for isolated business logic.

### Integration Tests

Tests involving PostgreSQL and important infrastructure boundaries.

### API Tests

Tests HTTP endpoints, validation, authentication, authorization, and response behavior.

### End-to-End Tests

Tests complete user workflows through the application.

Each level has a different purpose.

---

# 4. Unit Testing

Unit tests should focus primarily on domain logic and deterministic application behavior.

High-priority areas include:

- Promotion
- Scheduling
- Payroll
- Capacity
- Teacher eligibility
- Enrollment rules
- Import matching
- State transitions

Examples:

```text
PromotionPolicy
SchedulingPolicy
PayrollPolicy
CapacityPolicy
TeacherEligibilityPolicy
ImportMatchingPolicy
```

Unit tests should remain fast and deterministic.

---

# 5. Promotion Tests

Promotion is a critical business workflow and must have explicit tests.

At minimum, tests should cover:

### Score >= 70

Expected:

```text
Automatic promotion
No Supervisor approval required
```

### Score 60–69

Expected:

```text
Pending Supervisor decision
```

### Score < 60

Expected:

```text
Pending Supervisor decision
```

### Terminal Book

A passing result for a terminal Book should produce:

```text
Terminal Completion
```

It must not fail because there is no next Book.

---

# 6. Promotion Idempotency

Processing the same ExamResult more than once must not create duplicate promotion records or duplicate educational transitions.

Tests should verify:

```text
First processing
    -> creates valid Promotion

Repeated processing
    -> does not duplicate the Promotion
```

---

# 7. Promotion Score Changes

Changing an ExamResult after promotion is a sensitive operation.

Tests should verify that:

- unauthorized users cannot change results
- authorized changes trigger appropriate re-evaluation
- historical changes are audited
- invalid states are prevented
- duplicate promotions are not created

The exact re-evaluation workflow should remain consistent with the Promotion domain policy.

---

# 8. Scheduling Tests

Scheduling is one of the most important areas for automated testing.

Tests should cover:

### Hard Constraints

Examples:

- Friday is closed
- Teacher overlap is rejected
- Class schedule conflicts are rejected
- Teacher skill is required
- Invalid time ranges are rejected
- Invalid capacity is rejected

### Soft Preferences

Examples:

- Thursday morning preference
- preferred slots
- distribution preferences

Soft preferences may affect the proposal but must never override hard constraints.

---

# 9. Scheduling Explainability Tests

A valid scheduling result should provide enough information to explain why it was selected.

Tests should verify that the scheduling engine can expose relevant criteria such as:

```text
Hard constraints satisfied
Teacher eligibility
Conflict status
Preference satisfaction
```

The exact scoring implementation may evolve.

The important requirement is that scheduling should not become an unexplained black box.

---

# 10. Scheduling Failure Tests

The system must behave predictably when no valid schedule exists.

It must not:

- generate an invalid schedule
- silently ignore hard constraints
- partially save an invalid proposal
- randomly assign conflicting times

Instead, the system should return useful conflict/reason information.

---

# 11. Capacity Tests

Capacity rules must be tested centrally.

The currently approved range includes:

```text
Target: 12
Minimum: 8 or 10 depending on finalized policy
Maximum: 15
```

The exact minimum remains an open business decision.

Tests should therefore be written so the policy is configurable rather than hard-coded across multiple features.

---

# 12. Enrollment Tests

Tests should verify:

- a student can be enrolled only when valid
- duplicate enrollment is prevented
- enrollment history is preserved
- withdrawn students remain historically visible
- completed enrollment is preserved
- student eligibility for a class is validated
- promotion requirements are respected

The system must not silently move a Student to a new Book merely because an enrollment request was submitted.

---

# 13. Teacher Skill Tests

Teacher eligibility should be tested independently.

Examples:

```text
Teacher has required Book skill
    -> eligible

Teacher does not have required Book skill
    -> not eligible
```

The current MVP uses Book-level TeacherSkill.

Segment-level skill remains an open future decision.

---

# 14. Class Lifecycle Tests

Class state transitions should be explicitly tested.

Example:

```text
DRAFT
  -> ACTIVE
  -> COMPLETED
```

and:

```text
DRAFT
  -> CANCELLED
```

Invalid transitions must be rejected.

For example, a cancelled Class should not silently return to an arbitrary operational state unless a specific transition is defined.

---

# 15. Class History Tests

Changing the current Teacher of a Class must not modify historical sessions.

Tests should verify:

```text
Current Class Teacher
        !=
Historical Session Teacher
```

when a change has occurred.

This distinction is essential for attendance, substitution, payroll, and audit history.

---

# 16. ClassSession Tests

Tests should verify:

- a session belongs to a valid Class
- cancelled sessions cannot receive normal attendance
- actual session time is preserved
- changing a future Schedule does not rewrite past sessions
- session-level substitution is supported
- multiple sessions per day remain possible if the final policy allows them

The system must not hard-code a `unique(class_id, session_date)` assumption unless the business decision is finalized.

---

# 17. Student Attendance Tests

Attendance tests should verify:

- only enrolled students can receive attendance
- each student has at most one attendance record per session
- valid statuses are accepted
- invalid statuses are rejected
- Teachers can only record attendance for authorized sessions
- Teachers cannot delete attendance directly
- cancelled sessions cannot receive normal attendance

Statuses:

```text
PRESENT
ABSENT
LATE
EXCUSED
```

---

# 18. Attendance Correction Tests

Attendance correction is a sensitive workflow.

Tests should verify:

```text
Teacher
   |
   v
Creates Correction Ticket
   |
   v
Supervisor Reviews
   |
   v
Attendance Changed
   |
   v
Audit Created
```

The system must not allow a Teacher to bypass this workflow.

Audit information should include enough information to reconstruct the change.

---

# 19. Teacher Attendance Tests

Teacher Attendance must remain separate from Student Attendance.

Tests should verify:

- correct Teacher is associated with the Session
- substitute Teacher can be represented when approved
- unauthorized Teachers cannot create arbitrary attendance
- payroll consumes the appropriate Teacher Attendance information

---

# 20. Lesson Plan Tests

Tests should cover:

```text
DRAFT
  -> SUBMITTED
  -> APPROVED
```

and:

```text
SUBMITTED
  -> REJECTED
```

Tests should verify:

- Teacher owns or is authorized for the Class
- Supervisor can review
- Teacher cannot modify an approved plan through normal workflow
- completion is explicit
- Substitute can view the relevant plan
- canonical Syllabus remains Supervisor-owned

---

# 21. Syllabus Tests

Tests should verify:

- Syllabus belongs to a valid Book or Book Segment
- Supervisor controls canonical Syllabus
- required items are represented correctly
- sequence order is preserved
- invalid references are rejected
- historical Lesson Plans are not silently rewritten by ordinary Syllabus changes

---

# 22. Substitution Tests

Substitution is a session-level workflow.

Tests should cover:

```text
REQUESTED
    ->
BROADCASTED
    ->
RESPONDED
    ->
APPROVED
```

as well as:

```text
REJECTED
CANCELLED
COMPLETED
```

Tests should verify:

- only eligible Teachers receive/accept requests
- responses are unique per Teacher/request
- Supervisor approval is required for the normal workflow
- eligibility is re-checked before approval
- time conflicts are rejected
- actual session Teacher is preserved
- history remains auditable

---

# 23. Emergency Substitution Tests

Emergency substitution is different from normal approval.

Tests should verify that the system can represent:

```text
Teacher teaches
      ->
Supervisor approval afterward
```

without incorrectly treating the workflow as a normal pre-approved substitution.

The exact final status model may be refined during implementation.

---

# 24. Payroll Tests

Payroll is one of the highest-risk business areas.

Tests should verify:

- Teacher-specific base rate is used
- correct Teacher is associated with each payable Session
- cancelled sessions follow the payroll policy
- absent Teacher sessions follow the payroll policy
- syllabus completion items follow the configured policy
- Private Class payments follow the Private Class policy
- substitution-related payments follow the finalized policy
- adjustments require explicit handling
- payroll totals equal the sum of Payroll Items

---

# 25. Payroll Calculation Idempotency

Running payroll calculation repeatedly must not create duplicate items.

Expected behavior:

```text
Calculate
   ->
Generate Items

Calculate again
   ->
Regenerate/reconcile according to policy
without duplicate accumulation
```

The final total must remain mathematically consistent.

---

# 26. Payroll Finalization Tests

Tests should verify:

- only authorized users can finalize payroll
- finalization creates an audit record
- finalized payroll cannot be normally edited
- finalized totals match payroll items
- future recalculation does not silently alter finalized payroll
- payroll status transitions are valid

---

# 27. Private Class Tests

Private Classes must remain independent from Substitution.

Tests should verify:

```text
ClassType = PRIVATE
```

uses the Private Class payment policy.

The currently defined business rule is:

```text
Price: 500
Teacher share: 350
```

The test should not assume that Private Class is a type of substitution.

---

# 28. Import Tests

The Shahvar import workflow should have extensive automated coverage.

Test stages:

```text
Upload
Parse
Validate
Match
Preview
Commit
```

Tests should cover:

- invalid files
- invalid columns
- invalid data types
- missing required fields
- duplicate students
- duplicate enrollments
- existing students
- new students
- ambiguous matches
- class creation
- invalid Book mapping
- invalid Academic Term mapping
- partial row errors
- retry behavior

---

# 29. Import Matching Tests

The system must not rely on name matching alone.

Tests should verify:

```text
Stable Shahvar identifier
    ->
Existing Student matched
```

and:

```text
No reliable identifier
+
Ambiguous name
    ->
Manual review
```

The system must not silently select one of multiple possible Students.

---

# 30. Import Idempotency Tests

Running the same import twice should not create duplicate records.

Tests should verify:

```text
Import #1
    -> creates/matches records

Import #2
    -> recognizes existing records
```

The exact matching behavior should follow the finalized import policy.

---

# 31. Import Transaction Tests

If a commit fails, the system must not leave a misleading partial state.

Tests should verify transactional behavior for critical commit operations.

For large imports, batch behavior must also be explicit.

The system must clearly distinguish:

- complete success
- completed with errors
- failed

---

# 32. Authentication Tests

Authentication tests should cover:

- valid login
- invalid password
- invalid personnel code
- inactive account
- logout
- session expiration
- password change
- password reset by authorized Supervisor
- rate limiting
- secure session behavior

Passwords must never appear in:

- API responses
- logs
- audit metadata
- error messages

---

# 33. Authorization Tests

Authorization testing is mandatory.

Every protected resource should have tests for:

```text
Authorized access
Unauthorized access
Wrong role
Wrong resource owner
Inactive account
```

For example:

```text
Teacher A
    -> Class A: allowed

Teacher A
    -> Class B belonging to Teacher B: forbidden
```

Changing an ID in a request must never bypass authorization.

---

# 34. Role Combination Tests

One Account may have multiple roles.

The system must therefore test:

```text
Supervisor only
Teacher only
Supervisor + Teacher
```

The combined-role account must receive exactly the permissions implied by its assigned roles.

The system must not assume that every Account maps to exactly one role.

---

# 35. Ticket Tests

Tests should cover:

- Teacher creates ticket
- Supervisor views ticket
- message creation
- attachment handling
- assignment
- resolution
- rejection
- cancellation
- permission restrictions
- related entity references

Teachers must not use Tickets as a hidden mechanism for arbitrary data modification.

---

# 36. Notification Tests

Notification creation should be tested for important operational events.

Examples:

```text
LessonPlanSubmitted
    -> Supervisor notification

PromotionDecisionRequired
    -> Supervisor notification

SubstitutionRequest
    -> eligible Teacher notification

PayrollFinalized
    -> Teacher notification
```

Tests should verify:

- correct recipient
- correct event
- no unauthorized visibility
- appropriate idempotency
- notification failure does not normally invalidate the core transaction

---

# 37. Audit Tests

Sensitive actions should create AuditLog records.

Tests should verify auditing for:

- login/security changes
- student changes
- teacher changes
- class changes
- attendance corrections
- promotion decisions
- substitution approval
- payroll finalization
- import commit
- ticket resolution

Audit logs should not be editable through normal application workflows.

---

# 38. Database Constraint Tests

Important database constraints should be tested.

Examples:

```text
Unique personnel code
Unique account-role pair
Unique enrollment
Unique exam result per exam/student
Unique substitution response per request/teacher
Valid foreign keys
Valid score range
```

Database constraints are part of the application's correctness guarantees.

---

# 39. API Testing

API tests should verify:

- HTTP method
- endpoint
- authentication
- authorization
- DTO validation
- response shape
- status codes
- error codes
- pagination
- filtering
- sorting
- mutation behavior

The API should be tested as an actual contract rather than only through internal service tests.

---

# 40. API Error Contract Tests

Important error codes should remain stable.

For example:

```text
CLASS_CAPACITY_EXCEEDED
TEACHER_SCHEDULE_CONFLICT
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
PROMOTION_DECISION_REQUIRED
PAYROLL_ALREADY_FINALIZED
```

Tests should verify that the API returns the expected HTTP status and machine-readable error code.

Human-readable messages may evolve without breaking client behavior.

---

# 41. End-to-End Testing

E2E tests should represent realistic user workflows.

Critical workflows:

### Authentication

```text
Login
-> Dashboard
-> Logout
```

### Academic Setup

```text
Create Term
-> Create Books
-> Configure Syllabus
```

### Class Cycle

```text
Create Student
-> Create Class
-> Enroll Student
-> Assign Teacher
-> Schedule
-> Create Session
-> Record Attendance
```

### Education

```text
Lesson Plan
-> Exam
-> Result
-> Promotion
```

### Substitution

```text
Request
-> Broadcast
-> Teacher Response
-> Supervisor Approval
-> Session
```

### Payroll

```text
Teacher Attendance
-> Calculate Payroll
-> Review
-> Finalize
```

### Import

```text
Upload
-> Preview
-> Review
-> Commit
-> Results
```

---

# 42. Regression Testing

Known historical failures should become regression tests.

The previous project contained a serious issue in which updating a proposal with a `classes` payload could reconstruct classes with empty:

```text
studentIds
schedules
```

when those fields were omitted.

The new implementation must not reproduce this behavior.

A regression test should ensure that partial updates do not unintentionally erase existing related data.

The new implementation should not copy the old architecture or implementation blindly.

---

# 43. Security Testing

Security tests should cover:

- authentication bypass
- object-level authorization
- role escalation
- inactive accounts
- session handling
- rate limiting
- unauthorized file access
- malicious input
- invalid IDs
- parameter manipulation
- CSRF behavior where applicable

Security tests should be included in CI for critical paths.

---

# 44. File Upload Testing

File handling must be tested for:

- file size limits
- MIME validation
- supported extensions
- invalid files
- unauthorized download
- attachment ownership
- storage failures
- duplicate filenames
- malicious filenames
- metadata consistency

The system must not trust client-provided file metadata blindly.

---

# 45. Performance Testing

Performance testing should focus on realistic workloads.

Important scenarios include:

- large student lists
- large class lists
- large attendance lists
- scheduling proposals
- payroll calculation
- large Shahvar imports
- large audit histories

Performance tests should identify real bottlenecks before optimization.

---

# 46. Concurrency Testing

Concurrency tests should target operations vulnerable to race conditions.

Examples:

```text
Two simultaneous enrollments
Two substitution approvals
Two payroll calculations
Two import commits
Two schedule modifications
```

Expected behavior should remain deterministic and valid.

Database constraints and transaction boundaries should be part of these tests.

---

# 47. Test Data

Test data should be realistic enough to expose domain problems.

Fixtures should include cases such as:

- duplicate names
- terminal Books
- multiple Teachers
- overlapping schedules
- ambiguous Shahvar matches
- inactive accounts
- conditional promotion scores
- failed students
- substituted Sessions
- Private Classes
- finalized payroll

Avoid relying only on trivial test data.

---

# 48. Test Isolation

Tests should avoid depending on the execution order of other tests.

Each test should establish its required state.

Integration tests should use isolated database state.

E2E tests should use controlled environments and deterministic seed data.

---

# 49. CI Quality Gates

The CI pipeline should include:

```text
Install
   ->
Lint
   ->
Typecheck
   ->
Unit Tests
   ->
Integration Tests
   ->
API Tests
   ->
Build
```

Critical E2E tests may run in the same pipeline or in a dedicated CI stage depending on execution time.

A production deployment should not proceed when mandatory quality gates fail.

---

# 50. Test Naming

Tests should describe behavior rather than implementation details.

Prefer:

```text
should automatically promote a student with score 70
```

over:

```text
should call promotionService.process()
```

Behavior-focused tests remain useful even when internal architecture changes.

---

# 51. What Not to Test Excessively

Avoid writing large numbers of tests for implementation details that have little business value.

Examples:

- trivial getters
- framework behavior
- simple DTO property assignments
- static styling details
- implementation-specific private methods

Testing effort should follow risk.

---

# 52. Frontend Testing

Frontend tests should focus on:

- component behavior
- form validation
- loading/error states
- permission-aware rendering
- important interaction flows
- API error handling
- accessibility-critical interactions

Do not duplicate the entire backend business-rule test suite in the frontend.

The backend remains the authority.

---

# 53. Accessibility Testing

Important UI components should be checked for:

- keyboard navigation
- focus behavior
- labels
- accessible names
- dialog behavior
- semantic structure
- status communication

Critical workflows should include accessibility checks where practical.

---

# 54. Visual Testing

Visual regression testing may be introduced for important reusable components and high-value screens.

Potential targets:

- AppShell
- Tables
- Calendar
- Attendance Grid
- Lesson Plan
- Promotion Panel
- Payroll Breakdown
- Import Wizard

Visual tests should be introduced when the UI becomes stable enough for them to provide value.

They are not required for every early development change.

---

# 55. Test Environment

Development and testing should remain separate from production.

The testing environment should provide:

- isolated PostgreSQL database
- controlled environment variables
- deterministic seed data
- safe file storage
- test accounts

Production data must never be used casually as a test database.

---

# 56. Testability Requirements

The architecture should make important logic easy to test.

Critical policies should be callable without:

- browser
- HTTP server
- actual file upload
- real notification provider
- production database

Where appropriate, dependencies should be replaceable with test implementations.

---

# 57. Definition of Done

A feature should not be considered complete merely because its UI exists.

A feature is complete when appropriate levels of:

- implementation
- validation
- authorization
- persistence
- error handling
- testing
- auditability

have been addressed.

For critical workflows, tests are part of the feature rather than optional documentation.

---

# 58. Minimum Testing Expectations for MVP

At minimum, MVP should have strong automated coverage for:

```text
Authentication
Authorization
Students
Teachers
Classes
Enrollment
Scheduling
Class Sessions
Student Attendance
Teacher Attendance
Syllabus
Lesson Plans
Exams
Promotion
Substitution
Tickets
Notifications
Payroll
Private Classes
Shahvar Import
Audit
```

The deepest coverage should remain concentrated on:

```text
Scheduling
Promotion
Payroll
Import
Authorization
Data Integrity
```

---

# 59. Quality Checklist

Before release, verify:

### Correctness

- Critical business rules are tested.
- Invalid states are rejected.
- Transactions are correct.
- Historical data is preserved.

### Security

- Authentication is tested.
- Authorization is tested.
- Object-level access is tested.
- File access is protected.

### Reliability

- Critical workflows are idempotent where required.
- Concurrency risks are addressed.
- Import failures are recoverable.
- Finalized data is protected.

### API

- DTO validation works.
- Error contracts are stable.
- Protected endpoints enforce authorization.

### UI

- Critical workflows are usable.
- Loading/error/empty states exist.
- Role-specific UI behaves correctly.

### Operations

- Logging works.
- Health checks work.
- CI gates pass.
- Backup/recovery procedures are defined before production.

---

# 60. Final Testing Principle

Testing in EduTech is not primarily about achieving a percentage.

It is about protecting the rules and workflows that make the system trustworthy.

The most important question is:

> If this code changes tomorrow, what prevents it from silently breaking a critical educational or payroll workflow?

The testing strategy should provide that protection.

**Test the business rules deeply.
Test the boundaries explicitly.
Test the critical workflows end-to-end.
Do not confuse test quantity with software quality.**
