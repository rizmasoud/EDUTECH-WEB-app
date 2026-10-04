# EduTech Database Specification

## 1. Purpose

This document defines the database model and persistence rules for EduTech.

The database is responsible for storing the authoritative transactional state of the application while preserving important historical information.

The primary database technology is PostgreSQL.

This document defines:

- Core entities
- Entity relationships
- Fields
- Enumerations
- Constraints
- Referential integrity
- Indexing principles
- Historical data rules
- Transactional requirements
- Deletion behavior
- Data integrity rules

The database specification supports the Product Specification and Architecture Specification.

---

# 2. Database Principles

The EduTech database must follow these principles:

1. PostgreSQL is the primary transactional database.
2. Database constraints must protect important invariants.
3. Foreign-key relationships must be explicit.
4. Historical data must be preserved.
5. Hard deletion must be used cautiously.
6. Critical workflows must use transactions.
7. Business rules must not rely exclusively on frontend validation.
8. Application-level validation and database constraints should complement each other.
9. Database schema names should use `snake_case`.
10. TypeScript/application properties may use `camelCase`.
11. Primary keys should use UUIDs.
12. Indexes should be created for common lookup and relationship paths.
13. Database structure must support auditability.
14. Current state must not silently overwrite historical state.
15. Schema changes must be managed through versioned migrations.

---

# 3. Naming Conventions

## 3.1 Database Tables

Table names use plural `snake_case`.

Examples:

```text
accounts
teachers
students
academic_terms
class_sessions
attendance_records
lesson_plans
exam_results
```

## 3.2 Database Columns

Column names use `snake_case`.

Examples:

```text
created_at
updated_at
teacher_id
academic_term_id
session_date
base_rate
```

## 3.3 Application Properties

TypeScript/application code may use `camelCase`.

Example:

```text
teacherId
academicTermId
createdAt
baseRate
```

The ORM mapping layer is responsible for translating between the two conventions.

---

# 4. Primary Keys

Entities should use UUID primary keys.

Conceptually:

```text
id UUID PRIMARY KEY
```

UUIDs are preferred because:

- They avoid exposing sequential database identifiers.
- They work well across distributed import and application workflows.
- They reduce coupling between internal identifiers and business identifiers.

UUIDs are internal identifiers.

External identifiers such as Shahvar codes must not automatically become primary keys.

---

# 5. Timestamp Convention

Entities that represent mutable application data should generally contain:

```text
created_at
updated_at
```

Historical event records may only require:

```text
created_at
```

where an update timestamp has no meaningful business purpose.

All timestamps should use a timezone-aware PostgreSQL type such as `timestamptz`.

Dates that represent calendar dates rather than moments in time should use PostgreSQL `date`.

Times representing local schedule times should use PostgreSQL `time` where appropriate.

---

# 6. Accounts

Table:

```text
accounts
```

Purpose:

Represents an authenticated application user.

Fields:

```text
id
personnel_code
password_hash
is_active
created_at
updated_at
```

Constraints:

- `id` is the primary key.
- `personnel_code` is unique.
- `password_hash` is never exposed through normal API responses.
- Inactive accounts cannot authenticate.
- Passwords must never be stored in plaintext.

`personnel_code` is an application authentication identifier.

---

# 7. Roles

Table:

```text
roles
```

Fields:

```text
id
name
```

Constraints:

- `name` is unique.

MVP role values:

```text
SUPERVISOR
TEACHER
```

No Secretary role exists in the current MVP.

---

# 8. Account Roles

Table:

```text
account_roles
```

Purpose:

Many-to-many relationship between Accounts and Roles.

Fields:

```text
account_id
role_id
```

Primary key:

```text
(account_id, role_id)
```

Foreign keys:

```text
account_id → accounts.id
role_id → roles.id
```

An Account may have multiple roles.

An Account may simultaneously have:

```text
SUPERVISOR
TEACHER
```

---

# 9. Teachers

Table:

```text
teachers
```

Fields:

```text
id
account_id
first_name
last_name
base_rate
is_active
created_at
updated_at
```

Constraints:

- `id` is the primary key.
- `account_id` is nullable.
- `account_id` is unique when present.
- `account_id` references `accounts.id`.
- A Teacher may have zero or one associated Account.
- An Account may be associated with at most one Teacher.

Important distinction:

```text
Account ≠ Teacher
```

An Account represents authentication/authorization.

A Teacher represents a teaching person.

---

# 10. Students

Table:

```text
students
```

Fields:

```text
id
first_name
last_name
shahvar_code
is_active
created_at
updated_at
```

Constraints:

- `id` is the primary key.
- `shahvar_code` is nullable.
- `shahvar_code` must not be assumed to be unique unless the real Shahvar data guarantees uniqueness.
- Student identity is represented by `id`, not by name.
- Student identity is not replaced by a Shahvar code.

The database should not contain unnecessary fields such as:

- Phone number
- Age
- Date of birth
- Financial debt
- Financial discount

unless a future explicit requirement adds them.

---

# 11. Institutes

If EduTech is configured to manage multiple independent institutes using the same application, an `institutes` entity should be introduced.

Conceptual table:

```text
institutes
```

Possible fields:

```text
id
name
is_active
created_at
updated_at
```

Institute-scoped entities should then reference the appropriate `institute_id`.

Potential institute-scoped entities include:

- Students
- Teachers
- Academic Terms
- Classes
- Shahvar Imports
- Payroll
- Scheduling data

The exact introduction point of this entity remains an implementation decision.

The system must not incorrectly model two independent institutes as branches of one institute.

---

# 12. Books

Table:

```text
books
```

Fields:

```text
id
name
level
sequence_order
session_count
is_terminal
is_active
created_at
updated_at
```

Purpose:

Represents an educational Book/course level.

Rules:

- `sequence_order` determines educational progression.
- `session_count` represents the expected number of sessions, not the actual number completed.
- `is_terminal` indicates that the Book has no next Book.
- `is_active` represents whether the Book is currently available.
- Historical references to Books must remain valid.

The `level` field is a scalar value for MVP and is not a separate entity.

---

# 13. Book Parts

Table:

```text
book_parts
```

Fields:

```text
id
book_id
name
sequence_order
created_at
updated_at
```

Relationships:

```text
Book 1 → many BookParts
```

Constraints:

- `book_id` references `books.id`.
- `sequence_order` determines the order within the Book.

---

# 14. Book Segments

Table:

```text
book_segments
```

Fields:

```text
id
book_part_id
name
sequence_order
created_at
updated_at
```

Relationships:

```text
BookPart 1 → many BookSegments
```

The application must be able to determine the complete hierarchy:

```text
Book
 └── BookPart
      └── BookSegment
```

When a Class references a Book Segment, the backend must verify that the Segment actually belongs to the Class's Book.

---

# 15. Academic Terms

Table:

```text
academic_terms
```

Fields:

```text
id
name
start_date
end_date
status
created_at
updated_at
```

Statuses:

```text
PLANNED
ACTIVE
CLOSED
```

Constraints:

```text
start_date < end_date
```

Academic Terms are independent from Books.

A Book may be used across multiple Academic Terms.

---

# 16. Classes

Table:

```text
classes
```

Fields:

```text
id
academic_term_id
book_id
book_segment_id
teacher_id
class_type
status
capacity
created_at
updated_at
```

Relationships:

```text
AcademicTerm → Classes
Book → Classes
BookSegment → Classes
Teacher → Classes
```

`book_segment_id` is nullable.

`teacher_id` is nullable while a Class is in Draft state.

Class types:

```text
REGULAR
PRIVATE
```

Class statuses:

```text
DRAFT
ACTIVE
COMPLETED
CANCELLED
```

Rules:

- A Class must belong to an Academic Term.
- A Class must reference a Book.
- If a Book Segment is specified, it must belong to the selected Book.
- Capacity must follow the centralized Class Capacity policy.
- An Active Class must satisfy required domain constraints.
- A Class with historical Sessions must not be destructively deleted.

---

# 17. Class Capacity

Capacity is stored at the Class level.

Current policy:

```text
Target: approximately 12
Minimum: currently expected to be 8 or 10 depending on context
Maximum: 15
```

The exact minimum remains an implementation-time business decision.

Database constraints should enforce the finalized numeric range where appropriate.

The frontend must not be the only layer validating capacity.

---

# 18. Enrollments

Table:

```text
enrollments
```

Fields:

```text
id
class_id
student_id
status
joined_at
left_at
created_at
updated_at
```

Statuses:

```text
ACTIVE
COMPLETED
WITHDRAWN
```

Relationships:

```text
Class → many Enrollments
Student → many Enrollments
```

Constraints:

```text
UNIQUE(class_id, student_id)
```

Rules:

- A Student cannot have duplicate enrollment records for the same Class.
- Enrollment history must be preserved.
- A withdrawn or completed enrollment should not be silently replaced by a new record.
- Attendance must reference an appropriate enrollment state.

---

# 19. Teacher Skills

Table:

```text
teacher_skills
```

Fields:

```text
id
teacher_id
book_id
created_at
```

Constraint:

```text
UNIQUE(teacher_id, book_id)
```

Purpose:

Represents that a Teacher is qualified to teach a Book.

The current MVP models Teacher Skill at Book level.

A future implementation may consider Segment-level skill if required by real operational rules.

---

# 20. Schedules

Table:

```text
schedules
```

Fields:

```text
id
class_id
day_of_week
start_time
end_time
starts_on
ends_on
created_at
updated_at
```

Purpose:

Represents a recurring or planned Class schedule.

Rules:

- `start_time < end_time`
- Friday must not be accepted as a normal scheduling day.
- Teacher overlap constraints must be enforced at the application/domain level.
- Class overlap/contradiction must be detected.
- Student conflicts should be detected.
- Schedule changes must not rewrite historical Class Sessions.

`starts_on` and `ends_on` are nullable.

---

# 21. Class Sessions

Table:

```text
class_sessions
```

Fields:

```text
id
class_id
schedule_id
session_date
start_time
end_time
status
created_at
updated_at
```

Statuses:

```text
SCHEDULED
COMPLETED
CANCELLED
```

Relationships:

```text
Class → many ClassSessions
Schedule → optional source of ClassSession
```

A Class Session represents a real occurrence of a Class.

It must preserve its own date and time.

The schema must not assume that a Class can only have one Session per day.

Therefore, a uniqueness constraint such as:

```text
UNIQUE(class_id, session_date)
```

must not be added unless the domain is explicitly finalized to allow only one session per day.

---

# 22. Student Attendance Records

Table:

```text
attendance_records
```

Fields:

```text
id
class_session_id
student_id
status
recorded_by
recorded_at
updated_at
```

Statuses:

```text
PRESENT
ABSENT
LATE
EXCUSED
```

Relationships:

```text
ClassSession → many AttendanceRecords
Student → many AttendanceRecords
Account → recorder
```

Constraint:

```text
UNIQUE(class_session_id, student_id)
```

Rules:

- The Student must be appropriately enrolled in the Class.
- The Class Session must not be cancelled.
- The recording Account must be authorized.
- Teachers cannot directly delete Attendance records.
- Corrections use the Ticket workflow.
- Supervisor corrections must be audited.

---

# 23. Teacher Attendance Records

Table:

```text
teacher_attendance_records
```

Fields:

```text
id
class_session_id
teacher_id
status
recorded_by
recorded_at
updated_at
```

Statuses:

```text
PRESENT
ABSENT
EXCUSED
```

`LATE` may be introduced if the finalized payroll policy requires it.

Teacher Attendance is intentionally separate from Student Attendance.

Payroll should use Teacher Attendance and actual Session responsibility rather than inferring teacher work from student attendance.

---

# 24. Syllabi

Table:

```text
syllabi
```

Fields:

```text
id
book_id
book_segment_id
created_at
updated_at
```

Rules:

- `book_id` references `books.id`.
- `book_segment_id` is nullable.
- If present, the Book Segment must belong to the specified Book.

A Syllabus represents canonical educational requirements.

---

# 25. Syllabus Items

Table:

```text
syllabus_items
```

Fields:

```text
id
syllabus_id
type
title
description
required
sequence_order
created_at
updated_at
```

Possible item types include:

```text
FILM
WORKBOOK
CONVERSATION
GRAMMAR
VOCABULARY
OTHER
```

The exact enum may evolve as real requirements become clearer.

`required` indicates whether the item is mandatory.

`sequence_order` represents the suggested order.

---

# 26. Lesson Plans

Table:

```text
lesson_plans
```

Fields:

```text
id
class_id
teacher_id
status
submitted_at
approved_at
created_at
updated_at
```

Statuses:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
```

Relationships:

```text
Class → LessonPlans
Teacher → LessonPlans
```

A Lesson Plan belongs to a Class rather than necessarily belonging to a single Class Session.

---

# 27. Lesson Plan Items

Table:

```text
lesson_plan_items
```

Fields:

```text
id
lesson_plan_id
syllabus_item_id
title
description
completed
completed_at
created_at
updated_at
```

`syllabus_item_id` is nullable.

The nullable relationship allows a Lesson Plan item to represent a teacher-specific activity that does not map directly to a canonical Syllabus Item.

Historical Lesson Plans must not silently change meaning when the current Syllabus changes.

---

# 28. Exams

Table:

```text
exams
```

Fields:

```text
id
class_id
exam_date
type
created_at
updated_at
```

Exam types:

```text
FINAL
MIDTERM
OTHER
```

An Exam belongs to a Class.

---

# 29. Exam Results

Table:

```text
exam_results
```

Fields:

```text
id
exam_id
student_id
score
created_at
updated_at
```

Constraints:

```text
UNIQUE(exam_id, student_id)
```

Score constraint:

```text
0 <= score <= 100
```

The Student must be appropriately enrolled in the Class associated with the Exam.

Changing a score after promotion processing has occurred is a sensitive operation.

---

# 30. Promotions

Table:

```text
promotions
```

Fields:

```text
id
student_id
from_book_id
to_book_id
exam_result_id
status
decision
decided_by
decided_at
created_at
updated_at
```

`to_book_id` is nullable because a terminal Book may result in Terminal Completion without a next Book.

Statuses:

```text
AUTOMATIC
PENDING_DECISION
PROMOTED
NOT_PROMOTED
TERMINAL_COMPLETION
```

Possible decisions include:

```text
PROMOTE
DO_NOT_PROMOTE
REPEAT
REMEDIAL
```

`decided_by` is nullable for automatic promotion.

Rules:

- A Promotion must reference the Exam Result that caused it.
- Promotion processing must be idempotent.
- Supervisor decisions must be auditable.
- Terminal completion must be represented as a valid state.
- Promotion history must not be destroyed.

The exact database uniqueness strategy for Promotion must guarantee that the same Exam Result is not processed into conflicting Promotion records.

---

# 31. Substitution Requests

Table:

```text
substitution_requests
```

Fields:

```text
id
class_session_id
requested_by
status
approved_teacher_id
approved_by
approved_at
created_at
updated_at
```

Statuses may include:

```text
REQUESTED
BROADCASTED
RESPONDED
APPROVED
REJECTED
CANCELLED
COMPLETED
```

An explicit emergency state or mode may be added for the fallback workflow where a substitute teaches before formal approval.

A substitution request belongs to a specific Class Session.

It does not replace the Class's normal Teacher.

---

# 32. Substitution Responses

Table:

```text
substitution_responses
```

Fields:

```text
id
request_id
teacher_id
response
responded_at
```

Possible responses:

```text
ACCEPT
DECLINE
```

Constraint:

```text
UNIQUE(request_id, teacher_id)
```

A Teacher's response is not equivalent to Supervisor approval.

---

# 33. Payrolls

Table:

```text
payrolls
```

Fields:

```text
id
teacher_id
academic_term_id
status
total_amount
finalized_at
created_at
updated_at
```

Statuses:

```text
DRAFT
CALCULATED
REVIEWED
FINALIZED
```

Rules:

- Payroll belongs to one Teacher and one Academic Term.
- There should be at most one active/conflicting Payroll for a Teacher and Term according to the finalized lifecycle rules.
- `total_amount` must be derived from Payroll Items.
- Finalized payroll must not be normally modified.

A future `finalized_by` field may be added if explicit finalizer identity is required.

---

# 34. Payroll Items

Table:

```text
payroll_items
```

Fields:

```text
id
payroll_id
type
quantity
rate
amount
reference_id
description
created_at
```

Possible types:

```text
SESSION
SYLLABUS_COMPLETION
PRIVATE_CLASS
SUBSTITUTION
ADJUSTMENT
```

For standard calculation items:

```text
amount = quantity × rate
```

Adjustments require an explicit reason and must be auditable.

`reference_id` may point to the relevant business record, such as:

- Class Session
- Lesson Plan item
- Private Class
- Substitution
- Other source record

If polymorphic references are used, application-level integrity must be handled carefully because PostgreSQL foreign keys cannot directly enforce arbitrary polymorphic references.

---

# 35. Tickets

Table:

```text
tickets
```

Fields:

```text
id
created_by
assigned_to
type
status
title
description
created_at
updated_at
resolved_at
```

Ticket types:

```text
ATTENDANCE_CORRECTION
CLASS_CORRECTION
LESSON_PLAN_ISSUE
SUBSTITUTION_ISSUE
PAYROLL_ISSUE
STUDENT_DATA_CORRECTION
TEACHER_DATA_CORRECTION
SYSTEM_ISSUE
OTHER
```

Statuses:

```text
OPEN
IN_PROGRESS
RESOLVED
REJECTED
CANCELLED
```

`assigned_to` is nullable.

`resolved_at` is nullable.

Tickets must preserve their historical lifecycle.

---

# 36. Ticket Messages

Table:

```text
ticket_messages
```

Fields:

```text
id
ticket_id
author_id
body
created_at
```

Relationships:

```text
Ticket → many TicketMessages
Account → many TicketMessages
```

Ticket Messages are communication records associated with a Ticket.

They do not replace Audit Logs.

---

# 37. Attachments

Table:

```text
attachments
```

Fields:

```text
id
ticket_id
file_name
mime_type
size
storage_key
created_at
```

Attachments are stored externally.

The database stores metadata and a secure storage reference.

Initial supported categories include:

- Image
- PDF
- Document

Initial maximum expected file size:

```text
5 MB per file
```

The actual maximum should be configurable.

Storage access must be authorization-controlled.

---

# 38. Import Jobs

Table:

```text
import_jobs
```

Fields:

```text
id
type
status
file_name
created_by
started_at
completed_at
created_at
```

Import statuses:

```text
PENDING
PROCESSING
COMPLETED
COMPLETED_WITH_ERRORS
FAILED
CANCELLED
```

The `type` field should identify the import workflow, such as Shahvar import.

---

# 39. Import Results

Table:

```text
import_results
```

Fields:

```text
id
import_job_id
row_number
status
message
created_at
```

Result statuses:

```text
SUCCESS
WARNING
ERROR
SKIPPED
```

Import Results provide row-level feedback and historical import diagnostics.

---

# 40. Notifications

Table:

```text
notifications
```

Fields:

```text
id
recipient_account_id
type
title
message
reference_entity_type
reference_entity_id
is_read
created_at
read_at
```

Possible notification types include:

```text
TICKET_CREATED
TICKET_UPDATED
SUBSTITUTION_REQUEST
SUBSTITUTION_APPROVAL
LESSON_PLAN_REVIEW
LESSON_PLAN_RESULT
PROMOTION_DECISION_REQUIRED
PAYROLL_READY
PAYROLL_FINALIZED
IMPORT_COMPLETED
IMPORT_COMPLETED_WITH_ERRORS
SYSTEM_ALERT
```

Users must only be able to access their own notifications.

`read_at` is nullable.

Reference fields are nullable.

Notification history is separate from Audit Logs.

---

# 41. Audit Logs

Table:

```text
audit_logs
```

Fields:

```text
id
actor_account_id
action
entity_type
entity_id
metadata
created_at
```

`metadata` should use PostgreSQL `jsonb`.

Audit Logs should be append-oriented.

They should not normally be edited or deleted through normal application workflows.

Sensitive operations should create appropriate audit records.

---

# 42. Entity Relationship Overview

The main relationship structure is:

```text
Account
 ├── AccountRoles
 └── Teacher (optional)

Teacher
 ├── TeacherSkills
 ├── Classes
 ├── LessonPlans
 ├── TeacherAttendanceRecords
 └── Payrolls

Student
 ├── Enrollments
 ├── AttendanceRecords
 ├── ExamResults
 └── Promotions

Book
 ├── BookParts
 │    └── BookSegments
 ├── Classes
 └── Syllabi

AcademicTerm
 ├── Classes
 └── Payrolls

Class
 ├── Enrollments
 ├── Schedules
 ├── ClassSessions
 ├── LessonPlans
 └── Exams

ClassSession
 ├── AttendanceRecords
 ├── TeacherAttendanceRecords
 └── SubstitutionRequests

Exam
 └── ExamResults
      └── Promotion

SubstitutionRequest
 └── SubstitutionResponses

Payroll
 └── PayrollItems

Ticket
 ├── TicketMessages
 └── Attachments

ImportJob
 └── ImportResults
```

---

# 43. Core Relationship Rules

The following relationships are especially important.

## Student → Class

A Student belongs to a Class through Enrollment.

Do not place a simple `student_id` directly on Class.

---

## Class → Book

A Class belongs to exactly one Book.

A Class may optionally reference a Book Segment.

The Book Segment must belong to the selected Book.

---

## Class → Teacher

A Class may have one current Teacher.

The Class's current Teacher must not be used to rewrite historical Session responsibility.

---

## Class → Schedule

A Class may have one or more Schedule records depending on scheduling requirements.

Schedules represent planned/recurring timing.

---

## Class → Session

A Class may have many Class Sessions.

Sessions represent actual occurrences.

---

## Session → Attendance

Student Attendance belongs to a specific Class Session.

Teacher Attendance also belongs to a specific Class Session.

---

## Exam → Promotion

A Promotion is created from an Exam Result.

Promotion processing must be traceable back to that result.

---

## Session → Substitution

A substitution applies to a specific Class Session.

It does not replace the permanent Class Teacher.

---

# 44. Foreign-Key Integrity

Foreign keys should be used for relationships where appropriate.

Examples:

```text
classes.academic_term_id
    → academic_terms.id

classes.book_id
    → books.id

classes.teacher_id
    → teachers.id

enrollments.student_id
    → students.id

enrollments.class_id
    → classes.id

class_sessions.class_id
    → classes.id

attendance_records.class_session_id
    → class_sessions.id
```

Foreign-key behavior must be selected intentionally.

Historical records should generally use restrictive behavior rather than destructive cascading deletes.

---

# 45. Deletion Strategy

The default rule for historical entities is:

> Preserve history instead of deleting it.

Examples include:

- Students
- Teachers
- Books
- Classes
- Sessions
- Attendance
- Exams
- Promotions
- Payroll
- Tickets
- Audit Logs

Use:

```text
is_active
```

or:

```text
status
```

when deactivation is more appropriate than deletion.

Hard deletion may be used only where it is demonstrably safe.

Cascading deletes must not accidentally destroy historical educational or financial records.

---

# 46. Unique Constraints

Important uniqueness constraints include:

```text
roles.name

accounts.personnel_code

account_roles(account_id, role_id)

teachers.account_id

teacher_skills(teacher_id, book_id)

enrollments(class_id, student_id)

attendance_records(class_session_id, student_id)

exam_results(exam_id, student_id)

substitution_responses(request_id, teacher_id)
```

Additional unique constraints may be introduced where required by finalized business rules.

---

# 47. Check Constraints

Database-level checks should protect simple numeric or structural invariants.

Examples:

```text
exam_results.score >= 0
exam_results.score <= 100
```

Schedule:

```text
start_time < end_time
```

Academic Term:

```text
start_date < end_date
```

Capacity:

```text
capacity > 0
```

The exact finalized capacity range should be reflected once the business rule is finalized.

---

# 48. Indexing Strategy

Indexes should exist for:

- Foreign-key lookup fields
- Common filtering fields
- Common search fields
- Date-based operational queries
- Status-based workflows
- Unique constraints

Likely indexed fields include:

```text
students.shahvar_code
classes.academic_term_id
classes.book_id
classes.teacher_id
classes.status
classes.class_type
enrollments.student_id
enrollments.class_id
schedules.class_id
class_sessions.class_id
class_sessions.session_date
attendance_records.class_session_id
attendance_records.student_id
exam_results.exam_id
exam_results.student_id
promotions.student_id
promotions.exam_result_id
substitution_requests.class_session_id
substitution_requests.status
payrolls.teacher_id
payrolls.academic_term_id
tickets.created_by
tickets.assigned_to
tickets.status
notifications.recipient_account_id
notifications.is_read
audit_logs.entity_type
audit_logs.entity_id
audit_logs.created_at
```

Indexes should be based on actual query patterns.

The project should avoid creating excessive indexes without justification.

---

# 49. Search Fields

The system may require search over:

- Student name
- Teacher name
- Personnel code
- Shahvar code
- Class identifiers
- Book names
- Ticket titles

Search implementation should be selected based on actual usage.

PostgreSQL capabilities should be preferred before introducing an external search system.

An external search engine is not required for the MVP.

---

# 50. Historical Integrity

Current state and historical state must remain conceptually separate.

Example:

If:

```text
Class.teacher_id
```

changes from Teacher A to Teacher B,

historical Class Sessions must still retain the actual teacher who performed those sessions.

Likewise:

- Attendance must retain its historical session context.
- Payroll must retain its historical basis.
- Promotions must retain the relevant Exam Result.
- Tickets must retain their messages and lifecycle.
- Audit Logs must retain historical changes.

---

# 51. Payroll Integrity

Payroll data must be explainable from its Payroll Items.

The database should not allow normal application workflows to create a mismatch between:

```text
sum(payroll_items.amount)
```

and:

```text
payroll.total_amount
```

The exact implementation may calculate the total in the application and persist it transactionally.

Finalized Payroll should be treated as immutable through ordinary workflows.

---

# 52. Promotion Integrity

Promotion processing must maintain a clear relationship:

```text
ExamResult
     ↓
Promotion
```

The same Exam Result must not accidentally produce multiple conflicting Promotion outcomes.

Automatic promotion must remain distinguishable from Supervisor-decided promotion.

Terminal completion must be representable without requiring `to_book_id`.

---

# 53. Attendance Integrity

Student Attendance:

```text
ClassSession
     ↓
AttendanceRecord
     ↓
Student
```

Teacher Attendance:

```text
ClassSession
     ↓
TeacherAttendanceRecord
     ↓
Teacher
```

These must remain separate.

Attendance should not be recorded for a cancelled Class Session.

Student Attendance should not exist for a Student who was not appropriately enrolled at the relevant time.

---

# 54. Import Integrity

Import operations must not partially modify core data without recording their state.

An Import Job should preserve:

- File identity
- Creator
- Status
- Start time
- Completion time
- Row-level results

The commit operation should be transaction-safe or batch-safe according to the selected import strategy.

Retries must not create duplicate Students, Classes, or Enrollments.

---

# 55. Audit Integrity

Audit Logs should reference the actor Account where applicable.

Audit metadata should use `jsonb`.

Audit records should not contain:

- Passwords
- Session secrets
- Authentication tokens
- Other unnecessary sensitive credentials

Audit records should contain enough information to understand significant changes without exposing secrets.

---

# 56. Notification Integrity

Notification creation should be idempotent for sensitive operational events where duplicate notifications would create confusion.

Notifications must not be treated as the source of truth for business state.

For example:

```text
Payroll
```

is the source of truth for payroll state.

A:

```text
PAYROLL_FINALIZED
```

notification only informs the Teacher about that state.

---

# 57. Referential Integrity and Historical Data

When a record has historical dependencies, deleting the parent should normally be rejected.

Examples:

A Teacher with historical Sessions should not be hard-deleted.

A Student with historical Attendance should not be hard-deleted.

A Class with Sessions should not be hard-deleted.

A Payroll with Items should not be hard-deleted through ordinary workflows.

The application should provide explicit deactivation or status mechanisms where necessary.

---

# 58. ORM Considerations

The selected PostgreSQL ORM must support:

- UUIDs
- PostgreSQL enums or equivalent
- Foreign keys
- Unique constraints
- Check constraints
- Transactions
- Migrations
- JSONB
- Indexes
- Relation loading
- Appropriate query composition

The ORM should not dictate business architecture.

The database schema and business requirements are the source of truth.

---

# 59. Migration Strategy

Schema changes must be introduced through migrations.

A migration should be:

- Version-controlled
- Reviewable
- Tested
- Reproducible

Production migrations must be executed in a controlled deployment process.

Destructive changes require explicit review because historical data is important.

---

# 60. Data Migration from the Previous Project

The new EduTech implementation does not require direct migration of the previous desktop application's database as part of the MVP.

The previous database may be used as a source of reference.

If historical data must eventually be transferred, that should be handled through a dedicated migration/import project.

The new schema must not be distorted merely to preserve the old SQLite schema.

The principle is:

> Model the new system correctly first; migrate old data separately if required.

---

# 61. Data Import vs Data Migration

These concepts are separate.

### Data Import

Operational workflow for bringing approved external data, such as Shahvar Excel data, into EduTech.

### Data Migration

Technical process for transferring historical data from a previous EduTech database or another system.

They should not share assumptions automatically.

---

# 62. Multi-Institute Data Isolation

If the `Institute` entity is introduced, institute-scoped records must be protected from cross-institute access.

The application must enforce institute scope at the backend.

Database design should make it possible to query and constrain records by institute where required.

The exact implementation may use direct `institute_id` fields or another explicit scoping mechanism, but the scope must be unambiguous.

---

# 63. Sensitive Data

The database must avoid storing unnecessary sensitive information.

In particular:

- Passwords are stored only as secure hashes.
- Authentication secrets must not be stored as ordinary application fields.
- Financial data should only be stored where explicitly required by the product.
- Shahvar data should be limited to required operational information.
- Audit metadata must not contain credentials or secrets.

Data minimization is a product requirement as well as a security principle.

---

# 64. Database as Source of Truth

PostgreSQL is the authoritative source for transactional application state.

Examples include:

- Current Class status
- Enrollment status
- Attendance
- Promotion state
- Payroll state
- Ticket state
- Import state

Caches, frontend state, notifications, and generated views must not be treated as authoritative sources.

---

# 65. Schema Evolution Principle

The schema should evolve deliberately.

When requirements change:

1. Identify the business change.
2. Update the domain specification.
3. Update this database specification.
4. Determine whether existing data is affected.
5. Design the migration.
6. Update tests.
7. Apply the migration through the controlled deployment process.

The database should not be changed ad hoc merely to satisfy an isolated frontend requirement.

---

# 66. Database Quality Checklist

Before considering the database design complete, verify:

- [ ] All core entities have explicit primary keys.
- [ ] Important relationships have foreign keys.
- [ ] Important uniqueness rules are represented.
- [ ] Important numeric constraints are represented.
- [ ] Historical records are protected.
- [ ] Hard deletion behavior is deliberate.
- [ ] Critical indexes exist.
- [ ] Transactions are defined for critical workflows.
- [ ] Promotion is idempotent.
- [ ] Payroll calculation is idempotent.
- [ ] Import commit is safe to retry.
- [ ] Attendance relationships are valid.
- [ ] Session history is preserved.
- [ ] Substitute responsibility is preserved.
- [ ] Audit records are append-oriented.
- [ ] Notification state is separate from business state.
- [ ] File metadata is separated from file storage.
- [ ] Multi-institute scope can be supported if required.
- [ ] Schema migrations are version-controlled.

---

# 67. Final Database Principle

The EduTech database should be designed around the actual educational workflows rather than around a collection of isolated CRUD entities.

The most important relationships are:

```text
Student
   ↓
Enrollment
   ↓
Class
   ↓
Class Session
   ↓
Attendance
```

and:

```text
Book
   ↓
Syllabus
   ↓
Lesson Plan
```

and:

```text
Exam Result
   ↓
Promotion
   ↓
Future Educational Progress
```

and:

```text
Teacher
   ↓
Teacher Attendance
   ↓
Payroll Items
   ↓
Payroll
```

and:

```text
Class Session
   ↓
Substitution
   ↓
Actual Teacher
   ↓
Attendance / Payroll
```

The database must preserve these relationships and their history.

The guiding principle is:

> **Store the truth of the educational workflow, preserve its history, and enforce its important invariants at the database and backend boundaries.**
