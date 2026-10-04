# EduTech Architecture Specification

## 1. Purpose

This document defines the technical architecture of EduTech.

It describes:

- The overall system structure
- Frontend and backend responsibilities
- Backend module boundaries
- Domain and application boundaries
- API architecture
- Database access boundaries
- Authentication and authorization boundaries
- File storage integration
- Background processing
- Cross-cutting concerns
- Testing boundaries
- Architectural principles and constraints

This document complements the Product Specification.

The Product Specification defines what EduTech should do.

This document defines how the system should be structured to support those requirements.

---

## 2. Architecture Goals

The architecture should optimize for:

1. Correctness
2. Security
3. Maintainability
4. Usability
5. Performance
6. Scalability

The architecture should be simple enough for a small development team to understand and maintain.

It should also avoid decisions that would make the system difficult to evolve as EduTech grows.

The system should not introduce architectural complexity without a concrete reason.

---

## 3. High-Level Architecture

EduTech is an online web application using a layered client-server architecture.

The primary architecture is:

```text
┌───────────────────────────────┐
│           Browser             │
│                               │
│        Next.js / React        │
└───────────────┬───────────────┘
                │
                │ HTTPS / REST
                ▼
┌───────────────────────────────┐
│          NestJS API           │
│                               │
│ Authentication               │
│ Authorization                │
│ Application Services         │
│ Domain Logic                 │
│ Validation                   │
│ Transactions                 │
│ API Controllers              │
└───────────────┬───────────────┘
                │
                │ Database access
                ▼
┌───────────────────────────────┐
│          PostgreSQL           │
└───────────────────────────────┘

                │
                │ File operations
                ▼
┌───────────────────────────────┐
│      External File Storage    │
└───────────────────────────────┘
```

The browser must never connect directly to PostgreSQL.

The browser must not contain credentials that allow direct database access.

Business-critical operations must be executed and enforced by the backend.

---

## 4. Technology Stack

### Frontend

- Next.js
- React
- TypeScript

### Backend

- NestJS
- TypeScript

### Database

- PostgreSQL

### API

- REST

### File Storage

- External object/file storage

### Architecture Style

- Modular Monolith
- Layered architecture
- Domain/Application separation where valuable

The exact ORM and supporting infrastructure may be selected during implementation, provided that the selected technology works well with PostgreSQL and does not violate the architectural boundaries defined here.

---

## 5. Frontend Architecture

The frontend is responsible for:

- Rendering the user interface
- Navigation
- Form interaction
- Client-side validation for user experience
- Presenting server data
- Managing UI state
- Managing appropriate server-state caching
- Displaying loading/error/empty states
- Sending requests to the backend API
- Presenting authorization-aware UI

The frontend is not responsible for enforcing business security.

The frontend must not be treated as the final authority for:

- Permissions
- Role restrictions
- Promotion rules
- Payroll calculations
- Scheduling validity
- Attendance integrity
- Import integrity
- Historical data protection
- State transitions

The backend must enforce all important rules independently.

---

## 6. Next.js Responsibilities

Next.js is the frontend application layer.

It should provide:

- Application routing
- Page rendering
- Layouts
- UI components
- Form interfaces
- API client/service integration
- Server-side rendering or server components where useful
- Client components where interaction requires them
- Loading states
- Error boundaries
- Authentication-aware navigation
- Responsive layouts

Next.js should not become a second backend containing duplicated business rules.

If a rule affects the correctness or security of the system, that rule belongs in the backend.

---

## 7. Frontend API Boundary

The frontend communicates with NestJS through the defined REST API.

The frontend should use an API client or service layer rather than scattering raw HTTP requests throughout UI components.

A conceptual structure may look like:

```text
UI Component
     ↓
Page / Feature
     ↓
Frontend Service / API Client
     ↓
REST API
     ↓
NestJS
```

The frontend should consume API DTOs/contracts rather than assuming the internal database schema.

The frontend must not depend directly on PostgreSQL table names or database implementation details.

---

## 8. Backend Architecture

NestJS is the primary backend application.

The backend is responsible for:

- Authentication
- Authorization
- Request validation
- Domain rules
- Application workflows
- Database transactions
- Persistence
- File access authorization
- Import processing
- Scheduling
- Promotion processing
- Payroll calculation
- Audit logging
- Notifications
- Concurrency protection

The backend is the final authority for system correctness.

---

## 9. Modular Monolith

EduTech should initially be implemented as a Modular Monolith.

This means:

- One backend application
- One deployable backend service
- Clearly separated internal modules
- Explicit module boundaries
- No premature microservice infrastructure

The architecture should make module boundaries clear enough that individual modules can evolve independently.

Microservices should only be considered later if actual operational or scaling requirements justify them.

The system must not introduce distributed-system complexity merely for architectural appearance.

---

## 10. Backend Module Structure

The backend should be organized around meaningful business capabilities.

A conceptual module structure is:

```text
src/
├── auth/
├── accounts/
├── teachers/
├── students/
├── books/
├── academic-terms/
├── classes/
├── enrollments/
├── scheduling/
├── sessions/
├── attendance/
├── syllabus/
├── lesson-plans/
├── exams/
├── promotions/
├── substitutions/
├── tickets/
├── imports/
├── payroll/
├── notifications/
├── audit/
└── common/
```

The exact directory structure may evolve during implementation.

The important requirement is that business capabilities have clear boundaries.

Not every module requires identical internal complexity.

---

## 11. Domain Complexity Should Determine Structure

EduTech should not force every feature into an unnecessarily complex architecture.

Simple CRUD-oriented functionality may use a relatively straightforward structure.

Examples:

- Basic Teacher management
- Basic Student management
- Basic Book management

More complex domains should receive stronger separation and dedicated application/domain logic.

Examples:

- Scheduling
- Promotion
- Payroll
- Shahvar Import
- Substitution
- Attendance correction
- Authentication and authorization

The goal is meaningful separation, not architectural ceremony.

---

## 12. Domain and Application Separation

Where business rules are complex, the backend should distinguish between:

### Domain Logic

Pure business rules and policies that should not depend directly on:

- HTTP
- NestJS controllers
- React
- Next.js
- PostgreSQL
- File storage providers

### Application Logic

Coordinates use cases such as:

- Loading entities
- Calling domain policies
- Managing transactions
- Persisting results
- Triggering notifications
- Recording audit events

### Infrastructure

Provides concrete implementations for:

- Database access
- File storage
- Authentication/session infrastructure
- External services
- Background job infrastructure

### Interface/API Layer

Handles:

- HTTP requests
- DTO validation
- Authentication context
- Authorization guards/policies
- HTTP responses

A conceptual flow is:

```text
HTTP Request
     ↓
Controller
     ↓
DTO Validation
     ↓
Authorization
     ↓
Application Use Case
     ↓
Domain Policy / Service
     ↓
Repository / Infrastructure
     ↓
PostgreSQL
```

Not every simple operation must pass through every conceptual layer.

---

## 13. Controllers

Controllers are responsible for translating HTTP requests into application operations.

Controllers should:

- Receive requests
- Validate DTOs
- Extract authenticated user context
- Call application services/use cases
- Return appropriate responses

Controllers should not contain large business algorithms.

For example, a Promotion controller should not contain the complete promotion policy.

Instead:

```text
PromotionController
       ↓
ProcessPromotionUseCase
       ↓
PromotionPolicy
       ↓
Persistence
```

---

## 14. Application Services and Use Cases

Application services/use cases coordinate business operations.

Examples include:

- Create Class
- Enroll Student
- Generate Scheduling Proposal
- Accept Scheduling Proposal
- Record Attendance
- Submit Lesson Plan
- Process Exam Result
- Decide Promotion
- Request Substitution
- Approve Substitution
- Commit Shahvar Import
- Calculate Payroll
- Finalize Payroll
- Resolve Attendance Correction Ticket

A use case should represent a meaningful business operation rather than simply wrapping a database query.

---

## 15. Domain Policies

Complex rules should be isolated into reusable domain policies/services where appropriate.

Examples:

### Scheduling Policy

Responsible for:

- Hard constraints
- Soft preferences
- Teacher conflicts
- Student conflicts
- Teacher skills
- Capacity
- Explainability

### Promotion Policy

Responsible for:

- Score thresholds
- Automatic promotion
- Pending decisions
- Terminal completion
- Valid state transitions

### Payroll Policy

Responsible for:

- Eligible work
- Teacher rates
- Session calculations
- Private class rules
- Syllabus completion rules
- Substitution rules
- Payroll item generation

### Import Policy

Responsible for:

- Matching
- Validation
- Duplicate prevention
- Ambiguity detection
- Import consistency

These policies should remain independent of UI concerns.

---

## 16. Repositories and Persistence

Application/domain logic should not directly depend on raw database implementation where such separation provides meaningful value.

Repositories or persistence services may abstract operations such as:

- Find Student
- Find Teacher
- Find Class
- Save Enrollment
- Load Scheduling Context
- Save Promotion
- Save Payroll

The exact repository pattern should be applied pragmatically.

A repository should not become an unnecessary abstraction over every single database query.

The goal is to keep important business logic testable and independent from infrastructure where useful.

---

## 17. Database Boundary

PostgreSQL is the system of record for transactional application data.

Only the backend should communicate directly with PostgreSQL.

The frontend must never:

- Execute SQL
- Connect directly to PostgreSQL
- Receive database credentials
- Depend on database internals

Database constraints should enforce important invariants in addition to backend validation.

Examples include:

- Foreign keys
- Unique constraints
- Check constraints
- Appropriate indexes

---

## 18. Database Transactions

Transactions must be used when multiple related operations must succeed or fail together.

Examples include:

### Promotion

Processing an exam result and creating/updating the corresponding Promotion state.

### Payroll

Recalculating payroll items and the resulting total.

### Import

Committing matched students, classes, and enrollments.

### Substitution

Approving a substitute while rechecking eligibility and conflicts.

### Attendance Correction

Applying a correction and recording the corresponding audit information.

The transaction boundary should reflect the actual business operation.

---

## 19. Concurrency and Race Conditions

The backend must assume that multiple requests can occur concurrently.

Examples:

- Two Supervisors modifying the same resource
- Two users attempting conflicting schedule changes
- Two users attempting to approve the same substitution
- Payroll being recalculated while another action changes eligible data
- An import running while related data changes

Critical operations must use appropriate:

- Database transactions
- Constraints
- Locking
- State checks
- Idempotency mechanisms

The exact mechanism should be selected based on the operation.

---

## 20. Idempotency

Critical operations should be designed to avoid accidental duplication when retried.

Important examples include:

- Promotion processing
- Payroll calculation
- Import commit
- Notification creation for sensitive events
- Other operations that may be retried by clients or background workers

An operation should produce a predictable result when safely retried.

Idempotency should be implemented where the business operation requires it rather than mechanically added everywhere.

---

## 21. Authentication Architecture

Authentication is handled by the backend.

The intended web authentication mechanism is secure session-based authentication using HttpOnly cookies.

The browser should not receive sensitive authentication secrets through JavaScript-readable storage when they can be avoided.

Important security properties include:

- Secure cookies in production
- Appropriate SameSite configuration
- Session expiration
- Logout
- Session invalidation
- Inactive-account rejection
- Login rate limiting
- Password hashing
- Security event auditing

The exact implementation details are finalized during the authentication implementation phase.

---

## 22. Authorization Architecture

Authorization is enforced by the backend.

Authorization should consider:

1. Role
2. Resource scope
3. Ownership
4. Action
5. Current resource state

For example, being a Teacher does not automatically mean that the Teacher can access every Class.

A Teacher may access only resources that the backend determines are within their permitted scope.

The system must prevent IDOR-style access where changing a resource ID in a request exposes another user's resource.

---

## 23. Authorization Example

A request such as:

```text
PATCH /api/v1/classes/:classId
```

must not be authorized merely because:

```text
user.role === TEACHER
```

The backend must determine whether the authenticated user is actually permitted to perform that action on that specific Class.

Similarly, a Teacher attempting to access another Teacher's payroll or unrelated attendance data must be rejected even if the resource identifier is valid.

---

## 24. API Architecture

The backend exposes a versioned REST API.

The base path is:

```text
/api/v1
```

Resources should use plural nouns.

Examples:

```text
/api/v1/students
/api/v1/teachers
/api/v1/classes
/api/v1/sessions
/api/v1/attendance
/api/v1/exams
/api/v1/promotions
/api/v1/payrolls
/api/v1/tickets
```

Domain actions may use explicit action endpoints where the operation is not naturally represented as CRUD.

Examples:

```text
POST /api/v1/exam-results/:id/process-promotion
POST /api/v1/promotions/:id/decide
POST /api/v1/payrolls/:id/calculate
POST /api/v1/payrolls/:id/finalize
POST /api/v1/imports/:id/commit
POST /api/v1/substitution-requests/:id/approve
```

The exact endpoint naming may be refined during API implementation.

---

## 25. DTO Boundary

API DTOs should be separate from database entities and internal domain models.

The system should not automatically expose ORM models directly as API responses.

DTOs should define:

- Accepted input
- Validation rules
- Exposed output
- API compatibility

This prevents database implementation details from becoming part of the public API contract.

---

## 26. API Response Structure

The API should use a consistent response structure.

A successful response may follow the general form:

```json
{
  "data": {},
  "meta": {}
}
```

The exact metadata depends on the endpoint.

For paginated responses, metadata may include:

- Page
- Page size
- Total
- Other pagination information

Errors should use a consistent structure such as:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

HTTP status codes should reflect the nature of the failure.

---

## 27. Validation

Validation occurs at multiple boundaries.

### Frontend Validation

Used for:

- Immediate user feedback
- Form usability
- Basic input validation

### API DTO Validation

Used to reject malformed requests.

### Domain Validation

Used to enforce business rules.

### Database Constraints

Used as the final persistence-level protection for appropriate invariants.

No single validation layer should be treated as sufficient for every concern.

---

## 28. File Storage Architecture

User-uploaded files should not be stored directly as database binary data unless there is a specific justified reason.

External object/file storage should be used.

The database stores metadata such as:

- File name
- MIME type
- Size
- Storage key
- Related entity
- Creation timestamp

Storage keys must not be treated as public authorization.

File access must go through an authorization-aware mechanism.

A Teacher must not gain access to another user's private attachment merely by guessing a storage key.

---

## 29. Import Architecture

The Shahvar import workflow should be implemented as a backend application workflow.

Conceptually:

```text
Upload
  ↓
Parse
  ↓
Validate
  ↓
Match
  ↓
Preview
  ↓
Supervisor Review
  ↓
Commit
  ↓
Audit / Results
```

The frontend should display the import process and results.

The frontend must not perform the authoritative database transformation.

The backend must control:

- Matching
- Duplicate detection
- Validation
- Transaction boundaries
- Commit
- Import results
- Audit

---

## 30. Scheduling Architecture

Scheduling is one of the most domain-sensitive areas of EduTech.

The Scheduling Engine should be isolated from:

- HTTP
- React
- Next.js
- NestJS controllers
- PostgreSQL-specific implementation

The conceptual structure is:

```text
Scheduling Context
      ↓
Scheduling Engine
      ↓
Candidate Schedule / Proposal
      ↓
Application Service
      ↓
Persistence
```

The Scheduling Engine should receive the information it needs and return a deterministic, explainable result.

It should not directly modify database records.

The Application layer is responsible for persisting the proposal.

---

## 31. Scheduling Explainability

Scheduling results should contain enough information to explain:

- Which constraints were applied
- Which preferences were considered
- Which conflicts were detected
- Why a candidate was accepted or rejected
- Why no valid schedule could be produced

The UI should expose an understandable representation of this information.

The scheduling engine should not simply return a mysterious score.

---

## 32. Promotion Architecture

Promotion should be implemented as an explicit business workflow.

A conceptual flow is:

```text
Exam Result
    ↓
Promotion Policy
    ↓
┌─────────────────────────────┐
│ Score >= 70                 │
│ Automatic Promotion         │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Score 60–69                 │
│ Supervisor Decision         │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Score < 60                  │
│ Supervisor Decision         │
└─────────────────────────────┘
```

Terminal completion must be handled as a valid result.

Promotion processing must be idempotent and transactional where required.

---

## 33. Payroll Architecture

Payroll should be implemented as a calculation workflow rather than a simple total field.

Conceptually:

```text
Teacher
   +
Academic Term
   ↓
Eligible Sessions
   +
Teacher Attendance
   +
Lesson/Syllabus Completion
   +
Private Classes
   +
Substitution
   +
Adjustments
   ↓
Payroll Items
   ↓
Payroll Total
   ↓
Review
   ↓
Finalization
```

The payroll calculation engine/policy should produce explainable Payroll Items.

The final total should be derived from those items.

The system must not rely on a manually edited total as the source of truth.

---

## 34. Ticket Architecture

Tickets are application workflows rather than unrestricted chat.

A Ticket may contain:

- Metadata
- Messages
- Attachments
- Status
- Assignment
- Related entity

Sensitive corrections should result in an explicit domain operation.

For example:

```text
Teacher
   ↓
Attendance Correction Ticket
   ↓
Supervisor Review
   ↓
Attendance Correction Use Case
   ↓
Audit
```

The Ticket itself should not directly mutate Attendance records.

---

## 35. Notifications Architecture

Notifications are generated from meaningful application events.

Examples:

```text
Lesson Plan Submitted
        ↓
Notification
        ↓
Supervisor

Promotion Requires Decision
        ↓
Notification
        ↓
Supervisor

Payroll Finalized
        ↓
Notification
        ↓
Teacher
```

Notification generation should not require every database mutation to create a notification.

Notifications are separate from:

- Audit Logs
- Tickets
- Chat

Notification failures should generally not roll back the core business operation unless a specific operation explicitly requires transactional notification behavior.

---

## 36. Audit Architecture

Audit logging should be treated as a cross-cutting concern.

Important application operations should emit audit records.

The audit system should capture:

- Actor
- Action
- Entity
- Entity ID
- Relevant metadata
- Timestamp

Audit logging should not contain sensitive secrets such as:

- Passwords
- Authentication tokens
- Private credentials

Audit logs should be append-oriented and protected from ordinary modification.

---

## 37. Cross-Cutting Concerns

The backend should centralize or consistently implement cross-cutting concerns such as:

- Authentication
- Authorization
- Validation
- Error handling
- Logging
- Audit
- Configuration
- Database transactions
- Request correlation
- Rate limiting
- Observability

These concerns should not be implemented inconsistently in every feature module.

---

## 38. Logging vs Audit

Application logging and audit logging are different.

### Application Logs

Used for:

- Debugging
- Errors
- Operational diagnostics
- Performance investigation
- Infrastructure monitoring

### Audit Logs

Used for:

- Who changed what
- Security-sensitive actions
- Business-critical changes
- Historical accountability

Application logs may have different retention and storage requirements.

Audit logs are part of the application's historical record.

They must not be treated as interchangeable systems.

---

## 39. Error Handling

The backend should use consistent application error codes.

Errors should distinguish between:

- Invalid input
- Unauthorized access
- Forbidden action
- Resource not found
- Business rule violation
- Conflict
- Internal failure

Business-rule errors should be understandable enough for the frontend to present useful feedback.

Internal implementation details, stack traces, secrets, and sensitive database information must not be exposed to users.

---

## 40. Configuration

Environment-specific configuration must be externalized.

Sensitive configuration must never be committed to source control.

Examples include:

- Database credentials
- Session secrets
- Storage credentials
- External provider credentials
- Encryption keys
- Deployment-specific configuration

Configuration should be validated when the application starts.

---

## 41. Background Processing

The system should use background jobs only when an operation is genuinely long-running or asynchronous.

Potential examples include:

- Large Shahvar imports
- Large scheduling calculations
- Payroll calculations if they become expensive
- File processing
- Other long-running operational tasks

Simple CRUD operations should remain synchronous unless there is a concrete reason otherwise.

The system should not introduce a job queue merely because asynchronous architecture appears more sophisticated.

---

## 42. Testing Architecture

Testing should reflect architectural boundaries.

### Unit Tests

Focus on:

- Domain policies
- Scheduling
- Promotion
- Payroll
- Import matching and validation
- Other complex business rules

### Integration Tests

Focus on:

- PostgreSQL persistence
- Transactions
- Constraints
- Repository behavior
- Module integration

### API Tests

Focus on:

- Authentication
- Authorization
- DTO validation
- Business workflows
- Error contracts

### End-to-End Tests

Focus on complete user workflows.

Important E2E scenarios include:

- Login
- Class creation
- Enrollment
- Scheduling
- Session creation
- Attendance
- Lesson Plan
- Exam and Promotion
- Substitution
- Ticket correction
- Payroll
- Shahvar Import

---

## 43. Frontend Testing Boundary

Frontend tests should focus on:

- User interactions
- Component behavior
- Form behavior
- Rendering states
- Important page workflows

The frontend should not duplicate extensive backend business-rule tests.

For example, the frontend may test that a score input rejects obviously invalid values for user experience, but the authoritative promotion threshold must be tested in backend/domain tests.

---

## 44. Security Architecture Principles

Security must be enforced at multiple layers.

Important principles include:

- Backend authorization
- Object-level authorization
- Secure authentication
- Password hashing
- Secure cookies
- HTTPS in production
- Restricted CORS
- CSRF protection where applicable
- Rate limiting
- Input validation
- Secure file access
- Database least privilege
- Secret management
- Audit of sensitive security events

The system must assume that frontend restrictions can be bypassed by a malicious client.

---

## 45. Data Access and Historical Integrity

The architecture must preserve historical truth.

For example:

If a Class originally has Teacher A and later changes to Teacher B:

```text
Class
  → current Teacher B

Past Class Sessions
  → retain the actual Teacher information
```

Historical records must not be rewritten simply because the current state changed.

Substitution must similarly preserve which Teacher actually performed a Session.

Payroll must consume historical work information rather than reconstructing it from current Class state.

---

## 46. State Transition Architecture

Important entities should use explicit state transitions.

Examples include:

### Class

```text
DRAFT
  ↓
ACTIVE
  ↓
COMPLETED
```

or:

```text
DRAFT
  ↓
CANCELLED
```

### Lesson Plan

```text
DRAFT
  ↓
SUBMITTED
  ↓
APPROVED
```

or:

```text
SUBMITTED
  ↓
REJECTED
```

### Payroll

```text
DRAFT
  ↓
CALCULATED
  ↓
REVIEWED
  ↓
FINALIZED
```

The backend should control valid transitions.

The frontend must not be able to force arbitrary status values.

---

## 47. Deletion Strategy

Hard deletion should be used cautiously.

Historical or operational entities should generally use:

- `isActive`
- Status fields
- Archival/deactivation

rather than destructive deletion.

Examples include:

- Students
- Teachers
- Books
- Classes
- Payroll
- Promotions
- Attendance
- Tickets
- Audit Logs

Hard deletion may be allowed for safe, non-historical data where no important records depend on it.

Database foreign-key behavior should be deliberately selected rather than relying on accidental cascade deletion.

---

## 48. API and Database Independence

The API contract must not become a direct reflection of the database schema.

For example, adding a database column should not automatically require exposing it through the API.

Likewise, an API operation may combine multiple database entities when that represents a meaningful business operation.

Examples:

```text
POST /promotions/:id/decide
```

may update multiple related records within one transaction.

The API should represent application capabilities rather than merely exposing database tables.

---

## 49. Shared Types

Shared TypeScript types may be used where they provide meaningful value, particularly for:

- API contracts
- Common enums
- Validation schemas
- Generated OpenAPI types

However, the frontend and backend must not share a database model as if it were an API contract.

Internal domain entities and persistence models should remain independent from UI concerns.

---

## 50. Observability

The application should provide basic operational observability.

The system should support:

- Health checks
- Structured logs
- Request correlation
- Error reporting
- Basic performance monitoring
- Database health monitoring

The architecture should make operational failures diagnosable without requiring direct production database inspection.

---

## 51. Deployment Architecture

The intended production architecture is approximately:

```text
                Internet
                   │
                   ▼
          HTTPS / Reverse Proxy
                   │
          ┌────────┴────────┐
          ▼                 ▼
       Next.js           NestJS API
                            │
                            ▼
                       PostgreSQL
                            │
                            ▼
                    File Storage
```

The exact hosting provider may be selected later.

PostgreSQL should not be publicly exposed.

Production traffic should use HTTPS.

Secrets should be managed outside the source repository.

---

## 52. Environments

The project should distinguish between environments such as:

- Development
- Testing
- Production

A Staging environment may be introduced if useful.

Each environment should have separate configuration and appropriate data isolation.

Production credentials and secrets must never be reused casually in development.

---

## 53. Database Migrations

Database schema changes must be managed through controlled migrations.

The application must not rely on manually editing the production database schema.

Migrations should be:

- Versioned
- Reviewable
- Reproducible
- Tested before production deployment

Destructive migrations require particular care when historical data exists.

---

## 54. Backup and Recovery

Production data must be backed up.

Backups should cover:

- PostgreSQL
- Relevant file storage

Backup policies should define:

- Retention
- Frequency
- Recovery objectives
- Storage location
- Restoration procedure

The exact RPO/RTO values may be finalized during deployment planning.

A backup that has never been successfully restored should not be considered fully trustworthy.

Recovery testing should therefore be part of operational readiness.

---

## 55. CI/CD

The project should support an automated validation pipeline.

A typical pipeline is:

```text
Install
  ↓
Lint
  ↓
Typecheck
  ↓
Unit Tests
  ↓
Integration Tests
  ↓
API / E2E Tests
  ↓
Build
  ↓
Deploy
```

Deployment should only proceed after required validation succeeds.

The exact CI/CD provider is an implementation/deployment decision.

---

## 56. Rollback

Application deployments should support a reasonable rollback strategy.

Database rollback must be handled more carefully than application rollback.

Not every database migration is safely reversible.

Where destructive schema changes are involved, migration strategy must account for:

- Existing production data
- Application compatibility
- Deployment order
- Recovery options

The project should prefer migration strategies that minimize downtime and irreversible data loss.

---

## 57. Performance Principles

Performance matters, but premature optimization should be avoided.

The system should first ensure:

- Correct queries
- Appropriate indexes
- Pagination
- Efficient data loading
- Avoidance of obvious N+1 queries
- Reasonable API payload sizes
- Efficient frontend rendering

Performance optimization should be driven by real measurements where possible.

---

## 58. Scalability Principles

EduTech should be able to grow without requiring an immediate architectural rewrite.

The initial architecture should support:

- More students
- More teachers
- More classes
- More academic terms
- More historical data
- More simultaneous users

However, scalability should not justify premature microservices, distributed caches, complex event buses, or other infrastructure without a concrete requirement.

---

## 59. Architectural Constraints

The following constraints are mandatory unless explicitly changed by a future architecture decision:

1. The browser must not connect directly to PostgreSQL.
2. Business-critical rules must be enforced by the backend.
3. Frontend authorization is not a security boundary.
4. EduTech is online-first; offline-first synchronization is not required.
5. The backend is a Modular Monolith for the MVP.
6. REST is the primary API style.
7. PostgreSQL is the primary transactional database.
8. External storage is used for uploaded files.
9. Complex domain logic must remain independent of UI concerns.
10. Historical records must not be silently rewritten.
11. Critical multi-step workflows must use appropriate transactions.
12. Important retriable workflows should be idempotent.
13. Sensitive operations must be auditable.
14. Microservices are not part of the MVP architecture.
15. Desktop-specific assumptions from the previous EduTech application must not be carried into the new implementation.

---

## 60. Previous Project Reuse Boundary

The previous EduTech desktop project may be inspected for:

- Business knowledge
- Domain rules
- Scheduling concepts
- Useful algorithms
- Existing tests
- Edge cases
- Lessons learned

It must not be treated as the architectural source of truth for the new web application.

The following should not be directly carried over merely for convenience:

- Tauri-specific infrastructure
- SQLite-specific persistence
- Offline-first synchronization
- Desktop-specific UI
- Local-only persistence assumptions
- Web-incompatible application boundaries

Useful code may be selectively rewritten or adapted after review.

The principle is:

> New implementation, informed by the old system.

---

## 61. Architectural Decision Principle

When making future architectural decisions, evaluate them against:

- Business value
- Correctness
- Security
- Maintainability
- Complexity
- Testability
- Performance
- Future extensibility

A more sophisticated solution is not automatically a better solution.

The preferred solution is the simplest architecture that safely satisfies the actual requirement.

---

## 62. Architecture Summary

EduTech is a web-first Modular Monolith composed of:

```text
Next.js
   ↓
NestJS REST API
   ↓
Domain / Application Modules
   ↓
PostgreSQL
```

with:

```text
External File Storage
Audit
Notifications
Background Jobs where justified
Observability
```

The architecture separates:

- User interface
- API
- Application workflows
- Domain rules
- Persistence
- Infrastructure

while avoiding unnecessary abstraction.

The most complex business areas receive dedicated domain/application boundaries:

- Scheduling
- Promotion
- Payroll
- Import
- Substitution
- Attendance correction
- Authentication/Authorization

The architecture exists to support the product's workflows, preserve correctness and history, and remain understandable as the system grows.
