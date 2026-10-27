# EduTech Product Specification

## 1. Product Overview

EduTech is a modern web-based educational workflow management system for language institutes.

The system is designed to support the operational and educational workflows of a language institute, with particular focus on:

- Academic term and book management
- Student and teacher management
- Class and enrollment management
- Shahvar-based student/class data import
- Class scheduling and schedule proposals
- Session management
- Student attendance
- Teacher attendance
- Syllabus and lesson planning
- Exams and promotion decisions
- Teacher substitution
- Tickets and correction workflows
- Teacher payroll
- Private classes
- In-app operational notifications
- Auditability and historical records

EduTech is not intended to replace Shahvar in the MVP. Shahvar remains an external source of student/class data where required.

The product should provide a modern, clear, fast, secure, and maintainable experience rather than reproducing the interface or workflow style of legacy institute-management software.

---

## 2. Product Vision

The primary goal of EduTech is to provide a reliable operational system that connects the academic and administrative workflows surrounding language classes.

The system should make it easy for authorized users to:

- Understand the current academic state
- Manage classes and students
- Plan and review schedules
- Conduct and record class sessions
- Track student attendance
- Define and execute educational syllabi
- Manage exams and promotion decisions
- Handle teacher substitutions
- Calculate and review teacher payroll
- Resolve operational corrections through controlled workflows
- Maintain an auditable history of important changes

The product should favor correctness, clarity, and maintainability over unnecessary complexity.

---

## 3. Target Users

The MVP has two application roles:

### 3.1 Supervisor

The Supervisor is the primary management user of EduTech.

The Supervisor can manage and oversee:

- Academic terms
- Books and book structure
- Syllabi
- Students
- Teachers
- Teacher skills
- Classes
- Enrollments
- Schedules
- Scheduling proposals
- Class sessions
- Attendance corrections
- Exams and results
- Promotion decisions
- Lesson plan review
- Substitution requests
- Tickets
- Imports
- Payroll
- Notifications
- Audit information

The Supervisor is responsible for final decisions in workflows that require management approval.

### 3.2 Teacher

The Teacher has access to the resources and workflows relevant to their own teaching responsibilities.

The Teacher can:

- View their assigned classes
- View relevant class sessions
- Record student attendance for their sessions
- Manage their lesson plans
- View relevant syllabi
- Submit lesson plans for review
- Respond to substitution requests
- Teach approved or provisionally assigned substitute sessions according to the workflow
- Create and manage permitted tickets
- View their own notifications
- View relevant payroll information according to the authorization policy

Teachers must not be able to bypass Supervisor-controlled workflows or modify protected historical records.

---

## 4. Roles and Accounts

EduTech distinguishes between an application Account and a Teacher entity.

An Account represents authentication and authorization.

A Teacher represents a person who performs teaching-related work.

An Account may:

- Have one or more roles
- Have both Supervisor and Teacher roles
- Exist without being associated with a Teacher

A Teacher may have at most one associated Account.

The MVP roles are:

- `SUPERVISOR`
- `TEACHER`

There is no Secretary role in the current MVP.

Students are not application login users in the MVP.

---

## 5. Authentication

Users authenticate using:

- Personnel Code
- Password

Passwords must be securely hashed and must never be stored or exposed in plaintext.

The web application should use secure session-based authentication, preferably through secure HttpOnly cookies.

Authentication and authorization are enforced by the backend.

Frontend role restrictions are for user experience only and must never be considered a security boundary.

---

## 6. Multi-Institute Scope

The Supervisor may manage two independent language institutes using the same EduTech system.

If the system needs to support multiple independent institutes simultaneously, the data model must represent an independent `Institute` entity rather than treating the institutes as branches of one institute.

Institute-scoped data should include, where applicable:

- Students
- Teachers
- Classes
- Academic terms
- Shahvar imports
- Scheduling
- Payroll
- Other institute-specific operational data

The exact timing of introducing the `Institute` entity is an implementation decision, but the architecture must not prevent independent institute scoping.

---

## 7. Academic Model

EduTech uses the following academic hierarchy:

```text
Book
 └── BookPart
      └── BookSegment
```

A Book represents an educational level/course book.

A Book may contain multiple Parts.

Each Part may contain multiple Segments.

Books have an explicit sequence order.

A Book may be marked as terminal.

Successful completion of a terminal Book results in a terminal completion state rather than an attempt to find a nonexistent next Book.

---

## 8. Academic Terms

An Academic Term represents a period during which classes are operated.

Academic Terms are separate from Books and Book Segments.

A Book can be used across multiple Academic Terms.

Academic Terms have:

- Name
- Start date
- End date
- Status

Supported statuses:

- `PLANNED`
- `ACTIVE`
- `CLOSED`

The start date must precede the end date.

---

## 9. Students

The Student entity represents the EduTech identity of a student.

Required conceptual information includes:

- First name
- Last name
- EduTech identifier
- Optional Shahvar code
- Active/inactive state
- Creation and update timestamps

> **Scope decision D1 (2026-10-28):** A student must also have a book/level placement as part of creation (`Docs/EDUTECH-BUSINESS-RULES.md` BR-STU-001). See `Docs/product/mvp-scope.md`. The exclusions below are unchanged.

The MVP intentionally excludes unnecessary student information such as:

- Phone number
- Age
- Date of birth
- Financial debt
- Financial discounts
- Other unrelated Shahvar fields

The Shahvar code is an external reference and must not automatically be treated as the primary EduTech identity.

Student matching during imports must not rely on name alone.

If a reliable Shahvar identifier is available, it should be used for matching.

If matching is ambiguous, the system must require review instead of silently choosing a student.

Student educational history must be preserved.

Students should not be hard-deleted when historical records depend on them.

---

## 10. Teachers

A Teacher represents an instructor working with EduTech.

A Teacher contains, conceptually:

- First name
- Last name
- Optional linked Account
- Base payroll rate
- Active/inactive state
- Creation and update timestamps

Teacher skills determine which Books or educational levels a teacher is qualified to teach.

Teacher skill eligibility is enforced by the backend.

A teacher's active/inactive state does not imply deletion of historical records.

---

## 11. Classes

The Class is the central operational entity connecting students, teachers, books, terms, schedules, and sessions.

A Class belongs to:

- An Academic Term
- A Book

A Class may optionally reference a Book Segment.

A Class may have:

- A Teacher
- Enrollments
- Schedules
- Sessions
- Lesson Plans
- Exams
- Substitution requests

Classes have two types:

- `REGULAR`
- `PRIVATE`

Private classes are a separate class type and must not be confused with teacher substitution.

Class statuses include:

- `DRAFT`
- `ACTIVE`
- `COMPLETED`
- `CANCELLED`

A Draft Class may temporarily lack a teacher, schedule, or students.

An Active Class must satisfy the required domain constraints, including valid academic context, teacher eligibility, capacity, scheduling requirements, and necessary enrollments.

---

## 12. Class Capacity

EduTech uses configurable class capacity rules.

The general target capacity is approximately 12 students.

The minimum capacity may depend on the specific operational context and is currently expected to be either 8 or 10.

The maximum capacity is 15.

Capacity rules must be centralized in backend/domain policy rather than duplicated throughout the frontend.

---

## 13. Enrollments

Students are connected to Classes through Enrollment records.

Enrollment preserves the history of a student's participation in a class.

An enrollment contains, conceptually:

- Student
- Class
- Status
- Joined date
- Optional left date
- Creation and update timestamps

Supported enrollment states include:

- `ACTIVE`
- `COMPLETED`
- `WITHDRAWN`

The same student must not have duplicate enrollment records for the same class.

Promotion and enrollment are separate concepts.

A successful promotion allows a student to proceed to the next educational level, but promotion must not automatically create a new enrollment unless that workflow is explicitly implemented.

---

## 14. Scheduling

EduTech provides scheduling as decision support rather than unrestricted automatic scheduling.

The system should help generate valid scheduling proposals while keeping the Supervisor in control of the final decision.

Scheduling must distinguish between:

- Hard constraints
- Soft preferences

### Hard constraints

Examples include:

- Friday is closed
- A teacher cannot teach overlapping classes
- A class cannot have contradictory schedules
- Teacher skill requirements must be satisfied
- Capacity must be valid
- Time ranges must be valid
- Student scheduling conflicts should not be silently ignored

### Soft preferences

Examples include:

- Thursday morning preference
- Preferred time slots
- Better distribution of classes
- Other configurable scheduling preferences

The scheduling engine should explain why a proposed schedule was selected and should identify conflicts or reasons when no valid schedule exists.

The system must not generate random or partially invalid schedules merely to produce a result.

---

## 15. Scheduling Days

The default scheduling pattern is:

### Odd schedule

- Sunday
- Tuesday
- Thursday

### Even schedule

- Saturday
- Monday
- Wednesday

Friday is closed.

Thursday morning is a preference rather than an absolute hard constraint.

These rules should remain configurable where practical rather than being unnecessarily embedded throughout the system.

---

## 16. Scheduling Proposals

Scheduling proposals are intermediate objects between scheduling calculations and final schedules.

A proposal may contain:

- Candidate classes
- Suggested schedules
- Detected conflicts
- Applied constraints
- Applied preferences
- Explanatory scoring or criteria
- Creator
- Creation timestamp
- Status

Proposal statuses include:

- `DRAFT`
- `PENDING_REVIEW`
- `ACCEPTED`
- `MODIFIED`
- `REJECTED`

The Supervisor can:

- Accept
- Modify
- Reject

a proposal.

A final schedule must not be created by bypassing backend validation.

Manual scheduling must use the same important domain validations as generated scheduling.

---

## 17. Class Sessions

A Schedule represents a recurring or planned schedule.

A Class Session represents an actual occurrence of a class.

These are intentionally separate concepts.

A Class Session contains:

- Class
- Optional originating Schedule
- Session date
- Start time
- End time
- Status

Supported statuses:

- `SCHEDULED`
- `COMPLETED`
- `CANCELLED`

A session may be generated from a recurring Schedule, but the Session keeps its own execution information.

Historical Sessions must remain stable even if the Class teacher or future Schedule changes.

Multiple sessions on the same day must remain possible if the domain requires them.

---

## 18. Student Attendance

Student attendance belongs to a Class Session.

Attendance statuses include:

- `PRESENT`
- `ABSENT`
- `LATE`
- `EXCUSED`

Attendance can only be recorded for enrolled students and valid, non-cancelled sessions.

Teachers may record attendance for sessions they are authorized to teach.

Teachers cannot directly delete attendance records.

If an attendance record needs correction, the Teacher must use the Ticket workflow.

A Supervisor may correct attendance through the controlled correction workflow.

Attendance corrections must be audited, including the actor, reason, and relevant before/after information.

---

## 19. Teacher Attendance

Teacher attendance is a separate concept from student attendance.

Teacher attendance is associated with Class Sessions and is used as one of the inputs to teacher payroll.

Teacher attendance must not be derived simply from student attendance.

The system must preserve which teacher actually performed a session, including substitution scenarios.

---

## 20. Syllabus

A Syllabus represents formal educational requirements defined by the Supervisor.

A Syllabus belongs to a Book and may optionally be associated with a Book Segment.

Syllabus items may represent requirements such as:

- Films
- Workbook exercises
- Conversation activities
- Grammar
- Vocabulary
- Other educational requirements

Each item may contain:

- Type
- Title
- Description
- Required flag
- Sequence order

Teachers cannot modify the canonical Syllabus.

Syllabus changes must not silently rewrite the meaning of historical Lesson Plans.

---

## 21. Lesson Plans

A Lesson Plan represents a Teacher's execution plan for a Class based on the applicable Syllabus.

A Lesson Plan belongs to a Class and Teacher.

Supported statuses include:

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `REJECTED`

Teachers can:

1. Review the applicable Syllabus
2. Create a Lesson Plan
3. Add Lesson Plan items
4. Submit the plan

Supervisors can review and approve or reject submitted plans.

A substitute teacher may view the relevant Lesson Plan in read-only mode.

Lesson Plan completion can be used as an input to payroll calculations, but the Lesson Plan itself does not calculate payroll.

---

## 22. Exams

An Exam belongs to a Class.

Exam types include:

- `FINAL`
- `MIDTERM`
- `OTHER`

Exam Results belong to an Exam and Student.

Scores must be between 0 and 100.

A student must be appropriately enrolled in the Class before receiving a result.

Each student should have at most one result per Exam.

---

## 23. Promotion

Promotion represents the educational transition decision resulting from an Exam Result.

The default promotion rules are:

### Score 70 or above

The student is automatically promoted.

Supervisor approval is not required.

### Score 60–69

The result requires a Supervisor decision.

The Supervisor may choose an appropriate outcome such as:

- Promote
- Do not promote
- Other explicitly supported decision

### Score below 60

The result requires a Supervisor decision.

Possible decisions may include:

- Repeat
- Remedial
- Do not continue
- Other explicitly supported decision

Promotion decisions must be auditable.

Promotion processing must be idempotent.

Changing an exam score after promotion has occurred is a sensitive operation and must trigger controlled re-evaluation and auditing.

---

## 24. Terminal Books

A terminal Book has no next educational Book.

If a student successfully completes a terminal Book, the system must create a terminal completion state.

The system must not throw an error merely because there is no next Book.

Terminal completion is a valid educational outcome.

---

## 25. Teacher Substitution

Substitution is performed at the Class Session level rather than replacing the Teacher of the entire Class.

A substitution request contains:

- Class Session
- Requesting account
- Status
- Optional approved Teacher
- Approval information

Eligible substitute teachers must satisfy relevant requirements such as:

- Active teacher status
- Required Teacher Skill
- No schedule conflict
- Other applicable hard constraints

The system may broadcast a substitution request to eligible teachers.

Teachers can accept or decline.

A Teacher response is not final approval.

The Supervisor makes the final approval decision under the current MVP workflow.

Eligibility must be rechecked at approval time to avoid race conditions.

An emergency fallback workflow may allow a substitute to teach before formal Supervisor approval, followed by explicit approval and audit.

A substitute may view the relevant Lesson Plan.

The actual teacher who performed a session must be preserved for attendance and payroll purposes.

Private classes are separate from substitution.

---

## 26. Private Classes

Private Classes are represented by the `PRIVATE` Class Type.

They are independent of substitution workflows.

The current business rule is:

- Private class price: 500 toman
- Teacher share: 350 toman
- Teacher share ratio: 70%

This private-class payment rule must not be confused with substitute teacher compensation.

The exact implementation of private-class billing and payroll integration must remain consistent with the approved payroll policy.

---

## 27. Teacher Payroll

Payroll is calculated per Teacher and Academic Term.

The goal is an explainable and auditable payroll calculation.

A Teacher has an individual base rate.

Payroll may include items such as:

- Regular session payments
- Syllabus/Lesson Plan completion payments
- Private class payments
- Substitution payments
- Explicit adjustments

Payroll items should contain:

- Type
- Quantity
- Rate
- Amount
- Optional reference
- Description

Base payroll items should follow the principle:

```text
amount = quantity × rate
```

The exact rules for syllabus completion and substitution compensation remain implementation-level policy decisions where not yet finalized.

Payroll must be calculated from actual work performed.

For example, substitute work must be attributed to the actual Teacher who performed the session rather than blindly using the Class's normal Teacher.

Payroll statuses include:

- `DRAFT`
- `CALCULATED`
- `REVIEWED`
- `FINALIZED`

Payroll calculation must be idempotent.

Finalized payroll must be protected from normal modification.

Any exceptional adjustment must be represented explicitly and audited rather than silently changing the payroll total.

The UI should expose a clear payroll breakdown so the Supervisor can understand how the final amount was produced.

---

## 28. Shahvar Import

EduTech supports importing class and student data from Shahvar Excel files.

The import is intended to provide required operational data, not to reproduce Shahvar's entire dataset.

The import should generally preserve:

- Student name
- Student surname
- Shahvar code where available
- Information required to identify the Class
- Other explicitly approved operational fields

The import should not bring unnecessary data such as:

- Age
- Phone number
- Financial debt
- Financial discount
- Unrelated Shahvar fields

The import process must support:

1. Upload
2. Parse
3. Validate
4. Preview
5. Supervisor review
6. Confirmation
7. Commit

Imports must be transaction-safe and should not leave the database in a partially imported state.

Imports should be idempotent.

Existing students must not be duplicated when a reliable external identifier can match them.

Name-only matching is not sufficient.

Ambiguous matches must require manual review.

The Academic Term must be explicitly selected or otherwise unambiguously determined.

Book and Class mappings must be validated.

The import must not silently overwrite educational history such as:

- Promotions
- Attendance
- Payroll
- Historical Enrollments

The system should provide row-level import results and useful warnings/errors.

---

## 29. Tickets

Tickets provide controlled communication and correction workflows between Teachers and Supervisors.

Tickets are not a replacement for a general chat system.

Possible ticket types include:

- Attendance correction
- Class correction
- Lesson Plan issue
- Substitution issue
- Payroll issue
- Student data correction
- Teacher data correction
- System issue
- Other

Ticket statuses include:

- `OPEN`
- `IN_PROGRESS`
- `RESOLVED`
- `REJECTED`
- `CANCELLED`

Teachers may create tickets and communicate through ticket messages.

Teachers cannot directly bypass protected business workflows by using tickets.

Supervisors can manage tickets and, where appropriate, apply the requested correction through the relevant domain workflow.

Tickets support multiple attachments.

Initial supported attachment categories include:

- Images
- PDF files
- Documents

The initial file-size limit is expected to be 5 MB per file and should be configurable.

Files should be stored in external file storage while the database stores metadata and secure storage references.

---

## 30. Notifications

The MVP uses in-app notifications.

Notifications are operational signals rather than a replacement for the application's workflows.

Examples include:

- Ticket created or updated
- Substitution request
- Substitution approval
- Lesson Plan submitted
- Lesson Plan review result
- Promotion decision required
- Payroll ready
- Payroll finalized
- Import completed
- Import completed with errors
- Important system alerts

Notifications should be associated with the relevant entity when applicable.

Users may:

- View notifications
- See unread count
- Mark notifications as read

Users must only access their own notifications.

Real-time delivery is not required for the MVP.

Polling or normal data refetching is acceptable.

---

## 31. Auditability

Important business and security operations must be auditable.

Audit information should include:

- Actor
- Action
- Entity type
- Entity identifier
- Relevant metadata
- Timestamp

Sensitive operations that require auditing include:

- Authentication and security changes
- Student and Teacher changes
- Class changes
- Attendance changes
- Syllabus and Lesson Plan changes
- Exam and Promotion changes
- Substitution changes
- Payroll changes
- Imports
- Ticket resolution and sensitive corrections

Audit logs are historical records and should not normally be editable or deleted.

Current state must not replace historical information.

For example, changing the Teacher assigned to a Class must not rewrite the Teacher who performed past Class Sessions.

---

## 32. Data Integrity

The backend is the final authority for business rules.

The frontend may provide validation for user experience, but frontend validation must never be the only protection.

Critical workflows should use database constraints and transactions where appropriate.

Examples include:

- Unique constraints
- Foreign keys
- Check constraints
- State transition validation
- Transactional multi-step operations
- Concurrency protection
- Idempotency

Historical records should generally be preserved.

Soft deactivation or status changes should be preferred over destructive deletion when historical information depends on the entity.

---

## 33. MVP Scope

The MVP should support a complete real-world educational cycle.

### Included in MVP

- Authentication
- Roles and authorization
- Academic Terms
- Books and Book structure
- Students
- Teachers
- Teacher Skills
- Shahvar import
- Classes
- Enrollments
- Scheduling
- Scheduling proposals
- Class Sessions
- Student Attendance
- Teacher Attendance
- Syllabus
- Lesson Plans
- Exams
- Exam Results
- Promotion
- Teacher Substitution
- Tickets
- Ticket attachments
- Payroll
- Private Classes
- Notifications
- Audit Logs
- Backup and recovery capabilities

The MVP should not be considered complete if it only provides CRUD screens without supporting the operational workflows connecting these entities.

---

## 34. Post-MVP Scope

The following features are intentionally outside the MVP:

- Full chat
- Student portal
- Parent portal
- CRM
- Full accounting system
- Online payment
- SMS
- Email notification infrastructure
- Shahvar replacement
- Advanced task management
- Advanced notes
- Advanced BI/reporting
- Native mobile applications
- Microservice decomposition
- Offline-first synchronization
- Real-time WebSocket infrastructure

These features may be introduced later if they provide sufficient value.

---

## 35. Non-Functional Priorities

The project follows this priority order:

1. Correctness
2. Security
3. Maintainability
4. Usability
5. Performance
6. Scalability

The system should be scalable without introducing unnecessary complexity prematurely.

The architecture should remain simple enough to understand and maintain while avoiding decisions that create an obvious dead end.

---

## 36. Web-First Architecture

EduTech is an online web application.

The current product does not require offline-first behavior or local synchronization.

The intended architecture is:

```text
Browser
   ↓
Next.js
   ↓
NestJS REST API
   ↓
PostgreSQL
   ↓
External File Storage
```

The frontend must not directly access PostgreSQL.

Business-critical logic must not live only in the frontend.

The backend must enforce authentication, authorization, validation, and domain rules.

---

## 37. Technology Direction

The approved primary technology stack is:

### Frontend

- Next.js
- React
- TypeScript

### Backend

- NestJS
- TypeScript

### Database

- PostgreSQL

### File Storage

- External object/file storage

### API

- REST API

### Architecture

- Modular Monolith
- Domain/Application separation where it provides meaningful value
- Dedicated domain/application services for complex business logic

Microservices are not required for the MVP.

---

## 38. Design Direction

EduTech should have a coherent, modern product interface.

The design language should combine three reference directions:

### Notion-inspired

Notion is the primary inspiration for the base visual language.

Use this direction for:

- General layouts
- Navigation
- Forms
- Documents and Lesson Plans
- Tickets
- Notifications
- General information hierarchy

The goal is clean hierarchy, readability, whitespace, and comfortable long-session usage.

### Cal.com-inspired

Cal.com is the primary inspiration for scheduling-related interaction patterns.

Use this direction for:

- Calendars
- Schedule grids
- Time slots
- Session planning
- Scheduling proposals
- Time-oriented interactions

### MongoDB-inspired

MongoDB is a reference for data-heavy and technical interface patterns.

Use this direction for:

- Dense data tables
- Status indicators
- Technical information
- Import interfaces
- Payroll data
- Audit information
- Structured operational data

These references must not be copied directly.

EduTech must have one unified design system rather than looking like three unrelated products.

The project should define its own:

- Colors
- Typography
- Spacing
- Borders
- Radius
- Shadows
- Motion
- Layout rules
- Responsive behavior
- Components

Domain-specific components should be designed specifically for EduTech.

---

## 39. UX Principles

The interface should be:

- Modern
- Clear
- Fast to understand
- Action-oriented
- Consistent
- Responsive
- Accessible
- Suitable for frequent daily use

The UI should use progressive disclosure where appropriate.

Dashboards should be operational rather than overloaded with unnecessary analytics.

Tables should remain readable even when displaying dense data.

Scheduling interfaces should prioritize time and conflict visibility.

Business-critical actions should clearly communicate:

- What will happen
- Why it is allowed
- What conflicts exist
- What decision is required
- What has already happened

---

## 40. Core Product Principle

EduTech should not merely be a collection of CRUD screens.

The value of the system comes from connecting its workflows:

```text
Academic Term
      ↓
Class
      ↓
Enrollment
      ↓
Schedule
      ↓
Class Session
      ↓
Attendance
      ↓
Lesson Plan / Syllabus
      ↓
Exam
      ↓
Promotion
      ↓
Future Enrollment
      ↓
Teacher Attendance
      ↓
Payroll
```

Supporting workflows such as:

```text
Substitution
Tickets
Notifications
Imports
Audit
```

must integrate with the relevant core workflows rather than becoming isolated modules.

---

## 41. Product Quality Principle

EduTech should be built as a system that can be trusted with real educational operations.

When there is a choice between:

- A simpler but potentially unsafe shortcut
- A slightly more structured solution that preserves correctness, history, authorization, and auditability

the system should prefer the latter when the additional complexity is justified by the business risk.

At the same time, the project must avoid unnecessary abstraction and premature engineering.

The guiding principle is:

> Build a simple system, but do not build a fragile or dead-end system.

---

## 42. Implementation Reference Principle

The previous EduTech desktop project is a reference source, not the implementation foundation of the new web application.

The new system is a new implementation informed by:

- Existing business knowledge
- Previously validated domain rules
- Useful scheduling concepts
- Existing tests where applicable
- Lessons learned from the previous implementation

The new application must not inherit desktop-specific assumptions such as:

- Tauri
- SQLite
- Offline-first synchronization
- Local persistence architecture
- Desktop-only UI patterns
- Desktop-bound use cases

Reuse is a decision, not a goal.

---

## 43. Development Philosophy

The implementation should prioritize:

- Explicit business rules
- Strong backend authorization
- Clear domain boundaries
- Testable business logic
- Reliable transactions
- Explainable calculations
- Historical integrity
- Maintainable code
- Consistent UX

Complex business rules should be implemented in dedicated domain/application logic rather than scattered throughout controllers, React components, or database queries.

Simple CRUD operations should not be over-engineered merely for architectural purity.

---

## 44. Definition of a Successful MVP

The MVP is successful when an authorized Supervisor and Teacher can use EduTech to operate a real academic cycle from beginning to end:

1. Authenticate
2. Configure an Academic Term
3. Configure Books and educational structure
4. Import or create Students
5. Manage Teachers and Teacher Skills
6. Create Classes
7. Enroll Students
8. Generate or manually create a valid Schedule
9. Create Class Sessions
10. Record Teacher and Student Attendance
11. Manage Syllabus and Lesson Plans
12. Conduct Exams
13. Process Promotion
14. Handle Teacher Substitution
15. Resolve operational issues through Tickets
16. Calculate and review Payroll
17. Handle Private Classes
18. Receive relevant Notifications
19. Preserve an auditable history
20. Maintain reliable backups and recovery capabilities

The system should support this cycle without requiring manual database manipulation or bypassing its own business rules.

---

## 45. Guiding Principle

EduTech is a workflow system first and a CRUD application second.

The system should help people perform real educational work safely and efficiently.

Every major feature should therefore be evaluated not only by whether its data can be stored, but also by:

- Who can perform the action
- Under what conditions
- What business rules apply
- What historical information must be preserved
- What other workflows depend on the action
- Whether the action must be audited
- Whether the operation must be transactional
- How the user understands the result

The final product should feel like one coherent, modern educational operations platform rather than a collection of disconnected administrative pages.
