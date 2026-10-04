# EduTech — Backend Architecture

## 1. Purpose

This document defines the backend architecture of EduTech.

The backend is the authoritative application layer responsible for:

- Authentication and authorization
- Business rules and domain policies
- Data integrity
- Workflow orchestration
- Persistence
- Scheduling
- Promotion processing
- Payroll calculation
- Shahvar import processing
- File and attachment management
- Notifications
- Audit logging
- API delivery

The backend must protect the system from invalid state regardless of how the request is made.

Frontend validation is useful for user experience, but it is never a substitute for backend validation.

The backend is therefore the final authority for:

- permissions
- ownership
- business rules
- state transitions
- data integrity
- transactional workflows

---

# 2. Technology

The backend uses:

- NestJS
- TypeScript
- PostgreSQL
- REST API
- External file storage
- Secure cookie-based authentication
- OpenAPI / Swagger

The application is implemented as a **Modular Monolith**.

Microservices are not required for the MVP.

The architecture should remain modular enough that individual components can be extracted later if there is a real operational reason to do so.

The project should not introduce distributed-system complexity before it is necessary.

---

# 3. Backend Responsibilities

The backend owns all application behavior that must remain consistent regardless of the client.

The backend is responsible for:

### Authentication

- Login
- Logout
- Session management
- Password management
- Account activation/deactivation
- Authentication-related security events

### Authorization

- Role checks
- Resource ownership
- Teacher scope restrictions
- Supervisor permissions
- Object-level authorization
- File access authorization

### Academic Management

- Academic Terms
- Books
- Book Parts
- Book Segments
- Syllabi
- Students
- Teachers
- Teacher Skills

### Class Management

- Classes
- Enrollments
- Class Types
- Class Status
- Teacher assignment
- Capacity validation

### Scheduling

- Schedule validation
- Scheduling proposals
- Conflict detection
- Teacher eligibility
- Scheduling rules
- Proposal review
- Final schedule persistence

### Session and Attendance Management

- Class Sessions
- Student Attendance
- Teacher Attendance
- Attendance correction workflows

### Education Workflows

- Exams
- Exam Results
- Promotion processing
- Lesson Plans
- Syllabus completion

### Substitution

- Substitution Requests
- Teacher eligibility
- Teacher responses
- Supervisor approval
- Emergency substitution workflow

### Payroll

- Payroll calculation
- Payroll items
- Teacher-specific rates
- Private class payments
- Substitution-related payroll rules
- Payroll finalization

### Import

- Shahvar Excel import
- Parsing
- Validation
- Matching
- Preview
- Commit
- Import results
- Idempotency

### Operational Features

- Tickets
- Notifications
- Attachments
- Audit logs

---

# 4. Architectural Style

EduTech uses a modular backend architecture with clear separation between:

1. HTTP/API
2. Application
3. Domain
4. Infrastructure
5. Persistence

The exact depth of separation may differ between modules.

The architecture is intentionally pragmatic.

Not every CRUD operation requires a large collection of abstractions.

However, business-critical domains must not become tightly coupled to HTTP controllers or database implementation details.

---

# 5. High-Level Structure

Conceptually:

```text
Client
   |
   v
NestJS Controllers
   |
   v
Application Services / Use Cases
   |
   +----------------------+
   |                      |
   v                      v
Domain Policies       Repositories
   |                      |
   |                      v
   |                  PostgreSQL
   |
   +----> External Services
             |
             +---- File Storage
             +---- Notifications
```

The exact implementation may differ where appropriate, but these responsibilities must remain clearly separated.

---

# 6. Module Architecture

The backend should be organized primarily around business capabilities rather than technical file categories.

A conceptual module structure is:

```text
src/
  modules/
    auth/
    accounts/
    teachers/
    students/
    books/
    terms/
    classes/
    enrollments/
    scheduling/
    sessions/
    attendance/
    syllabus/
    lesson-plans/
    exams/
    promotions/
    substitutions/
    payroll/
    imports/
    tickets/
    notifications/
    attachments/
    audit/
```

Some closely related modules may be combined when doing so improves maintainability.

The structure is a guide rather than an inflexible rule.

---

# 7. Module Boundaries

Each module should have a clear responsibility.

For example:

### Auth

Responsible for:

- login
- logout
- sessions
- password operations
- authentication state

It should not contain payroll or scheduling business logic.

### Students

Responsible for:

- student data
- student lifecycle
- Shahvar reference data
- student-related queries

It should not directly implement promotion policy.

### Classes

Responsible for:

- class lifecycle
- class configuration
- teacher assignment
- class type
- capacity
- enrollment coordination

It should not become the owner of every workflow involving a class.

### Scheduling

Responsible for:

- scheduling policies
- conflict detection
- schedule generation
- proposals
- proposal review workflow

The scheduling engine should remain independent of HTTP and UI concerns.

### Promotions

Responsible for:

- promotion policy
- score thresholds
- promotion decisions
- terminal completion
- promotion history

### Payroll

Responsible for:

- payroll policies
- payroll calculation
- payroll items
- recalculation
- finalization

Payroll should not rely on UI calculations.

---

# 8. Controllers

Controllers are responsible for HTTP concerns.

A controller should:

- receive the request
- validate DTO structure
- authenticate the request
- invoke the appropriate application operation
- return the API response

Controllers should not contain substantial business logic.

For example, a promotion controller should not determine whether a score of 72 means automatic promotion.

That rule belongs to the Promotion domain/application policy.

---

# 9. DTOs

API DTOs are separate from:

- database models
- domain entities
- persistence models

DTOs define the external API contract.

Example:

```text
CreateStudentDto
UpdateStudentDto
StudentResponseDto
```

rather than exposing the database representation directly.

DTO validation should cover:

- required fields
- data types
- string constraints
- numeric ranges
- enum values
- basic structural validity

Domain validation remains necessary for business rules.

---

# 10. Application Layer

The Application layer orchestrates use cases.

Typical operations include:

```text
CreateClass
EnrollStudent
CreateSchedulingProposal
ReviewSchedulingProposal
CreateClassSession
RecordAttendance
SubmitLessonPlan
ProcessExamResult
DecidePromotion
CreateSubstitutionRequest
ApproveSubstitution
CalculatePayroll
FinalizePayroll
PreviewImport
CommitImport
CreateTicket
ResolveTicket
```

Application services coordinate:

- repositories
- domain policies
- transactions
- authorization checks
- external services
- audit operations
- notifications

Application services should not become generic "god services".

Each operation should have a clear responsibility.

---

# 11. Domain Layer

The Domain layer contains business rules that should remain independent from HTTP and infrastructure.

Examples:

- Promotion Policy
- Scheduling Policy
- Capacity Policy
- Teacher Eligibility Policy
- Payroll Policy
- Enrollment rules
- Class lifecycle rules
- Lesson Plan completion rules

Domain logic should not depend directly on:

- NestJS controllers
- HTTP request objects
- browser APIs
- PostgreSQL-specific queries
- file storage providers

This makes critical business rules easier to test.

---

# 12. Domain Policies

Business rules should be represented explicitly where they are sufficiently complex.

Examples:

```text
PromotionPolicy
SchedulingPolicy
CapacityPolicy
TeacherEligibilityPolicy
PayrollPolicy
ImportMatchingPolicy
```

Policies should answer domain questions.

For example:

```text
CanTeacherTeachBook?
CanStudentEnrollInClass?
ShouldStudentBeAutomaticallyPromoted?
IsScheduleValid?
IsClassCapacityValid?
IsSubstituteEligible?
IsPayrollItemEligible?
```

The frontend must not duplicate these decisions as the authoritative implementation.

---

# 13. Repositories

Repositories provide persistence access to application/domain logic.

Conceptually:

```text
StudentRepository
TeacherRepository
ClassRepository
EnrollmentRepository
ScheduleRepository
PromotionRepository
PayrollRepository
...
```

Repositories should expose operations meaningful to the application rather than leaking arbitrary database operations everywhere.

For simple CRUD modules, repository abstractions may remain lightweight.

For complex modules, repositories should protect domain/application code from persistence-specific details.

---

# 14. PostgreSQL

PostgreSQL is the primary persistent database.

The backend is the only application layer that directly communicates with PostgreSQL.

The frontend must never connect directly to PostgreSQL.

Database integrity is enforced through:

- foreign keys
- unique constraints
- check constraints
- indexes
- transactions
- appropriate locking
- controlled state transitions

Application validation and database constraints complement each other.

Neither should be treated as sufficient alone.

---

# 15. Transactions

Transactions are required for workflows where partial completion could create invalid state.

Examples include:

### Promotion

Processing a promotion may involve:

- validating the result
- determining the promotion state
- creating/updating the Promotion record
- updating related educational state
- recording audit information
- creating a notification

These operations should be coordinated transactionally where required.

### Payroll

Payroll calculation must prevent:

- duplicate payroll items
- inconsistent totals
- partially finalized payroll

### Import

Import commit must prevent:

- half-created students
- duplicate enrollments
- incomplete class creation
- inconsistent import state

### Substitution

Approval must re-check eligibility transaction-safely to prevent race conditions.

---

# 16. Authorization

Authorization is enforced by the backend.

There are two major dimensions:

### Role Authorization

Determines whether an account may perform an operation.

Roles:

```text
SUPERVISOR
TEACHER
```

### Resource Authorization

Determines whether the account may access the specific resource.

For example, a Teacher may be allowed to view a Class only if the Teacher is responsible for that Class or Session according to the relevant workflow.

Changing an ID in a request must never allow access to another Teacher's resources.

This prevents IDOR-style authorization vulnerabilities.

---

# 17. Supervisor Authorization

Supervisor access is broad but still subject to domain rules.

A Supervisor may generally:

- manage academic configuration
- manage students
- manage teachers
- manage classes
- manage schedules
- review lesson plans
- manage attendance corrections
- approve substitutions
- manage promotions requiring decisions
- calculate and finalize payroll
- manage tickets
- perform imports
- view audit information

Supervisor privileges do not allow bypassing core data-integrity rules.

---

# 18. Teacher Authorization

Teacher access is restricted to relevant resources.

A Teacher may:

- view their assigned classes
- view relevant sessions
- record attendance for authorized sessions
- create and submit lesson plans
- respond to substitution requests
- perform approved substitution workflows
- create and manage their tickets
- view relevant payroll information
- view relevant notifications

Teacher access must be enforced server-side.

UI hiding is not considered authorization.

---

# 19. Authentication

Authentication uses:

```text
Personnel Code + Password
```

Passwords are stored only as secure password hashes.

Passwords must never be:

- stored in plaintext
- returned in API responses
- written to logs
- written to audit metadata

For the web application, secure HttpOnly cookies are preferred for authentication/session handling.

Production configuration should use:

- Secure cookies
- appropriate SameSite configuration
- HTTPS
- session expiration
- logout invalidation
- restricted CORS
- CSRF protection where applicable

Exact implementation details remain an implementation decision.

---

# 20. Error Handling

The backend should expose a consistent error contract.

Conceptually:

```json
{
  "error": {
    "code": "CLASS_CAPACITY_EXCEEDED",
    "message": "The class cannot accept another student."
  }
}
```

Errors should have:

- stable machine-readable codes
- safe human-readable messages
- appropriate HTTP status codes

Internal implementation details must not leak through API responses.

Examples of error categories:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
BUSINESS_RULE_VIOLATION
INTERNAL_ERROR
```

Domain-specific codes should be introduced when they provide meaningful client behavior.

---

# 21. State Transitions

Important entities must have controlled state transitions.

Examples:

```text
AcademicTerm:
PLANNED -> ACTIVE -> CLOSED
```

```text
Class:
DRAFT -> ACTIVE -> COMPLETED
DRAFT -> CANCELLED
ACTIVE -> CANCELLED
```

```text
LessonPlan:
DRAFT -> SUBMITTED -> APPROVED
                         |
                         -> REJECTED
```

```text
Payroll:
DRAFT -> CALCULATED -> REVIEWED -> FINALIZED
```

```text
SubstitutionRequest:
REQUESTED -> BROADCASTED -> RESPONDED -> APPROVED
                                      -> REJECTED
```

The backend controls valid transitions.

The frontend must not be able to force arbitrary state values.

---

# 22. Scheduling Architecture

Scheduling has unusually complex domain requirements.

It should therefore be isolated from ordinary CRUD logic.

Conceptually:

```text
Scheduling Application Service
        |
        v
Scheduling Engine
        |
        +--> Hard Constraints
        +--> Soft Preferences
        +--> Conflict Detection
        +--> Explainability
```

The Scheduling Engine should remain independent from:

- NestJS HTTP controllers
- React/Next.js
- database implementation

The application layer retrieves the necessary data, invokes the engine, and persists the proposal.

---

# 23. Scheduling Hard Constraints

Examples include:

- Friday is closed
- Teacher cannot have overlapping sessions
- Class cannot have contradictory schedules
- Teacher must be eligible for the Book
- Capacity must remain valid
- Schedule times must be valid
- Other explicitly configured hard constraints

A hard constraint violation means the proposed schedule is invalid.

The engine must not silently ignore such violations.

---

# 24. Scheduling Soft Preferences

Examples include:

- Thursday morning preference
- teacher preferred slots
- better distribution of classes
- preferred scheduling patterns

Soft preferences may influence the proposal score but must not override hard constraints.

Weights should be configurable where useful.

The system should explain why a proposal received its result rather than presenting an opaque score.

---

# 25. Scheduling Proposal

A Scheduling Proposal should contain enough information to explain the proposed result.

Conceptually:

```text
Proposal
  - classes
  - suggested schedules
  - constraints
  - conflicts
  - preferences
  - explanatory criteria
  - creator
  - timestamp
  - status
```

Statuses:

```text
DRAFT
PENDING_REVIEW
ACCEPTED
MODIFIED
REJECTED
```

A Supervisor may:

- Accept
- Modify
- Reject

The final schedule is persisted only through an appropriately validated workflow.

---

# 26. Session Architecture

A `ClassSession` represents an actual scheduled occurrence of a Class.

A recurring Schedule is not itself an actual session.

Conceptually:

```text
Class
  |
  +--> Schedule
  |
  +--> ClassSession
          |
          +--> Attendance
          +--> Teacher Attendance
          +--> Substitution
```

ClassSession stores the actual execution date and time.

Past sessions must not be rewritten merely because a future Schedule changes.

---

# 27. Attendance Architecture

Student Attendance belongs to a ClassSession.

The backend must verify:

- session exists
- session is not cancelled
- student is enrolled
- teacher/account has authority to record attendance
- attendance record does not violate uniqueness rules

Attendance statuses:

```text
PRESENT
ABSENT
LATE
EXCUSED
```

Teachers cannot directly delete attendance.

Corrections are handled through the Ticket workflow.

Supervisor corrections must be audited.

---

# 28. Teacher Attendance

Teacher attendance is a separate concept from Student Attendance.

It is used for payroll-related calculations.

Conceptually:

```text
TeacherAttendanceRecord
  - classSession
  - teacher
  - status
  - recordedBy
  - recordedAt
```

This separation is important because Student Attendance and Teacher Attendance have different meanings and policies.

Payroll must not simply count student attendance records.

---

# 29. Promotion Architecture

Promotion processing is handled by a dedicated Promotion workflow.

After a valid ExamResult:

```text
Score >= 70
    -> automatic promotion

60-69
    -> Supervisor decision required

< 60
    -> Supervisor decision required
```

For terminal Books:

```text
Passing Result
    -> TERMINAL_COMPLETION
```

The backend must not throw an error merely because a terminal Book has no next Book.

Promotion processing should be idempotent.

A repeated request must not create duplicate promotion records or duplicate educational transitions.

---

# 30. Lesson Plan Architecture

Syllabus and Lesson Plan are separate concepts.

```text
Syllabus
    |
    v
Lesson Plan
```

The Supervisor defines the canonical Syllabus.

The Teacher creates a Lesson Plan for a Class based on that Syllabus.

The Teacher may:

- create a draft
- edit the draft
- submit the plan

The Supervisor may:

- review
- approve
- reject

A Substitute may view the relevant Lesson Plan but should not gain ownership of it merely by substituting for a session.

---

# 31. Substitution Architecture

Substitution is session-specific.

A substitution request belongs to a `ClassSession`.

The backend:

1. Creates the request
2. Determines eligible Teachers
3. Broadcasts the request
4. Collects responses
5. Allows Supervisor selection
6. Re-checks eligibility
7. Approves the substitute
8. Records the actual session Teacher
9. Preserves history

Eligibility must include:

- active Teacher
- appropriate TeacherSkill
- no time conflict
- relevant hard constraints

The exact substitute payroll policy remains a separate Payroll Policy decision.

---

# 32. Payroll Architecture

Payroll is implemented as a policy-driven workflow.

Conceptually:

```text
Payroll Calculation
       |
       +--> Teacher Attendance
       +--> Session rules
       +--> Syllabus completion
       +--> Private Class rules
       +--> Substitution rules
       +--> Adjustments
       |
       v
Payroll Items
       |
       v
Total
```

Payroll must remain explainable.

The system should never require a Supervisor to trust an unexplained total.

The UI should be able to show the underlying Payroll Items.

Exact rates and formulas beyond the currently defined Teacher Base Rate remain an implementation-time business decision.

---

# 33. Payroll Finalization

Payroll lifecycle:

```text
DRAFT
  -> CALCULATED
  -> REVIEWED
  -> FINALIZED
```

Before finalization:

- payroll can be recalculated
- payroll items can be regenerated according to policy

After finalization:

- normal editing is locked
- changes require an explicit controlled workflow
- finalization is audited

Recalculation must be idempotent.

---

# 34. Private Classes

Private Classes are represented by:

```text
ClassType = PRIVATE
```

They are not a type of substitution.

Private Class payment logic is independent from substitution logic.

The currently defined business rule is:

```text
Private Class price = 500
Teacher share = 350
```

This rule must be implemented as an explicit business policy rather than scattered through frontend calculations.

---

# 35. Shahvar Import Architecture

The import process follows:

```text
Upload
  ->
Parse
  ->
Validate
  ->
Match
  ->
Preview
  ->
Supervisor Review
  ->
Commit
```

The frontend does not directly transform Excel data into database records.

The backend Import Service owns the workflow.

It is responsible for:

- file validation
- parsing
- field mapping
- student matching
- class matching
- validation
- warnings/errors
- preview generation
- transactional commit
- import results
- audit information

---

# 36. Import Idempotency

Import operations must be safe to retry.

The system should avoid:

- duplicate Students
- duplicate Classes
- duplicate Enrollments

Stable Shahvar identifiers should be used for matching where available.

Names alone must not be considered a reliable unique identity.

Ambiguous matches require explicit review.

---

# 37. Tickets

Tickets provide an operational correction and support workflow.

Tickets are not:

- Chat
- Audit Logs
- Notifications
- a replacement for normal application workflows

Teachers may create tickets for issues such as:

- Attendance Correction
- Class Correction
- Lesson Plan Issue
- Substitution Issue
- Payroll Issue
- Student Data Correction
- Teacher Data Correction
- System Issue
- Other

Supervisor actions remain subject to authorization and audit requirements.

---

# 38. Notifications

Notifications are operational events rather than a second communication system.

The backend creates notifications for important events such as:

- ticket creation/update
- substitution requests
- substitution approval
- lesson plan review/result
- promotion decision required
- payroll readiness/finalization
- import completion/errors

Real-time WebSocket delivery is not required for MVP.

Polling/refetching is acceptable.

Notification failure should generally not roll back the core business transaction.

---

# 39. Audit Logging

Audit logging is separate from application logging.

Audit records should capture sensitive business actions such as:

- authentication/security changes
- student/teacher changes
- class changes
- attendance corrections
- lesson plan approval
- exam result changes
- promotion decisions
- substitution approval
- payroll calculation/finalization
- imports
- ticket resolution

Conceptually:

```text
AuditLog
  - actor
  - action
  - entity type
  - entity id
  - metadata
  - timestamp
```

Audit logs are read-only through normal application workflows.

---

# 40. File Storage

Files such as Ticket attachments are stored in external file storage.

PostgreSQL stores metadata such as:

- file name
- MIME type
- size
- storage key
- creation time

Files should not be exposed through unrestricted public URLs.

Access must be authorized by the backend.

The exact storage provider and retention policy remain open implementation decisions.

The initial attachment size target is:

```text
5 MB per file
```

This must remain configurable.

---

# 41. Background Jobs

The backend may use background jobs when operations are genuinely long-running.

Potential candidates include:

- large Shahvar imports
- large scheduling calculations
- payroll calculations if they become expensive
- notification processing
- file processing

Small operations should remain synchronous.

Background processing should not be introduced merely for architectural appearance.

The system should remain understandable.

---

# 42. Concurrency and Race Conditions

The backend must assume that multiple requests can happen at the same time.

Examples:

- Two users enrolling the same student
- Two users approving a substitution
- Two payroll calculations running simultaneously
- A schedule being changed while another operation uses it
- Two imports processing overlapping data

Protection should use appropriate combinations of:

- database constraints
- transactions
- row locks
- optimistic concurrency where appropriate
- idempotency

Correctness is more important than minimizing database operations.

---

# 43. Logging and Observability

Application logs are for operational diagnosis.

Logs should support:

- request tracing
- error diagnosis
- performance investigation
- background job monitoring
- authentication/security investigation

Logs must not contain:

- passwords
- authentication secrets
- unnecessary sensitive personal information
- private file contents

Structured logging is preferred.

A request correlation ID should be supported.

---

# 44. API Versioning

The REST API is versioned under:

```text
/api/v1
```

Example:

```text
/api/v1/auth/login
/api/v1/students
/api/v1/classes
/api/v1/payrolls
```

Breaking API changes should use a new API version rather than silently changing existing contracts.

---

# 45. API Documentation

The backend should expose OpenAPI/Swagger documentation.

Documentation should describe:

- endpoints
- DTOs
- authentication requirements
- authorization expectations
- request parameters
- response structures
- error codes

The API contract should remain explicit enough for the Next.js frontend to consume reliably.

---

# 46. Testing Strategy

Backend testing should emphasize business-critical behavior.

### Unit Tests

Focus on:

- Scheduling
- Promotion
- Payroll
- Import matching
- Capacity
- Teacher eligibility
- State transitions

### Integration Tests

Focus on:

- PostgreSQL persistence
- transactions
- constraints
- repository behavior
- authorization against real database state

### API Tests

Focus on:

- authentication
- authorization
- DTO validation
- endpoint behavior
- error contracts

### End-to-End Tests

Critical workflows include:

```text
Login
  ->
Create Term
  ->
Create/Import Students
  ->
Create Class
  ->
Schedule
  ->
Create Session
  ->
Record Attendance
  ->
Submit Lesson Plan
  ->
Enter Exam Result
  ->
Process Promotion
  ->
Handle Substitution
  ->
Calculate Payroll
  ->
Finalize Payroll
```

---

# 47. Security Principles

Security is a backend responsibility.

The backend must implement:

- password hashing
- secure sessions
- authorization
- object-level access control
- input validation
- rate limiting
- secure file access
- restricted CORS
- CSRF protection where applicable
- safe error handling
- secret management
- audit logging
- database least privilege

Security must not depend on frontend behavior.

---

# 48. Data Integrity Principles

The backend must preserve:

1. Referential integrity
2. Historical integrity
3. Authorization integrity
4. Workflow integrity
5. Transactional integrity
6. Auditability

Examples:

Changing the current Teacher of a Class must not rewrite historical sessions.

Changing a student's current state must not delete promotion history.

Correcting attendance must not silently overwrite the original history.

Finalized payroll must not be silently recalculated.

---

# 49. Avoiding a God Backend

The backend must not become one enormous service containing every workflow.

Avoid patterns such as:

```text
EduTechService
```

containing:

- students
- classes
- payroll
- scheduling
- imports
- authentication
- notifications
- tickets

Instead, responsibilities should remain within their relevant modules.

Cross-module workflows should be orchestrated through explicit application services.

---

# 50. Pragmatic Architecture

EduTech should not become an architecture experiment.

Use additional abstraction only when it provides a concrete benefit such as:

- business-rule isolation
- testability
- maintainability
- security
- replacement of infrastructure
- clearer module boundaries

Avoid unnecessary:

- generic repository frameworks
- excessive interfaces
- excessive factories
- premature event-driven architecture
- microservices
- distributed transactions
- complex dependency injection structures

The architecture should be strong where the domain is complex and simple where the domain is simple.

---

# 51. Domain Events

Domain events may be introduced when they provide a clear benefit.

Potential events include:

```text
ExamResultProcessed
PromotionDecisionCreated
LessonPlanSubmitted
LessonPlanReviewed
SubstitutionApproved
PayrollFinalized
ImportCompleted
TicketCreated
```

Events should not be introduced merely to make the architecture look more sophisticated.

For MVP, direct application orchestration is acceptable where it is simpler and reliable.

---

# 52. Cross-Module Communication

Modules should communicate through explicit application/domain contracts rather than directly manipulating another module's database tables.

For example:

Payroll should consume attendance/session information through appropriate application/repository interfaces rather than embedding arbitrary SQL against unrelated module tables throughout the codebase.

Cross-module dependencies should remain understandable.

Circular dependencies should be avoided.

---

# 53. Configuration

Environment-specific values must be configurable.

Examples:

```text
DATABASE_URL
AUTH configuration
COOKIE configuration
FILE_STORAGE configuration
UPLOAD_LIMIT
CORS configuration
RATE_LIMIT configuration
LOG_LEVEL
```

Secrets must never be committed to source control.

Development, testing, and production configurations must remain separated.

---

# 54. Multi-Institute Scope

If the system is configured to support multiple independent institutes under the same account, an `Institute` entity should provide the scope boundary.

Relevant data should then be scoped by Institute, including:

- Students
- Teachers
- Classes
- Academic Terms
- Shahvar Imports
- Scheduling
- Payroll

This must be enforced by the backend.

The system must not treat the two independent institutes as branches of one institute unless the business model is explicitly changed later.

Whether the `Institute` entity is implemented from day one or introduced later remains an implementation decision.

---

# 55. Backend Folder Structure

A conceptual structure:

```text
src/
  modules/
    auth/
      application/
      domain/
      infrastructure/
      presentation/

    students/
      application/
      domain/
      infrastructure/
      presentation/

    scheduling/
      application/
      domain/
      infrastructure/
      presentation/

    payroll/
      application/
      domain/
      infrastructure/
      presentation/

    ...

  common/
    auth/
    database/
    errors/
    logging/
    validation/
    storage/
    pagination/
```

Not every module must contain every directory.

Simple modules may use a flatter structure.

Complex modules should receive deeper separation.

---

# 56. Backend Development Principles

The backend should follow these principles:

### Correctness first

A valid domain state is more important than a fast implementation.

### Backend is authoritative

Frontend checks improve UX but cannot enforce business correctness.

### Business logic is explicit

Important rules should be visible and testable.

### History is preserved

Do not destroy historical educational or payroll data for convenience.

### Transactions protect workflows

Multi-step critical operations must not leave partial state.

### Authorization is object-aware

Having a role does not automatically grant access to every resource.

### Complex domains deserve isolation

Scheduling, Promotion, Payroll, and Import deserve stronger domain boundaries.

### Simple CRUD should remain simple

Do not over-engineer straightforward resources.

### Reuse is selective

Existing desktop code is a reference and potential source of reusable domain logic, not an architecture template.

### No desktop assumptions

The new backend must not depend on:

- Tauri
- SQLite
- local-only persistence
- offline synchronization
- desktop-specific APIs

---

# 57. Final Architectural Principle

EduTech is a web-based online application with a modular backend.

The backend should be:

- authoritative
- secure
- transactional
- testable
- maintainable
- explainable
- domain-aware
- pragmatic

The architecture should provide strong protection around complex business rules while avoiding unnecessary infrastructure and abstraction.

The target is not the most sophisticated architecture.

The target is a backend that can reliably support the complete EduTech educational workflow and remain understandable as the system grows.

**Priority order:**

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

This priority should guide backend architectural decisions throughout implementation.
