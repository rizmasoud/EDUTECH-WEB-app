# EDUTECH — Current State Audit

## 1. Purpose

This document records the verified implementation status of EduTech Web.

Its purpose is to establish a reliable baseline before further development, prevent repeated debugging, identify missing features, and ensure that implementation decisions are based on the actual repository rather than assumptions.

This document must reflect the current codebase and available test evidence. It must not describe planned functionality as implemented.

## 2. Project Context

- Product: EduTech Web
- Frontend: Next.js
- Backend: NestJS
- Database: PostgreSQL
- ORM and migrations: Drizzle ORM
- Primary development assistant: Claude.ai
- Repository: `rizmasoud/EDUTECH-WEB-app`
- Target branch: `claude/postgres-only`

Verify the current branch and repository before using this information. If the repository or branch differs, report the discrepancy rather than silently switching contexts.

## 3. Audit Rules

The initial audit must be read-only.

- Do not modify application source files.
- Do not modify database records or schema.
- Do not run database seed scripts.
- Do not apply migrations.
- Do not commit, push, merge, or reset Git changes.
- Do not overwrite existing documentation.
- Do not expose credentials, tokens, session secrets, or other sensitive values.
- Do not claim a feature works merely because a related file, component, database table, or API endpoint exists.
- Do not infer successful end-to-end behavior from unit tests alone.
- Inspect existing documentation and tests as well as implementation code.
- If evidence is insufficient, mark the feature `Needs verification`.

Report any command that could modify files or data before running it. Prefer read-only inspection commands.

## 4. Status Definitions

Use exactly one of these statuses for each audited capability:

- **Verified complete:** Implementation and relevant behavior are supported by sufficient code and test evidence.
- **Partially implemented:** Some required behavior exists, but important parts are missing or incomplete.
- **Not implemented:** The required functionality could not be found in the inspected repository.
- **Needs verification:** Available evidence is insufficient to establish the actual status.
- **Blocked:** Work cannot proceed because a dependency, access issue, missing requirement, or other explicit blocker prevents it.

Never assign a status based solely on assumptions or filenames.

## 5. Required Feature Audit

Audit every area below. Add any additional features discovered in existing documentation, code, issues, or previous project requirements.

### 5.1 Authentication and Access Control

- Supervisor login and logout
- Secure password verification
- Session creation, validation, expiration, and termination
- Account activation and deactivation
- Role-based access control
- Authorization checks on backend operations
- Teacher accounts and login
- Appropriate handling of invalid credentials and unauthorized access

### 5.2 Supervisor Dashboard

- Overview of classes, students, and teachers
- Navigation to all supervisor functions
- Clear loading, empty, and error states
- Responsive layout and usability

### 5.3 Books and Levels

- Create and manage books
- Define book levels and their sequence
- Define the relevant syllabus or requirements for each book
- Validate relationships between books, levels, classes, and students

### 5.4 Student Management

- Create, view, edit, and deactivate students as appropriate
- Assign a student's book or level during student creation
- Change a student's assigned level when authorized
- Prevent invalid or inconsistent book-level assignments
- Search and filter students
- Handle duplicate students safely

**Known requirement to verify:** A newly created student must be assignable to the appropriate book level. Do not mark this complete unless the full workflow has been verified.

### 5.5 Class Management

- Create and edit classes
- Assign the correct book or level
- Assign teachers
- Manage student membership
- Validate class capacity and scheduling constraints
- Distinguish ordinary group classes from private classes and substitute-teacher arrangements

### 5.6 Scheduling

- Create and edit class schedules
- Support the required recurrence patterns
- Detect teacher, classroom, and other relevant conflicts
- Respect configured unavailable times
- Display useful explanations when scheduling is rejected
- Preserve existing scheduling data when proposals are edited
- Review scheduling proposals before committing changes, if this workflow is part of the current design

**Known requirement to verify:** The `Unavailable Times` functionality has previously been identified as missing. Inspect the current branch to determine whether it remains missing, is partially implemented, or is now complete.

### 5.7 Excel Import

- Import supported Shahvar Excel files
- Preview and validate imported data before saving
- Report invalid rows and duplicate records
- Preserve relevant student and class identifiers where appropriate
- Exclude unwanted financial and personal fields from the import
- Avoid partial or duplicate imports when validation fails

### 5.8 Teacher Application

- Teacher authentication
- Teacher dashboard
- Assigned classes and student lists
- Teaching schedules
- Attendance recording
- Lesson-plan and syllabus workflows
- Substitute-teacher workflows where applicable
- Ticket submission and communication with the supervisor
- Clear permission boundaries between teacher and supervisor

**Known requirement to verify:** The teacher-side application has previously been described as incomplete. Identify its implemented workflows and missing parts separately.

### 5.9 Attendance and Teacher Compensation

- Record attendance
- Handle authorized corrections
- Preserve an audit trail for corrections
- Track relevant lesson or syllabus completion
- Calculate teacher compensation according to approved business rules
- Allow the supervisor to review the resulting figures

Do not invent payment formulas. If the rules are not documented or conflict with the implementation, record the discrepancy for clarification.

### 5.10 Lesson Plans and Syllabus

- Supervisor-defined requirements for each book
- Teacher lesson-plan submissions
- Relevant attachments
- Visibility for authorized substitute teachers
- Configurable deadlines where required
- Validation of attachment type and size

### 5.11 Tickets and Supervisor Communication

- Teachers can submit tickets
- Supervisors can view and respond to tickets
- Ticket status and history are preserved
- Relevant images or documents can be attached
- Access is restricted to authorized users

**Known requirement to verify:** Tickets and teacher-supervisor chat or communication have previously been identified as missing or incomplete. Determine the current implementation status of each separately. Do not treat a ticket system and real-time chat as the same feature.

### 5.12 Student Promotion

- Record end-of-term results
- Support approved pass, conditional, and fail outcomes
- Support authorized individual or batch promotion where required
- Prevent promotion when no valid next book or level exists
- Preserve the decision and relevant history

Verify the exact promotion rules against the current business requirements. Do not create new rules during the audit.

### 5.13 Substitute Teachers

- Identify eligible substitute teachers
- Notify or offer the class to eligible teachers
- Record the selected substitute
- Obtain supervisor approval where required
- Prevent conflicting assignments

### 5.14 Database, Security, and Deployment

- PostgreSQL schema and migrations
- Referential integrity and appropriate constraints
- Data persistence across application restarts
- Safe configuration through environment variables
- No hard-coded production secrets
- Appropriate input validation and error handling
- Reliable application startup and health checks
- Deployment configuration and documented setup instructions

## 6. Evidence Requirements

For each feature, record:

1. **Status**
2. **Evidence:** Relevant file paths, API routes, database tables, or functions
3. **Tests:** Existing tests and their results, if safely available
4. **Verified behavior:** What the evidence actually demonstrates
5. **Missing behavior:** What remains incomplete
6. **Dependencies or blockers**
7. **Next action:** The smallest useful follow-up task

A file or database table alone is not proof that a user-facing workflow is complete.

## 7. Audit Report Format

Produce a table with these columns:

| Feature | Status | Evidence | Missing or Unverified Behavior | Recommended Next Action |
|---|---|---|---|---|

After the table, provide:

### A. Repository and Environment Findings
Summarize the current branch, application structure, relevant documentation, database integration, and available test suites. Do not disclose secrets.

### B. Confirmed Working Features
List only features supported by sufficient evidence.

### C. Incomplete or Missing Features
List the specific missing workflows and explain their impact.

### D. Conflicts and Unclear Requirements
Identify differences between documentation, implementation, tests, and known business requirements. Do not resolve business-rule conflicts by guessing.

### E. Test Evidence
Report which relevant tests were inspected or run, their outcomes, and any limitations. Clearly distinguish tests that were run from tests that were merely found.

### F. Recommended MVP Sequence
Recommend a small, dependency-aware sequence of implementation tasks. Do not start implementing them during this audit.

### G. Questions Requiring Product-Owner Decisions
Ask only questions that cannot be answered from the repository or existing documentation.

## 8. Updating This Document

Update this document only after an audit or implementation milestone produces new evidence.

When updating it:

- Preserve accurate previous findings and change only what new evidence justifies.
- Record the evidence behind status changes.
- Distinguish implementation completion from successful end-to-end verification.
- Do not mark a feature complete merely because code was generated.
- Keep the document concise enough to remain useful.

## 9. First Task

Perform the read-only audit described above on the current repository and target branch.

Do not implement features or change files, database records, migrations, Git history, or remote branches.

Return the audit report for review before proposing or starting implementation work.