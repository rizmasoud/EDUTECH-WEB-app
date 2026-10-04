# EduTech — Frontend Architecture

## 1. Purpose

This document defines the frontend architecture of EduTech.

The frontend is responsible for:

- User interface
- User interaction
- Navigation
- Form handling
- Client-side usability validation
- Displaying server state
- Presenting business outcomes
- Providing responsive and accessible interfaces

The frontend is not responsible for:

- Direct database access
- Authoritative business rules
- Authorization enforcement
- Payroll calculation
- Promotion decisions
- Scheduling correctness
- Import integrity
- Historical data integrity

The backend remains the final authority for all business-critical behavior.

---

# 2. Frontend Technology

The frontend uses:

- Next.js
- React
- TypeScript

The application should use the current stable Next.js architecture selected during implementation.

The exact Next.js version and minor tooling choices are implementation decisions.

---

# 3. Frontend Architecture Principle

The frontend should be organized around features and user workflows rather than only technical file types.

The architecture should make it easy to answer:

- Where does this feature live?
- Which UI owns this behavior?
- Which API does it use?
- Which state belongs to the server?
- Which state is only UI state?
- Which operations are domain actions?

A conceptual structure is:

```text
Frontend
│
├── App / Routes
├── Features
├── Components
├── API Client
├── Server State
├── Forms
├── UI System
├── Authentication
└── Utilities
```

---

# 4. Route Architecture

Next.js routing should reflect the major areas of the application.

A conceptual route structure:

```text
/
├── login
│
└── app
    ├── dashboard
    │
    ├── academic
    │   ├── terms
    │   ├── books
    │   ├── syllabus
    │   ├── classes
    │   ├── schedules
    │   └── sessions
    │
    ├── people
    │   ├── students
    │   └── teachers
    │
    ├── education
    │   ├── exams
    │   ├── promotions
    │   └── lesson-plans
    │
    ├── operations
    │   ├── attendance
    │   ├── substitutions
    │   ├── tickets
    │   └── imports
    │
    ├── payroll
    │
    ├── notifications
    │
    └── audit
```

The exact URL hierarchy may be adjusted during implementation, but the application should retain clear functional separation.

---

# 5. Role-Based Navigation

The application currently has two roles:

- Supervisor
- Teacher

The UI should adapt navigation according to the user's effective permissions.

### Supervisor

Supervisor navigation may include:

```text
Dashboard
Academic
People
Education
Operations
Payroll
Notifications
Audit
```

### Teacher

Teacher navigation should remain lightweight:

```text
Dashboard
My Classes
Sessions
Attendance
Lesson Plans
Substitutions
Tickets
Notifications
```

A Teacher should not see administrative navigation that they cannot use.

However:

**Hiding navigation is not authorization.**

The backend must independently enforce permissions.

---

# 6. Dashboard Philosophy

Dashboards should be operational rather than analytical.

The dashboard should answer:

> What do I need to do now?

rather than:

> How much data exists in the system?

---

# 7. Supervisor Dashboard

The Supervisor dashboard may surface:

- Upcoming Sessions
- Pending Scheduling Proposals
- Pending Promotion Decisions
- Lesson Plans Awaiting Review
- Substitution Requests
- Open Tickets
- Recent Imports
- Payroll Status
- Important Notifications

The dashboard should prioritize actions requiring attention.

It should not become a large collection of unrelated statistics.

---

# 8. Teacher Dashboard

The Teacher dashboard should focus on the Teacher's own work.

Potential sections:

- Today's Sessions
- Upcoming Sessions
- Attendance to complete
- Lesson Plans
- Substitution Requests
- Open Tickets
- Payroll status
- Notifications

Teacher information must always be filtered according to backend authorization.

---

# 9. Feature-Based Organization

Features should encapsulate UI concerns for a domain area.

Examples:

```text
features/
├── auth/
├── students/
├── teachers/
├── books/
├── academic-terms/
├── classes/
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
└── audit/
```

A feature may contain:

- Components
- Hooks
- API functions
- Types
- Form schemas
- View-specific utilities

Business-critical domain logic must remain on the backend.

---

# 10. Shared Components

Reusable components should exist independently of individual features when they represent genuinely reusable UI concepts.

Examples:

```text
components/
├── ui/
├── layout/
├── navigation/
├── forms/
├── tables/
├── feedback/
├── dialogs/
└── data-display/
```

Examples of shared UI components:

- Button
- Input
- Select
- Dialog
- Dropdown
- Badge
- Table
- Pagination
- Date picker
- Time picker
- Empty state
- Loading state
- Error state
- Confirmation dialog

Shared components should not become a dumping ground for feature-specific business logic.

---

# 11. Design System

EduTech should have its own coherent design system.

The design language is inspired by three reference directions:

### Base Language

Notion-inspired principles:

- Clean hierarchy
- Strong typography
- Generous whitespace
- Document-like clarity
- Minimal visual noise
- Long-session usability

### Scheduling Language

Cal.com-inspired principles:

- Calendar-first interaction
- Clear time slots
- Scheduling grids
- Time-oriented information
- Strong visual distinction between availability and conflicts

### Data-Heavy Language

MongoDB-inspired principles:

- Dense but readable tables
- Clear statuses
- Technical/data-oriented presentation
- Strong information hierarchy
- Appropriate use of badges and structured metadata

These are references, not templates to copy.

EduTech must use a unified design system rather than looking like three separate products.

---

# 12. Design System Tokens

The implementation should define centralized design tokens for:

- Colors
- Typography
- Spacing
- Border radius
- Borders
- Shadows
- Motion
- Breakpoints
- Component states

The exact values should be defined during UI implementation.

Components should consume design tokens rather than repeatedly hard-coding visual values.

---

# 13. Layout

The primary application layout should support:

- Persistent navigation
- Main content area
- Page header
- Optional contextual actions
- Responsive behavior

A conceptual desktop layout:

```text
┌────────────────────────────────────────────────────┐
│ Top Bar                                             │
├───────────────┬────────────────────────────────────┤
│               │                                    │
│ Sidebar       │ Main Content                       │
│               │                                    │
│ Navigation    │ Page Header                        │
│               │                                    │
│               │ Page Content                        │
│               │                                    │
└───────────────┴────────────────────────────────────┘
```

The layout should support long-session desktop use while remaining usable on smaller screens.

---

# 14. Responsive Design

EduTech is desktop-first but must remain responsive.

Primary targets:

- Desktop
- Laptop
- Tablet
- Mobile where practical

The UI should not simply shrink desktop interfaces onto mobile screens.

Complex interfaces such as scheduling grids may require specialized responsive layouts.

---

# 15. Server State vs UI State

This distinction is fundamental.

## Server State

Data owned by the backend:

- Students
- Teachers
- Classes
- Sessions
- Attendance
- Lesson Plans
- Exams
- Promotions
- Substitutions
- Tickets
- Payroll
- Notifications

The frontend should fetch and synchronize this data with the backend.

---

## UI State

Temporary frontend state:

- Modal visibility
- Selected tab
- Temporary filter values
- Form draft values
- Table column visibility
- Local interaction state

UI state should not become an authoritative copy of backend data.

---

# 16. API Client

The frontend should communicate with NestJS through a centralized API client/service layer.

Avoid scattering raw HTTP calls throughout components.

Conceptually:

```text
React Component
      ↓
Feature Hook / Service
      ↓
API Client
      ↓
NestJS API
```

The API client is responsible for concerns such as:

- Base URL
- Authentication handling
- Request configuration
- Response parsing
- Error normalization
- Common headers
- Request correlation where appropriate

---

# 17. Data Fetching

The application should use a consistent strategy for server-state fetching and synchronization.

The exact library is an implementation decision.

If a server-state library is used, it should manage:

- Fetching
- Caching
- Refetching
- Mutation states
- Loading states
- Error states
- Cache invalidation

The frontend must not create an unnecessary second database-like cache.

---

# 18. Mutations

Mutations should represent meaningful user actions.

Examples:

```text
Create Student
Enroll Student
Assign Teacher
Submit Lesson Plan
Approve Lesson Plan
Record Attendance
Approve Substitution
Calculate Payroll
Finalize Payroll
```

After a mutation, affected server state should be revalidated or updated appropriately.

---

# 19. Forms

Forms should provide:

- Clear labels
- Helpful validation
- Appropriate input types
- Loading states
- Error states
- Success feedback
- Accessible controls

The frontend may perform immediate validation.

However, backend validation remains authoritative.

---

# 20. Form Validation

Frontend schemas may validate:

- Required fields
- Format
- Basic ranges
- User-friendly constraints

For example:

```text
Exam score:
0–100
```

The backend must perform the same authoritative validation.

The frontend must correctly display backend validation errors when they differ from client-side assumptions.

---

# 21. Error Handling

The UI should distinguish between:

### Validation Error

Example:

> Score must be between 0 and 100.

### Authorization Error

Example:

> You do not have permission to perform this action.

### Conflict

Example:

> This Teacher is no longer available at the selected time.

### Not Found

Example:

> The requested Class could not be found.

### Unexpected Error

Example:

> Something went wrong. Please try again.

Technical stack traces must never be shown to normal users.

---

# 22. Loading States

Every server-dependent UI should have an intentional loading state.

Examples:

- Skeleton
- Spinner
- Disabled action
- Loading row
- Progressive content

Loading states should preserve layout stability where practical.

---

# 23. Empty States

Empty states should explain what the user is seeing and, when appropriate, what action can be taken.

Example:

```text
No Lesson Plans yet.

Create a Lesson Plan for this Class to begin.
```

An empty database result should not automatically look like an error.

---

# 24. Confirmation for Destructive Actions

Potentially destructive or irreversible actions should require appropriate confirmation.

Examples:

- Cancelling a Class
- Cancelling a Session
- Rejecting a Promotion
- Finalizing Payroll
- Cancelling an Import

The confirmation should explain the consequence.

Finalization actions should be especially clear because they may lock future edits.

---

# 25. Tables

Tables are important in EduTech because many workflows are data-heavy.

Tables should support where appropriate:

- Pagination
- Search
- Filters
- Sorting
- Row actions
- Status badges
- Selection
- Empty state
- Loading state
- Error state

The frontend should use server-side pagination/filtering for large datasets.

---

# 26. Student Table

A Student list may show:

- Name
- Shahvar Code
- Current educational state
- Active status
- Current Class where relevant
- Actions

Unnecessary Shahvar information should not be displayed.

The UI should not become a mirror of the entire Shahvar system.

---

# 27. Teacher Table

A Teacher list may show:

- Name
- Active status
- Skills
- Account status
- Base Rate where authorized
- Current assignments

Sensitive payroll information must be restricted according to authorization.

---

# 28. Class Table

A Class list may show:

- Class
- Term
- Book
- Segment
- Teacher
- Type
- Capacity
- Enrollment count
- Status
- Schedule summary

The UI should provide quick access to Class details.

---

# 29. Scheduling UI

Scheduling is a major area where EduTech should use a specialized interaction model.

The scheduling interface should make it easy to understand:

- Day
- Time
- Class
- Teacher
- Conflicts
- Availability
- Preferences
- Proposal state

A calendar/grid interaction should be preferred over a simple list when time relationships matter.

---

# 30. Scheduling Proposal Review

A Proposal Review interface should show:

```text
Proposal Status
↓
Classes
↓
Suggested Times
↓
Conflicts
↓
Preferences
↓
Explanations
↓
Accept / Modify / Reject
```

The Supervisor should understand why the system made a recommendation.

The UI must not display an unexplained numerical score as if it were self-evident.

---

# 31. Calendar Interaction

Calendar interfaces should distinguish:

- Available
- Scheduled
- Conflict
- Preferred
- Selected
- Unavailable

The visual system should remain coherent with the rest of EduTech.

---

# 32. Session UI

A Session page should make the most common actions fast.

Potential structure:

```text
Session Header
├── Date / Time
├── Class
├── Teacher
└── Status

Main
├── Student Attendance
├── Lesson Plan
└── Session Actions
```

The most frequent operation, Attendance, should not require excessive navigation.

---

# 33. Attendance UI

Attendance should support fast interaction.

A typical interface:

```text
Student                 Status

Student A               Present
Student B               Absent
Student C               Late
Student D               Excused
```

The Teacher should be able to record attendance efficiently.

The UI must not offer direct deletion when the backend workflow requires correction through a Ticket.

---

# 34. Lesson Plan UI

The Teacher should be able to:

1. View Syllabus requirements.
2. Create a Lesson Plan.
3. Add relevant items.
4. Save as Draft.
5. Submit.
6. Track Supervisor result.
7. Mark appropriate items completed.

The Supervisor should be able to:

- Review
- Approve
- Reject
- Understand completion state

---

# 35. Promotion UI

Promotion should make the decision state immediately understandable.

Examples:

```text
70–100
Automatic Promotion
```

```text
60–69
Supervisor Decision Required
```

```text
Below 60
Supervisor Decision Required
```

For pending cases, the UI should clearly show:

- Student
- Current Book
- Score
- Exam
- Possible decisions
- Decision status

Automatic promotions must not present a fake approval button.

---

# 36. Substitution UI

The substitution interface should clearly distinguish:

- Request
- Eligible Teachers
- Responses
- Selected Teacher
- Final Approval
- Emergency status

A Teacher should see requests they are eligible to respond to.

A Supervisor should see the complete decision context.

---

# 37. Ticket UI

Tickets should feel like structured operational cases rather than a chat application.

A Ticket page may contain:

```text
Ticket Header
├── Type
├── Status
├── Created By
├── Assigned To
└── Related Entity

Conversation / Messages

Attachments

Actions
```

The UI should preserve the distinction between Ticket messages and system AuditLog entries.

---

# 38. Payroll UI

Payroll should prioritize explainability.

A Teacher or Supervisor viewing Payroll should be able to understand:

```text
Payroll Total

Session Payments
  quantity × rate = amount

Syllabus Completion
  quantity × rate = amount

Private Classes
  quantity × rate = amount

Substitution
  quantity × rate = amount

Adjustments
  amount

-------------------
Final Total
```

Exact visibility depends on role and permissions.

---

# 39. Payroll Finalization UI

Finalization should clearly communicate that the operation has consequences.

Example:

```text
Finalize Payroll?

After finalization, normal payroll editing will be locked.
Future corrections require an explicit correction workflow.

[Cancel] [Finalize Payroll]
```

The UI must not hide irreversible or locking behavior.

---

# 40. Import Wizard

Shahvar Import should use a guided multi-step interface.

Suggested structure:

```text
1. Upload
2. Parse
3. Validate
4. Match
5. Preview
6. Review
7. Commit
8. Result
```

The current step should be clearly visible.

---

# 41. Import Preview

The Preview should distinguish:

- New Students
- Existing Students
- New Classes
- New Enrollments
- Warnings
- Errors
- Ambiguous Matches

The Supervisor should be able to understand what will happen before committing.

---

# 42. Notifications UI

Notifications should be accessible from the main application shell.

A notification indicator may show unread count.

The Notification Center should support:

- Unread/read distinction
- Timestamp
- Notification type
- Related resource
- Navigation to relevant entity

Notifications should not expose unnecessary sensitive information.

---

# 43. Audit UI

Audit is primarily an administrative inspection tool.

It may support:

- Filtering by entity
- Filtering by actor
- Filtering by action
- Date filtering
- Viewing metadata

Audit entries should be read-only.

The interface should make historical activity understandable without exposing unnecessary technical internals.

---

# 44. Authentication UI

The Login page should remain simple.

Required:

- Personnel Code
- Password
- Submit
- Clear validation
- Loading state
- Authentication error

The UI should not reveal whether an unknown Personnel Code or an incorrect password caused the fai
