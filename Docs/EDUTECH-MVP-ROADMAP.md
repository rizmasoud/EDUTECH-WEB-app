# EduTech — MVP Roadmap and Project Continuation

## 1. Purpose

This document is the central reference for continuing EduTech development.

The goals are to:
- Establish an accurate inventory of existing, incomplete, missing, and unverified features.
- Define a realistic MVP that can be deployed and used.
- Prevent repeated debugging cycles and unnecessary rewrites.
- Keep implementation, testing, and progress tracking aligned.
- Update this document whenever a feature is verified or its status changes.

## 2. Current Technology Stack

- Frontend: Next.js
- Backend: NestJS
- Database: PostgreSQL
- ORM and migrations: Drizzle ORM
- Development workflow: Claude.ai-assisted implementation and separate verification/audit steps.

The actual repository state must be inspected before assuming that any feature or infrastructure component is complete.

## 3. Feature Inventory

Every feature must be classified as one of:

- **Verified complete** — implementation and relevant tests have been inspected or executed.
- **Partially implemented** — some required behavior is missing.
- **Not implemented** — confirmed absent.
- **Needs verification** — insufficient evidence to determine its status.
- **Blocked** — cannot proceed until a dependency or design decision is resolved.

### A. Authentication and Access Control
- Supervisor login using personnel code and password.
- Session creation, validation, and logout.
- Role-based authorization.
- Account activation and deactivation.
- Teacher accounts and teacher access.
- Authentication and authorization tests.

### B. Supervisor Dashboard
- Dashboard navigation and essential overview.
- Management of books, classes, students, and teachers.
- Clear feedback for loading, empty, success, and error states.

### C. Books and Levels
- Create and manage books.
- Define book levels, ordering, and session requirements.
- Associate classes with the correct book.
- Validate book and level relationships.

### D. Classes and Scheduling
- Create and manage classes.
- Assign teachers and students.
- Display class schedules.
- Detect scheduling conflicts.
- Respect institute scheduling constraints.
- Create and manage scheduling proposals where required.

### E. Unavailable Times
- Allow relevant users to define unavailable time slots.
- Validate unavailable-time input.
- Prevent scheduling conflicts with unavailable periods.
- Make constraints visible to the scheduling process.
- Test edge cases and conflicting constraints.

The exact ownership, recurrence rules, and interaction with existing scheduling logic must be verified against project documentation and code before implementation.

### F. Student Management
- Create, view, update, and manage students.
- Select or assign the student's book level during student creation.
- Validate the selected level and its relationship to books and classes.
- Support enrollment in and removal from classes.
- Prevent or clearly handle duplicate student records.

### G. Excel Import
- Import class and student data from Shahvar Excel files.
- Preview data before committing it.
- Validate required fields.
- Detect duplicates and report row-level errors.
- Exclude unnecessary financial and personal fields.
- Preserve useful source identifiers when appropriate.

### H. Teacher Application
- Complete the teacher-facing dashboard and navigation.
- Show assigned classes and relevant class information.
- Provide access to student lists and schedules.
- Support attendance workflows.
- Provide lesson-plan and syllabus workflows.
- Support teacher requests, tickets, and supervisor communication.
- Enforce teacher permissions on the server.

The teacher application is currently reported by the project owner as incomplete. Its exact missing functionality must be audited.

### I. Attendance and Teacher Compensation
- Record and review attendance.
- Provide appropriate correction workflows.
- Calculate compensation according to approved business rules.
- Make calculations auditable and testable.

### J. Lesson Plans and Syllabus
- Define book-level syllabus requirements.
- Allow teachers to submit lesson progress.
- Make relevant information available to substitute teachers.
- Support attachments and configured size limits.
- Enforce deadlines when configured.

### K. Tickets and Supervisor Communication
- Allow teachers to submit tickets and correction requests.
- Support communication between teachers and the supervisor.
- Display ticket status and conversation history.
- Support attachments where required.
- Enforce access control and preserve an audit trail.

The required distinction between tickets and direct chat must be established from existing documentation and product decisions.

### L. Student Promotion
- Support end-of-term outcomes.
- Implement the agreed pass, conditional, and fail rules.
- Support supervisor decisions and batch promotion where specified.
- Validate the next available book or level.
- Preserve an auditable record of decisions.

### M. Substitute Teacher Workflow
- Identify eligible teachers based on relevant criteria.
- Notify or offer substitution opportunities as specified.
- Require supervisor approval where required.
- Track assignment outcomes.

### N. Deployment and Reliability
- Document environment configuration without exposing secrets.
- Verify database migrations and connection behavior.
- Provide appropriate error handling and logging.
- Test the production build and deployment process.
- Verify authentication, permissions, and core workflows before release.

## 4. MVP Definition

The MVP must support a coherent end-to-end workflow rather than merely displaying screens.

The proposed core workflow is:

1. The supervisor can sign in.
2. The supervisor can create and manage books and classes.
3. The supervisor can create students and assign the correct book level.
4. The supervisor can import existing student and class data when required.
5. The system can manage scheduling constraints, including unavailable times.
6. Teachers can access the essential parts of their application.
7. Teachers and the supervisor can complete the minimum required communication and correction workflows.
8. Data persists correctly in PostgreSQL.
9. Core workflows pass verification and the application can be deployed.

The final MVP boundary must be agreed upon after the repository audit. Features may be deferred only through an explicit decision, not silently omitted.

## 5. Development Workflow

For each feature:

1. Inspect the existing implementation and relevant documentation.
2. Identify dependencies and business rules.
3. Define the smallest useful implementation scope.
4. Implement only that scope.
5. Run relevant tests and type/build checks.
6. Perform a separate read-only audit.
7. Fix verified defects.
8. Update this roadmap with evidence and remaining work.

Do not rewrite working functionality without a demonstrated reason. Do not mark a feature complete merely because its UI exists.

## 6. First Task: Repository Audit

Before implementing additional features, inspect the current repository and existing documentation.

Produce a report containing:
- Actual repository structure and technology stack.
- Existing modules and user-facing workflows.
- Current database schema and migrations.
- Existing tests and their execution results.
- Implemented, partial, missing, blocked, and unverified features.
- Relevant known defects and unresolved business rules.
- Dependencies between features.
- A proposed MVP scope and prioritized implementation sequence.

The audit must be read-only. Do not edit files, run database seeds, alter the database, create commits, or push changes during this task.

## 7. Progress Tracking

For every feature, record:
- Status.
- Relevant files and modules.
- Required behavior.
- Tests and evidence.
- Remaining defects.
- Dependencies.
- Next actionable task.

Update this document after each verified milestone. Keep unresolved questions explicit instead of inventing answers.
