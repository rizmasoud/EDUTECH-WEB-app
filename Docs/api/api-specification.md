# EduTech — API Specification

## 1. Purpose

This document defines the API contract between the EduTech web frontend and backend.

The API is responsible for exposing application capabilities while keeping business rules, authorization, validation, and data integrity on the backend.

The frontend must consume the API through defined contracts and must not directly access the database.

---

# 2. API Architecture

EduTech uses a REST API.

The high-level architecture is:

```text
Browser
   ↓
Next.js
   ↓
NestJS REST API
   ↓
Application / Domain Services
   ↓
PostgreSQL
```

The frontend must never connect directly to PostgreSQL.

The frontend must not contain business-critical persistence logic.

---

# 3. API Base Path

All API endpoints use:

```text
/api/v1
```

Examples:

```text
/api/v1/auth/login
/api/v1/students
/api/v1/classes
/api/v1/sessions
/api/v1/payrolls
```

Versioning allows future API evolution without immediately breaking existing clients.

---

# 4. HTTP Methods

The API should use conventional HTTP methods.

| Method | Typical Purpose                                    |
| ------ | -------------------------------------------------- |
| GET    | Retrieve resources                                 |
| POST   | Create resources or execute domain actions         |
| PATCH  | Partially update resources                         |
| PUT    | Full replacement where appropriate                 |
| DELETE | Delete only where deletion is explicitly permitted |

Business operations should not be forced into generic CRUD endpoints when a domain action is more appropriate.

For example:

```text
POST /api/v1/promotions/{id}/decision
```

is preferable to exposing arbitrary updates to Promotion status.

---

# 5. Resource Naming

Resource names should be plural.

Examples:

```text
/students
/teachers
/books
/book-parts
/book-segments
/academic-terms
/classes
/enrollments
/schedules
/sessions
/attendance
/exams
/exam-results
/promotions
/substitution-requests
/payrolls
/tickets
/notifications
/import-jobs
/audit-logs
```

URLs should use kebab-case.

---

# 6. DTO Principle

API DTOs must be separate from:

- Database models
- ORM entities
- Internal domain entities

A DTO represents an API contract.

The database schema must not automatically become the public API.

This separation allows internal implementation to evolve without unnecessarily breaking clients.

---

# 7. Authentication

## 7.1 Login

Endpoint:

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "personnelCode": "12345",
  "password": "example-password"
}
```

The API validates the credentials and creates an authenticated session.

---

## 7.2 Session

The preferred web authentication mechanism is secure cookie-based authentication.

Authentication cookies should use appropriate security attributes such as:

- HttpOnly
- Secure in production
- Appropriate SameSite policy

Exact session implementation remains an implementation decision.

---

## 7.3 Current User

Endpoint:

```http
GET /api/v1/auth/me
```

The endpoint returns the authenticated Account and its effective roles.

Sensitive information such as:

- Password hash
- Password
- Security secrets

must never be returned.

---

## 7.4 Logout

Endpoint:

```http
POST /api/v1/auth/logout
```

Logout must invalidate the authenticated session.

---

# 8. Authentication Errors

Unauthenticated requests should normally return:

```http
401 Unauthorized
```

Example:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required."
  }
}
```

---

# 9. Authorization

Authorization is enforced by the backend.

The backend must evaluate:

- Account authentication
- Role
- Resource ownership
- Resource scope
- Requested action
- Relevant domain rules

Frontend visibility is not authorization.

A hidden button must never be considered a security mechanism.

---

# 10. Authorization Example

A Teacher requests:

```http
GET /api/v1/classes/{classId}
```

The backend must verify that the Teacher is authorized to access that Class.

Changing the `classId` to another Class must not grant access.

The API must therefore protect against object-level authorization failures and IDOR-style access.

---

# 11. Standard Response Structure

Successful responses should use a consistent structure.

Example:

```json
{
  "data": {
    "id": "..."
  }
}
```

Collection responses may include metadata:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 120
  }
}
```

The exact pagination metadata may evolve, but the structure should remain predictable.

---

# 12. Error Response Structure

Business and validation errors should use a consistent structure:

```json
{
  "error": {
    "code": "CLASS_CAPACITY_EXCEEDED",
    "message": "The class has reached its maximum capacity."
  }
}
```

The frontend should not need to parse arbitrary backend exception messages to determine the type of failure.

---

# 13. HTTP Status Codes

Common statuses include:

| Status | Meaning                                             |
| ------ | --------------------------------------------------- |
| 200    | Successful request                                  |
| 201    | Resource created                                    |
| 204    | Successful request with no response body            |
| 400    | Invalid request                                     |
| 401    | Unauthenticated                                     |
| 403    | Authenticated but unauthorized                      |
| 404    | Resource not found                                  |
| 409    | Resource/business conflict                          |
| 422    | Validation/business input failure where appropriate |
| 429    | Rate limit exceeded                                 |
| 500    | Unexpected server error                             |

The API should use the most appropriate status rather than returning `200` for every business outcome.

---

# 14. Error Codes

Error codes should be stable and machine-readable.

Examples:

```text
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND
INVALID_INPUT
INVALID_STATE_TRANSITION
CLASS_CAPACITY_EXCEEDED
TEACHER_NOT_ELIGIBLE
SCHEDULE_CONFLICT
STUDENT_NOT_ENROLLED
PROMOTION_DECISION_REQUIRED
PROMOTION_ALREADY_PROCESSED
PAYROLL_ALREADY_FINALIZED
IMPORT_VALIDATION_FAILED
SUBSTITUTION_NOT_ELIGIBLE
```

Error codes should describe the business/API condition rather than internal implementation details.

---

# 15. Validation

Validation occurs at multiple layers.

## 15.1 Frontend Validation

Used for:

- Immediate user feedback
- Form usability
- Basic formatting

Frontend validation is not authoritative.

---

## 15.2 DTO Validation

NestJS validates incoming API payloads.

Examples:

- Required fields
- Data types
- String length
- Numeric range
- Enum values
- Date/time format

---

## 15.3 Domain Validation

Domain/application services enforce business rules.

Examples:

- TeacherSkill
- Class capacity
- Promotion policy
- Payroll policy
- Scheduling constraints
- Enrollment rules
- State transitions

---

## 15.4 Database Validation

PostgreSQL enforces structural integrity.

Examples:

- Foreign keys
- Unique constraints
- Check constraints
- Not-null constraints where appropriate

All layers complement one another.

---

# 16. Pagination

Large collections must support server-side pagination.

Examples:

```http
GET /api/v1/students?page=1&pageSize=25
```

The backend should not require the frontend to download the entire dataset merely to display a table.

---

# 17. Filtering

Resources should support appropriate server-side filters.

Example:

```http
GET /api/v1/students?isActive=true
```

Classes may support filters such as:

```text
academicTermId
bookId
teacherId
classType
status
```

The exact filter set depends on the resource.

---

# 18. Sorting

Large collections should support server-side sorting.

Example:

```http
GET /api/v1/students?sort=lastName&order=asc
```

The backend must validate allowed sort fields.

The API must not accept arbitrary SQL expressions as sorting parameters.

---

# 19. Searching

Search endpoints should provide controlled server-side search.

Example:

```http
GET /api/v1/students?search=Ali
```

Search behavior should be defined per resource.

The backend must use parameterized queries or ORM mechanisms that prevent injection.

---

# 20. Authentication API

Core endpoints:

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/change-password
```

Supervisor password reset functionality may be exposed through a protected administrative endpoint.

---

# 21. Academic Terms API

Core endpoints:

```text
GET    /academic-terms
POST   /academic-terms
GET    /academic-terms/{id}
PATCH  /academic-terms/{id}
POST   /academic-terms/{id}/activate
POST   /academic-terms/{id}/close
```

State-changing actions should use explicit endpoints when they represent meaningful domain transitions.

---

# 22. Books API

Core endpoints:

```text
GET    /books
POST   /books
GET    /books/{id}
PATCH  /books/{id}
GET    /books/{id}/parts
POST   /books/{id}/parts
```

Book Parts:

```text
GET    /book-parts/{id}
PATCH  /book-parts/{id}
```

Book Segments:

```text
GET    /book-parts/{id}/segments
POST   /book-parts/{id}/segments
GET    /book-segments/{id}
PATCH  /book-segments/{id}
```

---

# 23. Syllabus API

Core endpoints:

```text
GET    /syllabi
POST   /syllabi
GET    /syllabi/{id}
PATCH  /syllabi/{id}
```

Syllabus Items:

```text
GET    /syllabi/{id}/items
POST   /syllabi/{id}/items
PATCH  /syllabus-items/{id}
DELETE /syllabus-items/{id}
```

Deletion must respect historical integrity requirements.

---

# 24. Students API

Core endpoints:

```text
GET    /students
POST   /students
GET    /students/{id}
PATCH  /students/{id}
```

Additional operational endpoints may include:

```text
GET /students/{id}/enrollments
GET /students/{id}/exam-results
GET /students/{id}/promotions
GET /students/{id}/history
```

The API should expose history without allowing unauthorized modification.

---

# 25. Teachers API

Core endpoints:

```text
GET    /teachers
POST   /teachers
GET    /teachers/{id}
PATCH  /teachers/{id}
```

Teacher Skills:

```text
GET    /teachers/{id}/skills
POST   /teachers/{id}/skills
DELETE /teachers/{id}/skills/{skillId}
```

Teacher operational views may include:

```text
GET /teachers/{id}/classes
GET /teachers/{id}/sessions
GET /teachers/{id}/attendance
GET /teachers/{id}/payrolls
```

Authorization must restrict Teachers to their own permitted resources.

---

# 26. Classes API

Core endpoints:

```text
GET    /classes
POST   /classes
GET    /classes/{id}
PATCH  /classes/{id}
POST   /classes/{id}/activate
POST   /classes/{id}/complete
POST   /classes/{id}/cancel
```

The backend validates lifecycle transitions.

---

# 27. Enrollment API

Core endpoints:

```text
GET    /classes/{classId}/enrollments
POST   /classes/{classId}/enrollments
PATCH  /enrollments/{id}
POST   /enrollments/{id}/withdraw
```

Enrollment creation must validate:

- Capacity
- Student eligibility
- Duplicate enrollment
- Educational compatibility
- Class status

---

# 28. Scheduling API

The scheduling API must distinguish between:

- Proposals
- Schedules
- Sessions

---

## 28.1 Proposal

```text
POST /scheduling/proposals
GET  /scheduling/proposals
GET  /scheduling/proposals/{id}
```

---

## 28.2 Proposal Actions

```text
POST /scheduling/proposals/{id}/accept
POST /scheduling/proposals/{id}/reject
POST /scheduling/proposals/{id}/modify
```

The backend revalidates any modified proposal.

---

## 28.3 Schedule

```text
GET    /schedules
POST   /schedules
GET    /schedules/{id}
PATCH  /schedules/{id}
DELETE /schedules/{id}
```

Deletion must only be allowed when safe and must respect historical records.

---

# 29. Scheduling Response

A scheduling proposal should provide enough information for the frontend to explain the result.

Conceptually:

```json
{
  "data": {
    "id": "...",
    "status": "PENDING_REVIEW",
    "classes": [],
    "conflicts": [],
    "preferences": [],
    "explanations": []
  }
}
```

The exact schema may evolve during implementation.

The important requirement is that the backend should not return only opaque scores.

---

# 30. Class Sessions API

Core endpoints:

```text
GET  /sessions
POST /sessions
GET  /sessions/{id}
PATCH /sessions/{id}
POST /sessions/{id}/complete
POST /sessions/{id}/cancel
```

Session creation must validate:

- Class
- Schedule where applicable
- Date/time
- Class status
- Relevant conflicts

---

# 31. Attendance API

Student Attendance:

```text
GET   /sessions/{sessionId}/attendance
POST  /sessions/{sessionId}/attendance
PATCH /attendance/{id}
```

Sensitive corrections should normally use the Ticket workflow rather than unrestricted Teacher updates.

---

## 31.1 Teacher Attendance

```text
GET   /sessions/{sessionId}/teacher-attendance
POST  /sessions/{sessionId}/teacher-attendance
PATCH /teacher-attendance/{id}
```

The exact permissions depend on the actor and workflow.

---

# 32. Lesson Plan API

Core endpoints:

```text
GET  /classes/{classId}/lesson-plans
POST /classes/{classId}/lesson-plans
GET  /lesson-plans/{id}
PATCH /lesson-plans/{id}
```

Actions:

```text
POST /lesson-plans/{id}/submit
POST /lesson-plans/{id}/approve
POST /lesson-plans/{id}/reject
```

Completion:

```text
POST /lesson-plan-items/{id}/complete
```

The backend must enforce who can perform each action.

---

# 33. Exam API

Core endpoints:

```text
GET  /classes/{classId}/exams
POST /classes/{classId}/exams
GET  /exams/{id}
PATCH /exams/{id}
```

Exam Results:

```text
GET   /exams/{examId}/results
POST  /exams/{examId}/results
PATCH /exam-results/{id}
```

Saving a valid result may trigger Promotion processing.

---

# 34. Promotion API

Promotion is a domain workflow rather than simple CRUD.

Core endpoints:

```text
GET /promotions
GET /promotions/{id}
```

Processing may be triggered internally after ExamResult creation.

For pending decisions:

```text
POST /promotions/{id}/decision
```

Example request:

```json
{
  "decision": "PROMOTE"
}
```

Possible decisions include:

```text
PROMOTE
DO_NOT_PROMOTE
REPEAT
REMEDIAL
```

The backend must validate whether the requested decision is valid for the Promotion's current state.

---

# 35. Substitution API

Core endpoints:

```text
GET  /substitution-requests
POST /substitution-requests
GET  /substitution-requests/{id}
```

Broadcast:

```text
POST /substitution-requests/{id}/broadcast
```

Teacher response:

```text
POST /substitution-requests/{id}/respond
```

Example:

```json
{
  "response": "ACCEPT"
}
```

Supervisor approval:

```text
POST /substitution-requests/{id}/approve
```

Other actions:

```text
POST /substitution-requests/{id}/reject
POST /substitution-requests/{id}/cancel
```

Approval must revalidate Teacher eligibility.

---

# 36. Ticket API

Core endpoints:

```text
GET  /tickets
POST /tickets
GET  /tickets/{id}
PATCH /tickets/{id}
```

Messages:

```text
GET  /tickets/{id}/messages
POST /tickets/{id}/messages
```

Attachments:

```text
POST /tickets/{id}/attachments
GET  /tickets/{id}/attachments
```

Actions:

```text
POST /tickets/{id}/assign
POST /tickets/{id}/resolve
POST /tickets/{id}/reject
POST /tickets/{id}/cancel
```

Permissions must be enforced according to Ticket ownership and role.

---

# 37. Import API

Import is a multi-step workflow.

Core endpoints:

```text
POST /import-jobs
GET  /import-jobs
GET  /import-jobs/{id}
```

Upload/processing:

```text
POST /import-jobs/{id}/upload
POST /import-jobs/{id}/validate
GET  /import-jobs/{id}/preview
```

Commit:

```text
POST /import-jobs/{id}/commit
```

Results:

```text
GET /import-jobs/{id}/results
```

The backend must ensure that the Commit operation cannot bypass validation.

---

# 38. Payroll API

Core endpoints:

```text
GET  /payrolls
POST /payrolls
GET  /payrolls/{id}
```

Calculation:

```text
POST /payrolls/{id}/calculate
```

Review:

```text
POST /payrolls/{id}/review
```

Finalization:

```text
POST /payrolls/{id}/finalize
```

Items:

```text
GET /payrolls/{id}/items
```

Adjustments:

```text
POST /payrolls/{id}/adjustments
```

The backend must prevent normal modifications after finalization.

---

# 39. Notifications API

Core endpoints:

```text
GET   /notifications
PATCH /notifications/{id}/read
POST  /notifications/read-all
```

The backend must restrict notification access to the authenticated Account.

A user must not be able to retrieve another user's notifications by changing an ID.

---

# 40. Audit API

Audit records are read-only for normal application users.

Example:

```text
GET /audit-logs
GET /audit-logs/{id}
```

Access should be restricted to authorized Supervisors or future administrative roles if added.

Audit records must not be exposed in a way that allows ordinary modification.

---

# 41. File Upload API

Files are stored externally.

The API should handle:

```text
Upload
Validation
Authorization
Storage
Metadata
Access
```

The database stores metadata such as:

- File name
- MIME type
- Size
- Storage key
- Related Ticket
- Created time

Storage keys must not be treated as public URLs.

---

# 42. File Access

A file download/request must verify:

1. User is authenticated.
2. User is authorized to access the related resource.
3. File exists.
4. File is permitted to be accessed.

The API should not expose unrestricted public file storage.

---

# 43. Domain Actions vs Generic PATCH

Generic `PATCH` should be used for ordinary editable attributes.

Meaningful state transitions should use explicit domain actions.

Examples:

### Good

```text
POST /promotions/{id}/decision
POST /payrolls/{id}/finalize
POST /substitution-requests/{id}/approve
POST /import-jobs/{id}/commit
POST /lesson-plans/{id}/submit
```

### Avoid

```text
PATCH /promotions/{id}
{
  "status": "PROMOTED"
}
```

when changing the status requires domain behavior.

---

# 44. Idempotency

Critical operations should be designed to be idempotent where appropriate.

Examples:

- Promotion processing
- Payroll calculation
- Import commit
- Certain notification creation
- Other retry-prone operations

Repeated requests must not create duplicate business effects.

For operations where simple idempotency is insufficient, an explicit idempotency key may be introduced.

---

# 45. Transactions and API Boundaries

The API endpoint should not itself contain a long sequence of unrelated database operations.

Instead:

```text
Controller
   ↓
Application Service / Use Case
   ↓
Domain Policy / Service
   ↓
Repositories
   ↓
Database
```

The Application layer defines the transaction boundary for critical workflows.

---

# 46. Long-Running Operations

Some operations may become too expensive for a normal synchronous HTTP request.

Potential examples:

- Large Shahvar imports
- Complex scheduling generation
- Large payroll calculations

For such operations the API may return a job/resource representing progress.

Example:

```text
POST /import-jobs
        ↓
201 Created
        ↓
{
  "data": {
    "id": "...",
    "status": "PROCESSING"
  }
}
```

The frontend can then poll:

```text
GET /import-jobs/{id}
```

Background processing should only be introduced where actual workload requires it.

---

# 47. API Timeouts

The API should avoid keeping requests open unnecessarily for long operations.

Long-running tasks should use background processing when appropriate.

Normal CRUD and domain operations should remain synchronous when their execution time is predictable.

---

# 48. OpenAPI / Swagger

The NestJS API should expose an OpenAPI/Swagger specification for development and integration.

The specification should document:

- Endpoints
- Request DTOs
- Response DTOs
- Error responses
- Authentication requirements
- Parameters
- Pagination
- Domain action endpoints

The OpenAPI specification should remain synchronized with actual implementation.

---

# 49. API Versioning

The initial version is:

```text
v1
```

Example:

```text
/api/v1/students
```

Breaking changes should not be silently introduced into existing API contracts.

A future incompatible contract may use:

```text
/api/v2
```

when required.

---

# 50. API Security Requirements

The API must protect against common web/API security issues.

At minimum:

- Authentication enforcement
- Object-level authorization
- Role-based authorization
- Input validation
- SQL injection prevention
- Rate limiting for sensitive endpoints
- Secure cookies
- CSRF protection where cookie authentication requires it
- CORS restriction
- Secure file access
- No password leakage
- No secret leakage
- No sensitive information in logs
- HTTPS in production

---

# 51. Logging vs Audit

Application logs and AuditLog serve different purposes.

### Application Logs

Used for:

- Debugging
- Errors
- Performance
- Infrastructure
- Request tracing

### AuditLog

Used for:

- Who changed important data
- What changed
- When it changed
- Sensitive business actions

A normal debug log must not be treated as an audit record.

An AuditLog must not be used as a replacement for application observability.

---

# 52. Request Correlation

The backend should support request correlation IDs.

A request should be traceable across:

```text
Browser
   ↓
Next.js
   ↓
NestJS
   ↓
Application Service
   ↓
Database / external services
```

This is particularly useful for diagnosing:

- Import failures
- Scheduling problems
- Payroll failures
- Authentication issues
- Production errors

---

# 53. Frontend API Client

Next.js should communicate with NestJS through a dedicated API client/service layer.

Components should not scatter raw HTTP calls throughout the UI.

A conceptual structure may be:

```text
UI Component
    ↓
Feature Hook / Server Action / Service
    ↓
API Client
    ↓
NestJS API
```

The exact Next.js data-fetching approach is an implementation decision.

---

# 54. Server State

Server-owned data should be treated as server state.

Examples:

- Students
- Classes
- Sessions
- Attendance
- Payroll
- Tickets
- Notifications

The frontend should not attempt to maintain an independent authoritative copy of server data.

After mutations, the frontend should revalidate/refetch/update the relevant server state.

---

# 55. UI State

Pure UI state can remain in the frontend.

Examples:

- Modal open/closed
- Selected tab
- Temporary form state
- Table column visibility
- Local filters before submission

UI state must not become a second source of truth for business data.

---

# 56. API and Domain Separation

The API contract must not dictate the internal domain model.

For example:

```text
HTTP DTO
   ↓
Application Command
   ↓
Domain Model / Policy
   ↓
Persistence Model
```

These layers may use similar fields, but they serve different purposes.

---

# 57. API Contract Evolution

When a field or behavior changes:

1. Determine whether the change is breaking.
2. Update backend DTOs.
3. Update OpenAPI.
4. Update frontend API client/types.
5. Update integration tests.
6. Update affected UI.
7. Verify authorization.
8. Verify backward compatibility where required.

API changes should not be made only in the frontend.

---

# 58. API Testing Requirements

The API must have automated tests for:

### Authentication

- Login success
- Login failure
- Inactive account
- Logout
- Session validation

### Authorization

- Supervisor access
- Teacher access
- Teacher resource ownership
- IDOR attempts
- Unauthorized actions

### Business Operations

- Enrollment
- Scheduling
- Attendance
- Lesson Plans
- Promotion
- Substitution
- Payroll
- Import
- Tickets

### Error Handling

- Invalid input
- Invalid state
- Conflicts
- Missing resources
- Unauthorized access

---

# 59. Critical API Workflows

The following workflows should have integration/API tests:

1. Login → authenticated request
2. Create Term → activate Term
3. Create Class → enroll Student
4. Generate Scheduling Proposal → review → accept
5. Create Session → record Attendance
6. Create Lesson Plan → submit → approve
7. Enter ExamResult → automatic Promotion
8. Enter conditional ExamResult → Supervisor decision
9. Create Substitution → broadcast → response → approval
10. Create Ticket → message → resolve
11. Calculate Payroll → review → finalize
12. Upload Import → validate → preview → commit
13. Private Class → Session → Payroll
14. Sensitive correction → AuditLog

---

# 60. Example End-to-End API Interaction

A simplified example of a regular Class workflow:

### 1. Create Class

```http
POST /api/v1/classes
```

### 2. Add Enrollment

```http
POST /api/v1/classes/{classId}/enrollments
```

### 3. Generate Schedule Proposal

```http
POST /api/v1/scheduling/proposals
```

### 4. Accept Proposal

```http
POST /api/v1/scheduling/proposals/{proposalId}/accept
```

### 5. Create Session

```http
POST /api/v1/sessions
```

### 6. Record Attendance

```http
POST /api/v1/sessions/{sessionId}/attendance
```

### 7. Submit Lesson Plan

```http
POST /api/v1/lesson-plans/{lessonPlanId}/submit
```

### 8. Enter Exam Result

```http
POST /api/v1/exams/{examId}/results
```

### 9. Promotion Processing

The backend evaluates the result.

For >=70:

```text
Automatic Promotion
```

For 60–69:

```text
Pending Supervisor Decision
```

### 10. Calculate Payroll

```http
POST /api/v1/payrolls/{payrollId}/calculate
```

### 11. Finalize Payroll

```http
POST /api/v1/payrolls/{payrollId}/finalize
```

---

# 61. API Design Principles

The EduTech API should follow these principles:

1. RESTful resource naming.
2. Explicit domain actions for meaningful state transitions.
3. Stable DTO contracts.
4. Backend-enforced authorization.
5. Server-side pagination/filtering/search.
6. Consistent response and error structures.
7. Business logic outside controllers.
8. Transaction boundaries around critical operations.
9. Idempotency for retry-sensitive operations.
10. Secure file access.
11. OpenAPI documentation.
12. Automated API testing.
13. No direct frontend-to-database access.
14. No business-critical logic exclusively in the frontend.
15. Clear separation between API, application, domain, and persistence concerns.

---

# 62. Final Principle

The API is the controlled boundary between the web interface and EduTech's business system.

The frontend should ask the backend to perform meaningful operations.

The backend should:

- Authenticate
- Authorize
- Validate
- Apply business rules
- Execute transactions
- Preserve history
- Record audit information
- Return predictable results

The API should therefore expose the **capabilities of the EduTech domain**, not merely expose database tables.

**Principle: The API should be a safe and explicit contract around the business domain, not a thin CRUD wrapper around PostgreSQL.**
