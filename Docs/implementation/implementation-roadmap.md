# Implementation Roadmap & Development Phases

## 1. Purpose

This document defines the implementation order for EduTech.

The roadmap exists to ensure that the system is built incrementally, with each phase producing a usable and testable result.

Implementation must follow the approved product, architecture, database, API, frontend, backend, design, testing, and operations specifications.

The roadmap does not replace those specifications.

If a conflict exists, the more specific approved domain specification takes precedence.

---

## 2. Implementation Principles

### 2.1 Build in Vertical Slices

Whenever practical, implementation should produce complete vertical slices rather than disconnected layers.

A feature should progress through:

```text
Database
   ↓
Backend Domain/Application
   ↓
API
   ↓
Frontend
   ↓
Tests
```

A feature is not considered complete merely because its database table or backend service exists.

---

### 2.2 Backend Is the Authority

Frontend implementation must never become the source of truth for:

- Authorization.
- Promotion decisions.
- Payroll calculations.
- Scheduling constraints.
- Attendance permissions.
- Import integrity.
- State transitions.
- Data ownership.

The backend and database enforce authoritative rules.

---

### 2.3 Test Critical Rules Immediately

Critical domain rules should be tested close to their implementation.

Particularly important areas:

- Scheduling.
- Promotion.
- Payroll.
- Import matching.
- Authorization.
- Attendance.
- Substitution eligibility.

Do not postpone all testing until the end of the project.

---

### 2.4 Keep the MVP End-to-End

The goal is not to build every screen first.

The goal is to reach a complete educational workflow:

```text
Login
  ↓
Term / Books
  ↓
Students / Teachers
  ↓
Class
  ↓
Schedule
  ↓
Class Session
  ↓
Attendance / Lesson Plan
  ↓
Exam
  ↓
Promotion
  ↓
Substitution / Tickets
  ↓
Payroll
```

Shahvar import, notifications, audit, and operational infrastructure support this lifecycle.

---

## 3. Phase 0 — Project Foundation

### Goal

Create the technical foundation for the new web application.

### Scope

- Create repository structure.
- Configure Next.js.
- Configure NestJS.
- Configure PostgreSQL.
- Select and configure ORM.
- Configure TypeScript.
- Configure linting.
- Configure formatting.
- Configure environment management.
- Configure development scripts.
- Establish basic module structure.
- Establish API `/api/v1` convention.
- Configure initial database migration system.
- Configure basic logging.
- Configure health endpoint.
- Establish initial frontend design system foundations.
- Establish CI checks where practical.

### Expected Result

The project can be:

```text
installed
→ started
→ connected to PostgreSQL
→ migrated
→ tested
→ built
```

No major business feature is required yet.

---

## 4. Phase 1 — Authentication and Authorization

### Goal

Establish secure access control before building protected business workflows.

### Scope

- Account.
- Roles.
- Account-role relationship.
- Teacher-account relationship.
- Personnel code login.
- Password hashing.
- Secure session/cookie authentication.
- Login.
- Logout.
- Current-user endpoint.
- Account activation/deactivation.
- Role authorization.
- Teacher resource ownership checks.
- Supervisor access rules.
- Authentication rate limiting.
- Basic security audit events.

### Tests

At minimum:

- Successful login.
- Invalid credentials.
- Inactive account.
- Logout.
- Session expiration.
- Supervisor authorization.
- Teacher authorization.
- Teacher access to another teacher's protected resource.
- Unauthorized API access.

### Expected Result

A user can securely log in and the backend can determine what resources and actions that user may access.

---

## 5. Phase 2 — Academic Foundation

### Goal

Build the core educational reference data.

### Scope

- Books.
- Book Parts.
- Book Segments.
- Academic Terms.
- Teacher Skills.
- Students.
- Teachers.

### Requirements

- CRUD where appropriate.
- Active/inactive states.
- Referential integrity.
- Search/filter/pagination where needed.
- Supervisor authorization.
- Teacher read access only where appropriate.

### Expected Result

The Supervisor can configure the academic foundation required for classes.

---

## 6. Phase 3 — Classes and Enrollment

### Goal

Build the central operational Class model.

### Scope

- Classes.
- Regular/Private class types.
- Class status.
- Capacity.
- Teacher assignment.
- Student enrollment.
- Enrollment history.
- Book/BookSegment compatibility.
- TeacherSkill validation.

### Business Rules

The backend must enforce:

- Capacity limits.
- Valid Book/BookSegment relationships.
- Teacher eligibility.
- Enrollment uniqueness.
- Historical enrollment preservation.
- Valid class lifecycle transitions.

### Expected Result

The Supervisor can create a class, assign a valid teacher, and enroll students.

---

## 7. Phase 4 — Shahvar Import

### Goal

Allow the real student/class data to enter EduTech safely.

### Scope

- ImportJob.
- ImportResult.
- Excel upload.
- File validation.
- Parsing.
- Required-column validation.
- Student matching.
- Shahvar-code handling.
- Class mapping.
- Academic Term selection.
- Book mapping.
- Preview.
- Manual review of ambiguous rows.
- Commit.
- Import history.
- Audit.

### Important Rules

Do not:

- Match students by name alone.
- Import unnecessary financial data.
- Import phone/age data unless explicitly added later.
- Automatically create Teacher accounts.
- Automatically create Promotion records.
- Automatically replace existing data.

### Expected Result

A Supervisor can upload a class Excel file, review the proposed changes, and safely commit the import.

---

## 8. Phase 5 — Scheduling

### Goal

Implement explainable schedule generation and review.

### Scope

- Schedule.
- Scheduling constraints.
- Scheduling preferences.
- Teacher conflicts.
- Student conflicts.
- TeacherSkill eligibility.
- Capacity validation.
- Scheduling Engine.
- Scheduling Proposal.
- Proposal review.
- Accept.
- Modify.
- Reject.
- Manual scheduling with the same backend validations.

### Scheduling Engine Requirements

The engine must remain independent from:

- Next.js.
- NestJS HTTP controllers.
- PostgreSQL.
- UI components.

It should operate on domain-level inputs and produce explainable scheduling results.

### Expected Result

The Supervisor can generate or manually construct a schedule, inspect conflicts/reasons, and approve a final schedule.

---

## 9. Phase 6 — Class Sessions and Attendance

### Goal

Turn recurring schedules into actual educational sessions.

### Scope

- ClassSession.
- Session generation.
- Session status.
- Student attendance.
- Teacher attendance.
- Attendance permissions.
- Attendance correction through Tickets.
- Audit of corrections.
- Substitute session responsibility.

### Expected Result

A real class session can occur in the system and attendance can be recorded and audited.

---

## 10. Phase 7 — Syllabus and Lesson Plans

### Goal

Implement educational planning and execution tracking.

### Scope

- Syllabus.
- Syllabus Items.
- Lesson Plans.
- Lesson Plan Items.
- Teacher submission.
- Supervisor review.
- Approval/rejection.
- Completion tracking.
- Substitute read-only access.
- Audit.

### Expected Result

The Supervisor defines what a Book/Segment requires, while the Teacher creates and submits a lesson plan based on those requirements.

---

## 11. Phase 8 — Exams and Promotion

### Goal

Implement the student progression workflow.

### Scope

- Exams.
- Exam Results.
- Promotion policy.
- Promotion records.
- Automatic promotion.
- Conditional decisions.
- Failure decisions.
- Terminal completion.
- Promotion audit.

### Rules

```text
Score >= 70
    → Automatic Promotion
```

```text
60–69
    → Supervisor Decision Required
```

```text
< 60
    → Supervisor Decision Required
```

Terminal Books must produce:

```text
Terminal Completion
```

rather than failing because no next Book exists.

### Expected Result

A completed exam result produces a deterministic, auditable student progression state.

---

## 12. Phase 9 — Substitution

### Goal

Implement the Teacher substitution workflow.

### Scope

- SubstitutionRequest.
- Eligible Teacher discovery.
- Broadcast.
- Teacher response.
- Supervisor selection.
- Approval.
- Conflict re-check.
- Emergency/fallback workflow.
- Substitute session responsibility.
- Lesson Plan visibility.
- Attendance responsibility.
- Audit.

### Important Boundary

Substitution is a ClassSession workflow.

It is not a ClassType.

Private Classes must remain separate from substitution.

### Expected Result

A specific session can safely move from the original Teacher to an approved substitute without rewriting historical class ownership.

---

## 13. Phase 10 — Tickets and Notifications

### Goal

Implement structured operational communication without introducing a full chat system.

### Scope

#### Tickets

- Ticket creation.
- Ticket messages.
- Ticket status.
- Assignment.
- Attachments.
- Teacher correction requests.
- Supervisor resolution.
- Authorization.
- Audit.

#### Notifications

- Notification model.
- Notification creation.
- Notification Center.
- Unread count.
- Mark as read.
- Entity references.
- Operational events.

### Expected Result

Teachers can report problems and request corrections while the Supervisor can process them through an auditable workflow.

Operational events can notify the relevant user without introducing real-time chat.

---

## 14. Phase 11 — Payroll and Private Classes

### Goal

Implement explainable Teacher payroll.

### Scope

- Payroll.
- Payroll Items.
- Teacher base rate.
- Teacher Attendance integration.
- Lesson Plan/Syllabus completion integration.
- Private Class payroll.
- Substitution payroll policy.
- Payroll calculation.
- Payroll review.
- Payroll finalization.
- Payroll breakdown.
- Payroll adjustment.
- Payroll audit.

### Important Rule

The exact payroll formulas that are not yet finalized must be implemented through a dedicated Payroll Policy rather than hard-coded throughout the application.

### Expected Result

The Supervisor can calculate, inspect, review, and finalize a Teacher's payroll for an Academic Term.

The resulting amount must be explainable through Payroll Items.

---

## 15. Phase 12 — Audit and Security Hardening

### Goal

Strengthen the application before production readiness.

### Scope

- Audit coverage review.
- Authorization review.
- Object-level authorization tests.
- Rate limiting.
- Secure cookie configuration.
- CORS.
- File access security.
- Input validation review.
- Error sanitization.
- Sensitive-data review.
- Security logging.
- Dependency security review.

### Expected Result

Security is reviewed across the actual implemented workflows rather than only at the architecture level.

---

## 16. Phase 13 — Testing and Regression

### Goal

Verify the complete MVP.

### Scope

- Unit tests.
- Integration tests.
- API tests.
- Authorization tests.
- E2E tests.
- Regression tests.
- Database constraint tests.
- Critical workflow tests.

### Critical E2E Scenarios

At minimum:

1. Login.
2. Create Academic Term.
3. Configure Books.
4. Create Students/Teachers.
5. Import students/classes.
6. Create Class.
7. Enroll students.
8. Generate/review Schedule.
9. Create ClassSession.
10. Record Attendance.
11. Submit Lesson Plan.
12. Record Exam Result.
13. Process Promotion.
14. Request/approve Substitution.
15. Create Ticket.
16. Calculate Payroll.
17. Review Payroll.
18. Finalize Payroll.
19. Inspect Notifications.
20. Inspect Audit history.

### Regression Knowledge

The old desktop project's known `UpdateProposalUseCase` data-loss bug must be treated as regression knowledge.

The new architecture must not reproduce the same class of omission/defaulting bug.

---

## 17. Phase 14 — Production Readiness

### Goal

Prepare the complete MVP for real use.

### Scope

- Production environment.
- HTTPS.
- Reverse proxy.
- PostgreSQL production setup.
- File storage.
- Environment secrets.
- Database backups.
- File backups.
- Restore test.
- Health checks.
- Logging.
- Error monitoring.
- Deployment pipeline.
- Rollback procedure.
- Operational runbook.
- Production smoke tests.

### Expected Result

The system can be deployed and operated reliably rather than merely running in development.

---

## 18. Phase Dependencies

The general dependency graph is:

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ↓
Phase 5
  ↓
Phase 6
  ↓
Phase 7
  ↓
Phase 8
  ↓
Phase 9
  ↓
Phase 10
  ↓
Phase 11
  ↓
Phase 12
  ↓
Phase 13
  ↓
Phase 14
```

Some work can proceed in parallel when dependencies are already stable.

For example:

- Design system work can proceed alongside backend foundation.
- Automated test infrastructure can be established early.
- CI/CD can begin during Phase 0.
- Shared frontend components can be developed before all backend modules exist.

However, parallel work must not bypass domain dependencies.

---

## 19. Definition of Done

A phase is not complete merely because code exists.

A phase is complete when:

- Required database structures exist.
- Backend workflows are implemented.
- API contracts are implemented.
- Authorization is enforced.
- Frontend workflow is usable.
- Relevant validation exists.
- Relevant automated tests exist.
- Audit requirements are implemented where required.
- Error handling exists.
- Documentation is updated where necessary.
- No known critical regression remains.

For critical domain modules, implementation without tests should not be considered complete.

---

## 20. Handling Open Decisions

The project contains intentionally unresolved decisions.

Examples include:

- Exact payroll formulas.
- Minimum class capacity.
- Institute entity timing.
- TeacherSkill granularity.
- Multiple sessions per day.
- File storage provider.
- Authentication implementation details.
- Hosting provider.
- Backup RPO/RTO.

These must not be silently invented during implementation.

When a decision becomes necessary:

1. Identify the dependency.
2. Explain the decision that is required.
3. Present the relevant options if meaningful.
4. Record the decision.
5. Update the appropriate specification.
6. Continue implementation.

The implementation must remain consistent with the updated specification.

---

## 21. Reuse of the Old Project

The old EduTech desktop project is a reference source.

Reuse is allowed when the old implementation is:

- Domain-correct.
- Tested.
- Architecture-independent.
- Compatible with the new web architecture.
- Clearly understood.

Do not directly reuse:

- Tauri-specific code.
- SQLite-specific persistence.
- Offline-first synchronization.
- Desktop-specific UI.
- WebView-specific assumptions.
- Desktop-bound use cases.

The old Scheduling Engine and relevant domain tests should be reviewed before deciding whether to reuse or rewrite them.

Reuse is a decision, not a goal.

---

## 22. AI-Assisted Development Rules

AI tools may be used during implementation, but generated code must remain understandable and reviewable.

AI-generated code must not be accepted solely because:

- It compiles.
- Tests happen to pass.
- The UI looks correct.

For important changes, the developer should understand:

- What changed.
- Why it changed.
- Which business rule it implements.
- Which data it reads/writes.
- Which authorization rules apply.
- Which tests protect it.
- Which failure cases exist.

AI should accelerate development, not replace engineering understanding.

---

## 23. Implementation Order Within a Feature

When implementing an individual feature, prefer this sequence:

```text
1. Confirm specification
2. Identify domain rules
3. Design/update database model
4. Implement domain/application logic
5. Implement authorization
6. Implement API
7. Add backend tests
8. Implement frontend workflow
9. Add frontend/API integration tests
10. Run regression tests
11. Review audit/security implications
12. Update documentation if the design changed
```

The exact order may vary when a technical dependency requires it, but business logic must not be hidden inside the UI merely for implementation convenience.

---

## 24. Avoiding Premature Complexity

The implementation must avoid adding infrastructure or abstractions without a real requirement.

Do not introduce prematurely:

- Microservices.
- Event-driven architecture.
- Distributed transactions.
- Message brokers.
- WebSockets.
- Offline synchronization.
- Native mobile applications.
- Complex caching systems.
- Advanced analytics infrastructure.

These may be considered later if actual requirements justify them.

---

## 25. MVP Completion Criteria

The MVP is complete when a Supervisor and Teacher can use EduTech through a realistic educational cycle.

At minimum:

```text
Authenticate
    ↓
Configure Academic Data
    ↓
Import / Manage Students
    ↓
Create Class
    ↓
Enroll Students
    ↓
Schedule Class
    ↓
Run Class Session
    ↓
Record Attendance
    ↓
Create / Review Lesson Plan
    ↓
Record Exam
    ↓
Process Promotion
    ↓
Handle Substitution if necessary
    ↓
Handle Tickets / Corrections
    ↓
Calculate Payroll
    ↓
Review / Finalize Payroll
```

The system must also provide:

- Notifications.
- Audit history.
- Secure file handling.
- Backup/recovery capability.
- Production observability.

---

## 26. Final Implementation Principle

Build EduTech in small, verified increments.

Do not attempt to recreate the entire old application at once.

Do not treat the old desktop architecture as the target architecture.

Do not sacrifice correctness for speed.

The target is:

```text
New Web Application
+
Approved Domain Rules
+
Clean Architecture
+
Strong Backend Authority
+
Tested Critical Workflows
+
Simple Production Infrastructure
```

The final implementation should be a new EduTech system informed by the old project, not a web-shaped copy of the old desktop application.
