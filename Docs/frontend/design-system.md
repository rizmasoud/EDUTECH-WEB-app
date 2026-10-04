# EduTech — Design System & UI Specification

## 1. Purpose

This document defines the visual language, interaction principles, reusable UI patterns, and design system for EduTech.

The purpose is to ensure that EduTech feels like one coherent product rather than a collection of unrelated screens.

The design system should support:

- clarity
- fast daily operation
- low cognitive load
- consistent interaction
- data-heavy workflows
- scheduling workflows
- responsive behavior
- accessibility
- maintainability

The system should be modern and polished without becoming visually decorative or unnecessarily complex.

---

# 2. Design Direction

EduTech should use a unified design language inspired by several established interaction patterns.

The references are divided by responsibility rather than copied as complete design systems.

### Notion

Notion is the primary reference for the general product language.

Use it as inspiration for:

- layout
- typography
- whitespace
- hierarchy
- document-like interfaces
- navigation
- forms
- content organization
- clean surfaces
- long-session usability

### Cal.com

Cal.com is the primary interaction reference for scheduling-related interfaces.

Use it as inspiration for:

- calendars
- time grids
- scheduling controls
- time-slot interactions
- schedule visualization
- event/session management
- calendar-oriented workflows

### MongoDB

MongoDB is a reference for data-heavy and technical interfaces.

Use it as inspiration for:

- dense data tables
- technical information
- status badges
- filters
- structured data presentation
- operational interfaces
- developer/data-oriented visual hierarchy

### EduTech

EduTech must have its own identity.

EduTech-specific components and visual decisions should be created for:

- academic workflows
- class management
- lesson plans
- attendance
- promotion
- substitution
- payroll
- Shahvar import
- educational statuses

The final product should not look like three unrelated products combined together.

---

# 3. Core Design Principle

The design system follows:

```text
Notion-inspired Base Language
        +
Cal.com-inspired Scheduling Interaction
        +
MongoDB-inspired Data Presentation
        +
EduTech-specific Components
        =
EduTech Design System
```

The references provide patterns and inspiration.

They are not templates to copy directly.

Marketing-page structures, branding, logos, exact visual assets, or proprietary design tokens should not be copied.

---

# 4. Product Personality

EduTech should feel:

- calm
- professional
- modern
- organized
- trustworthy
- efficient
- lightweight
- operational

It should not feel:

- overly corporate
- flashy
- playful to the point of distraction
- visually crowded
- unnecessarily futuristic
- like an old administrative system
- like a developer dashboard everywhere

The interface should prioritize completing work over showing visual effects.

---

# 5. Visual Hierarchy

Every screen should have an obvious hierarchy.

Typical hierarchy:

```text
Page
  |
  +-- Page Header
  |     +-- Title
  |     +-- Description
  |     +-- Primary Action
  |
  +-- Filters / Context
  |
  +-- Main Content
  |
  +-- Secondary Information
```

The most important action should be visually identifiable without overwhelming the rest of the interface.

Secondary actions should remain available without competing with the primary action.

---

# 6. Layout Principles

The interface should use generous but controlled whitespace.

Avoid:

- excessive empty space
- excessive density
- arbitrary spacing
- inconsistent margins
- large decorative areas that reduce useful workspace

Content should remain visually grouped.

Related elements should appear closer together.

Unrelated sections should have stronger separation.

---

# 7. Application Shell

The primary application shell should contain:

- Sidebar navigation
- Main content area
- Page header
- Optional contextual actions
- Optional notification/account area

Conceptually:

```text
+------------------------------------------------------+
| Sidebar | Page Header                                |
|         +--------------------------------------------+
|         |                                            |
|         | Main Content                               |
|         |                                            |
|         |                                            |
|         +--------------------------------------------+
+------------------------------------------------------+
```

The shell should remain stable while the user moves between major workflows.

Navigation should not visually dominate the application.

---

# 8. Sidebar

The Sidebar should provide access to major application areas.

Supervisor navigation may include:

```text
Dashboard

Academic
  Terms
  Books
  Syllabus
  Classes
  Schedule
  Sessions

People
  Students
  Teachers

Education
  Exams
  Promotions
  Lesson Plans

Operations
  Attendance
  Substitutions
  Tickets
  Imports

Payroll

Notifications

Audit
```

Teacher navigation should be significantly lighter and focused on the Teacher's own work.

The UI should not expose navigation items that the current user cannot access.

However, navigation visibility is not a security mechanism.

---

# 9. Page Headers

Page headers should provide:

- title
- concise description when useful
- contextual information
- primary action
- secondary actions where appropriate

Example:

```text
Students
Manage students and their academic enrollment history.

[Import Students] [Add Student]
```

Avoid unnecessary descriptions when the page purpose is already obvious.

---

# 10. Typography

Typography should prioritize readability and hierarchy.

Use a small number of text styles rather than many arbitrary sizes.

Suggested conceptual hierarchy:

```text
Display
Page Title
Section Heading
Subsection Heading
Body
Secondary
Caption
Label
```

Typography should distinguish:

- primary content
- supporting information
- metadata
- status
- actions

The system should remain readable for long work sessions.

---

# 11. Color System

The color system should be restrained.

Use neutral colors as the primary foundation.

Semantic colors should communicate state:

```text
Success
Warning
Error
Info
Neutral
```

Colors should not be used merely for decoration.

For example:

- green indicates a successful/positive state
- amber indicates attention or warning
- red indicates an error or destructive condition
- blue or another accent may indicate informational/interactive state

Semantic meaning should not depend on color alone.

---

# 12. Design Tokens

The design system should define reusable tokens for:

- colors
- typography
- spacing
- border radius
- borders
- shadows
- motion
- breakpoints
- component dimensions

Components should consume design tokens rather than hard-coded values scattered throughout the application.

Example conceptual token groups:

```text
color.*
font.*
space.*
radius.*
border.*
shadow.*
motion.*
breakpoint.*
```

Exact values can be refined during implementation.

---

# 13. Spacing

Spacing should follow a consistent scale.

The system should avoid arbitrary one-off spacing values.

Spacing should communicate hierarchy:

- small spacing for related controls
- medium spacing between groups
- larger spacing between major sections

Forms, cards, tables, and dashboards should use the same spacing system.

---

# 14. Borders and Surfaces

Surfaces should remain visually lightweight.

Prefer:

- subtle borders
- restrained shadows
- clear grouping
- neutral backgrounds

Avoid excessive:

- card nesting
- heavy shadows
- thick borders
- gradients
- decorative containers

Not every piece of content needs to be inside a card.

A section can use typography and spacing alone to establish hierarchy.

---

# 15. Border Radius

Border radius should be consistent across the system.

Use:

- smaller radius for compact controls
- medium radius for cards and panels
- larger radius only where it provides meaningful visual distinction

Do not use excessive rounding everywhere.

The interface should feel professional rather than playful.

---

# 16. Buttons

Buttons should communicate hierarchy.

Primary action:

- visually prominent
- used for the main task

Secondary action:

- less prominent
- used for supporting actions

Tertiary action:

- minimal visual weight
- used for low-priority actions

Destructive action:

- visually distinct
- requires appropriate confirmation for consequential operations

Examples:

```text
[Create Class]
[Save Changes]
[Submit Lesson Plan]
```

versus:

```text
[Cancel]
[Back]
[View Details]
```

---

# 17. Forms

Forms should be task-oriented.

Each form should provide:

- clear labels
- appropriate input controls
- validation
- useful error messages
- required/optional indication
- sensible defaults
- submit state
- cancellation path when appropriate

Avoid forcing users to fill fields that are not required for the current workflow.

Long forms should be divided into meaningful sections.

---

# 18. Form Validation

Validation should exist at multiple layers.

### Frontend

Provides immediate feedback.

### API DTO

Validates incoming request structure.

### Domain

Enforces business rules.

### Database

Protects structural integrity.

The frontend must not assume that passing frontend validation guarantees success.

---

# 19. Tables

Tables are important because EduTech contains significant operational data.

Tables should support:

- clear column hierarchy
- sorting
- filtering
- pagination
- search
- status indicators
- row actions
- responsive behavior where practical

Tables should avoid unnecessary visual density.

Important information should remain visible without requiring excessive horizontal scrolling.

---

# 20. Data-Dense Interfaces

Data-heavy pages should use patterns inspired by technical/data-oriented interfaces such as MongoDB.

Useful patterns include:

- compact metadata
- status badges
- structured filters
- table views
- contextual actions
- clear data types
- predictable column alignment

However, EduTech should not make every screen look like a database administration console.

The visual density should depend on the task.

---

# 21. Status Badges

Status badges should provide quick recognition.

Examples:

```text
ACTIVE
DRAFT
COMPLETED
CANCELLED
PENDING REVIEW
APPROVED
REJECTED
FINALIZED
```

Badges should:

- use consistent semantic colors
- remain readable
- avoid excessive decoration
- use text rather than color alone

---

# 22. Empty States

Empty states should explain what is happening and what the user can do next.

Example:

```text
No classes yet

Create a class to start building your academic schedule.

[Create Class]
```

Avoid empty states that merely say:

```text
No data
```

The user should understand whether the absence is:

- expected
- caused by filtering
- caused by missing setup
- something that requires action

---

# 23. Loading States

Loading states should communicate progress without unnecessary animation.

Use:

- skeletons for larger content areas
- inline loading for small operations
- button loading states for mutations

Do not block the entire interface for a small background operation.

---

# 24. Error States

Errors should be actionable when possible.

Instead of:

```text
Something went wrong.
```

prefer:

```text
The class could not be scheduled because the assigned teacher already has another class at this time.

[Review Schedule]
```

Technical details should be hidden unless they help the user resolve the problem.

---

# 25. Confirmation Dialogs

Confirmation should be used for consequential actions.

Examples:

- deleting or deactivating important records
- cancelling a class
- finalizing payroll
- approving sensitive corrections
- committing an import
- rejecting a lesson plan

Do not require confirmation for every small action.

The dialog should clearly state:

- what will happen
- whether the action is reversible
- what the user is confirming

---

# 26. Notifications

Notifications should be lightweight and contextual.

Use:

- toast notifications for immediate operation feedback
- Notification Center for persistent operational events
- inline messages for form-specific errors

Do not use toasts for information that the user needs to reference later.

Examples:

```text
Lesson plan submitted successfully.
```

or:

```text
Import completed with 4 warnings.
View import results.
```

---

# 27. Dashboard Design

The Dashboard should be operational rather than a BI platform.

The goal is to answer:

- What needs attention?
- What is happening today?
- What actions are pending?
- What important workflow is blocked?

Avoid filling the dashboard with metrics that do not lead to useful actions.

---

# 28. Supervisor Dashboard

A Supervisor dashboard may contain:

- today's sessions
- pending scheduling proposals
- pending lesson plan reviews
- promotion decisions requiring attention
- substitution requests
- open tickets
- import status
- payroll status
- important notifications

The dashboard should prioritize actionable information.

---

# 29. Teacher Dashboard

The Teacher dashboard should be intentionally lightweight.

It may include:

- today's classes
- upcoming sessions
- attendance actions
- lesson plan status
- substitution requests
- tickets
- notifications
- relevant payroll information

The Teacher should not see unnecessary administrative data.

---

# 30. Calendar and Scheduling UI

Scheduling interfaces should be strongly influenced by calendar-first systems such as Cal.com.

The scheduling experience should make time relationships visually obvious.

Useful interfaces include:

- weekly calendar
- daily schedule
- time-slot grid
- class schedule cards
- conflict indicators
- proposal comparison
- schedule filters

The calendar should prioritize operational clarity over decorative design.

---

# 31. Schedule Grid

The schedule grid should make it easy to identify:

- class
- teacher
- time
- day
- conflicts
- session state

Example conceptual structure:

```text
        Sun       Mon       Tue       Wed       Thu
08:00   Class A             Class B             Class C
09:00   Class A             Class B
10:00                         Class D
```

Conflicts should be visually obvious.

The user should not need to inspect every class manually to discover a scheduling collision.

---

# 32. Scheduling Proposal Review

Proposal review should explain why a schedule was generated.

The interface may show:

```text
Proposal
-------------------------
Classes: 14
Conflicts: 0

Hard constraints
✓ No teacher overlaps
✓ Friday closed
✓ Teacher skills valid

Preferences
✓ Thursday morning preference
✓ Balanced distribution
```

The Supervisor should be able to:

- accept
- modify
- reject

The UI should not hide important constraints behind unexplained scores.

---

# 33. Class Interface

The Class detail page should provide a clear overview.

Possible sections:

```text
Class Overview
Students
Teacher
Book
Segment
Schedule
Sessions
Attendance
Lesson Plan
Exam
Substitution History
Audit / History
```

The interface should distinguish current state from historical information.

---

# 34. Student Interface

Student details should focus on educational information.

Useful sections:

```text
Profile
Current Enrollment
Academic History
Books / Promotions
Attendance History
Exam Results
Related Classes
```

Unnecessary personal information should not be displayed merely because it exists elsewhere.

---

# 35. Teacher Interface

Teacher details should include:

```text
Profile
Account Status
Skills
Assigned Classes
Sessions
Attendance
Lesson Plans
Substitutions
Payroll
Tickets
```

Sensitive information should be shown only to authorized users.

---

# 36. Attendance Interface

Attendance should be optimized for speed.

A typical session view should allow the Teacher to quickly see:

```text
Student             Attendance

Student A           Present
Student B           Present
Student C           Absent
Student D           Late
Student E           Excused
```

The interface should minimize unnecessary navigation.

The Teacher should not have to open each Student individually.

---

# 37. Lesson Plan Interface

The Lesson Plan UI should visually connect the Teacher's plan to the canonical Syllabus.

Conceptually:

```text
Syllabus Requirement
        |
        v
Lesson Plan Item
        |
        v
Completion
```

The Teacher should be able to:

- view requirements
- create plan items
- describe execution
- mark completion
- submit the plan

The Supervisor should be able to review and approve/reject.

---

# 38. Promotion Interface

Promotion screens should clearly explain the result.

For example:

```text
Student: Example Student
Exam Score: 74

Promotion:
Automatic

Next Book:
Book 4
```

For a conditional result:

```text
Student: Example Student
Exam Score: 65

Decision Required

[Promote]
[Do Not Promote]
```

For a terminal Book:

```text
Status:
Terminal Completion
```

The UI must reflect the actual backend policy.

---

# 39. Substitution Interface

Substitution should clearly distinguish:

- original Teacher
- requested Session
- eligible Teachers
- responses
- selected Teacher
- Supervisor approval
- final actual Teacher

Example:

```text
Session
Wednesday — 10:00

Original Teacher
Teacher A

Eligible Teachers
Teacher B     Accepted
Teacher C     Declined

Selected
Teacher B

[Approve Substitution]
```

Emergency substitution should be visually distinct from normal approval.

---

# 40. Ticket Interface

Tickets should resemble an operational conversation without becoming a full chat application.

The interface should contain:

```text
Ticket
  Title
  Status
  Type
  Created By
  Assigned To

Description

Messages

Attachments

Related Entity

Actions
```

The user should be able to understand the issue and its history without navigating across multiple screens.

---

# 41. Payroll Interface

Payroll should emphasize transparency.

The main view should show:

```text
Teacher
Academic Term
Status
Total
```

The detail view should show:

```text
Payroll Item              Quantity    Rate    Amount
-----------------------------------------------------
Sessions                    18         ...      ...
Syllabus Completion          6         ...      ...
Private Classes              2         ...      ...
Substitution                 1         ...      ...
Adjustment                   1         ...      ...
-----------------------------------------------------
Total                                           ...
```

The exact formulas remain controlled by the Payroll Policy.

The UI should explain the basis of each amount.

---

# 42. Import Wizard

The Shahvar import should use a step-based interface.

Recommended flow:

```text
1. Upload
2. Parse
3. Validate
4. Match
5. Preview
6. Review
7. Commit
8. Results
```

The user should be able to identify:

- successful rows
- warnings
- errors
- ambiguous matches
- created records
- updated records
- skipped records

The Commit action should be visually distinct because it creates persistent changes.

---

# 43. Audit Interface

Audit logs are primarily for operational traceability.

The UI should support:

- filtering by actor
- entity
- action
- date
- relevant event type

Audit records should remain read-only.

The interface should favor structured information over visual decoration.

---

# 44. Responsive Design

EduTech is desktop-first but responsive.

The main desktop experience should support:

- wide tables
- calendars
- multi-column layouts
- operational dashboards

Tablet and mobile layouts should remain usable for relevant workflows.

Responsive design should not simply shrink desktop screens.

Components should adapt according to their function.

---

# 45. Mobile Priorities

On smaller screens, prioritize:

- today's sessions
- attendance
- lesson plans
- substitution requests
- tickets
- notifications
- essential student/class information

Large data tables may use:

- horizontal scrolling
- column prioritization
- row expansion
- alternate card representations

---

# 46. Accessibility

The UI should follow practical accessibility principles.

Requirements include:

- keyboard accessibility
- visible focus states
- semantic HTML
- accessible labels
- sufficient contrast
- meaningful error messages
- non-color-only status communication
- accessible dialogs
- accessible tables
- appropriate form semantics

Accessibility should be considered during component design rather than added at the end.

---

# 47. Motion

Motion should be subtle and purposeful.

Use animation for:

- state changes
- navigation feedback
- loading
- opening/closing contextual UI
- confirmation of important interactions

Avoid:

- decorative animation
- excessive transitions
- distracting movement
- long animations

The application is an operational tool, not a marketing site.

---

# 48. Responsive Navigation

On desktop:

```text
Persistent Sidebar
```

On smaller screens:

```text
Collapsed / Drawer Navigation
```

The navigation should remain easy to access without consuming most of the viewport.

---

# 49. URL State

Where appropriate, important UI state should be reflected in the URL.

Examples:

```text
/students?search=ali&status=active
/classes?term=...
/schedule?date=...
/tickets?status=open
```

This improves:

- bookmarking
- navigation
- browser history
- sharing within authorized users
- restoring page state

Sensitive information must not be placed in URLs.

---

# 50. Unsaved Changes

Forms with meaningful unsaved changes should warn users before navigation when appropriate.

The warning should not appear for trivial interactions.

Examples where protection may be useful:

- Lesson Plan editing
- Syllabus editing
- Class configuration
- Payroll review
- complex import mapping

---

# 51. Optimistic UI

Optimistic updates should be used selectively.

Appropriate candidates may include:

- marking notifications as read
- lightweight UI preferences

Avoid optimistic updates for business-critical operations such as:

- payroll finalization
- promotion decisions
- attendance corrections
- substitution approval
- import commit

For these operations, confirmed backend results should drive the UI state.

---

# 52. Permission-Aware UI

The frontend should adapt to the current user's role and resource scope.

Examples:

A Teacher should not see:

- Supervisor-only navigation
- global payroll controls
- audit management
- other Teachers' private administrative information

A Supervisor may see broader management interfaces.

However:

> Hiding a button is not authorization.

Every protected operation must still be enforced by the backend.

---

# 53. Business Logic Boundary

The frontend may contain presentation logic such as:

- formatting
- sorting already-loaded data
- UI state
- visual filtering
- component behavior

The frontend must not become the authoritative source for:

- promotion rules
- payroll calculations
- scheduling validity
- capacity rules
- substitution eligibility
- authorization
- import matching decisions

Those belong to the backend.

---

# 54. Design System Components

The UI should gradually build a reusable component library.

Potential categories:

### Layout

- AppShell
- Sidebar
- PageHeader
- Section
- Stack
- Grid

### Inputs

- Input
- Select
- Combobox
- DatePicker
- TimePicker
- Checkbox
- Radio
- Textarea

### Feedback

- Alert
- Toast
- Dialog
- ConfirmationDialog
- EmptyState
- Skeleton
- ErrorState

### Data

- Table
- Pagination
- FilterBar
- StatusBadge
- DataCard
- DetailList

### Workflow

- Stepper
- Timeline
- ApprovalPanel
- ReviewPanel
- ActivityList

### Scheduling

- Calendar
- TimeGrid
- ScheduleCard
- ConflictIndicator
- ProposalReview

### EduTech-specific

- AttendanceGrid
- LessonPlanEditor
- PromotionDecisionPanel
- SubstitutionRequestPanel
- PayrollBreakdown
- ImportReviewTable

---

# 55. Component Design Principles

Components should be:

- reusable
- predictable
- accessible
- composable
- visually consistent

Avoid creating a component for every tiny visual variation.

Prefer composition over large components with dozens of boolean properties.

For example, avoid:

```text
<SuperTable
  isPayroll
  isStudent
  isTeacher
  isCompact
  isDark
  ...
/>
```

Prefer smaller composable primitives and domain-specific wrappers.

---

# 56. Domain Components

Some components are intentionally domain-specific.

Examples:

```text
AttendanceGrid
PayrollBreakdown
PromotionDecisionPanel
SchedulingProposalReview
ImportMatchReview
```

These components may understand domain concepts at the UI level.

However, they must consume backend decisions rather than reimplementing domain policies.

---

# 57. Data Fetching

The frontend should distinguish:

### Server State

Data owned by the backend:

- Students
- Classes
- Sessions
- Attendance
- Payroll
- Notifications
- Tickets

### UI State

Local interaction state:

- dialog open/closed
- selected row
- active tab
- temporary form state
- local filters before submission

Server state should not be duplicated unnecessarily into global client state.

---

# 58. API Client

The frontend should communicate with NestJS through a dedicated API client/service layer.

Components should not contain arbitrary raw HTTP calls everywhere.

Conceptually:

```text
UI
 |
 v
Feature Hook / Service
 |
 v
API Client
 |
 v
NestJS API
```

This keeps API interaction consistent and easier to change.

---

# 59. Error Mapping

Backend error codes should be mapped to useful UI behavior.

For example:

```text
CLASS_CAPACITY_EXCEEDED
    ->
"Class capacity has been reached."
```

```text
TEACHER_SCHEDULE_CONFLICT
    ->
"The selected teacher already has a session at this time."
```

The frontend should not parse arbitrary backend error strings to determine behavior.

Stable error codes should be preferred.

---

# 60. Localization Readiness

The application should be designed so that localization can be introduced without rewriting the UI.

Important considerations include:

- text should not be hard-coded into layout assumptions
- dates should use locale-aware formatting
- numbers should use locale-aware formatting
- RTL should remain possible
- Persian language support should remain feasible

The initial implementation may choose a specific default locale, but components should not make localization structurally difficult.

---

# 61. Performance

Performance should focus on real workflows.

Important areas include:

- large student tables
- class lists
- schedule views
- attendance grids
- import results
- payroll tables
- notification lists

Use:

- pagination
- server-side filtering
- selective data loading
- appropriate caching
- virtualization when justified

Do not optimize prematurely.

Measure actual bottlenecks before introducing complexity.

---

# 62. Security in the UI

The frontend should:

- avoid storing sensitive secrets unnecessarily
- avoid exposing private storage keys
- avoid rendering unauthorized resources
- avoid trusting client-side role state
- handle expired sessions gracefully
- avoid leaking sensitive data through URLs
- avoid displaying sensitive information in notifications unnecessarily

Security remains enforced by the backend.

---

# 63. Visual Consistency

Every new feature should use existing design-system primitives where possible.

Before creating a new visual pattern, determine whether an existing component can represent the same interaction.

The goal is to prevent:

```text
Screen A -> one style of dialog
Screen B -> another dialog
Screen C -> third dialog
```

Instead:

```text
EduTech Dialog
    -> consistent behavior everywhere
```

---

# 64. When to Create New Components

Create a reusable component when:

- the pattern appears multiple times
- it has meaningful behavior
- consistency matters
- accessibility would otherwise be duplicated
- the interaction is domain-specific enough to justify reuse

Do not extract components solely because a file became slightly long.

---

# 65. Design Review Checklist

Before considering a new screen complete, verify:

### Structure

- Is the primary task obvious?
- Is the hierarchy clear?
- Is unnecessary information removed?

### Interaction

- Are primary and secondary actions distinguishable?
- Are destructive actions protected?
- Are loading and error states handled?

### Data

- Is the correct information visible?
- Is filtering/search available when needed?
- Is empty state meaningful?

### Authorization

- Is the UI appropriate for the current role?
- Are resource-level restrictions reflected?

### Accessibility

- Can the screen be navigated by keyboard?
- Are controls labeled?
- Is state communicated without color alone?

### Responsive behavior

- Does the screen remain usable on smaller screens?
- Are tables/calendars handled appropriately?

### Consistency

- Are existing design-system components reused?
- Are spacing, typography, borders, and statuses consistent?

---

# 66. Design System Evolution

The design system should evolve from real product usage.

Do not attempt to design every possible component before implementation.

Start with the components required for the MVP and expand the system as repeated patterns emerge.

When a new component is added, consider whether it should become a reusable system component.

Avoid premature abstraction.

---

# 67. Final Design Principles

EduTech's visual system should follow these principles:

1. **Clarity over decoration**
2. **Consistency over novelty**
3. **Task completion over visual spectacle**
4. **Notion-inspired general UI**
5. **Cal.com-inspired scheduling interaction**
6. **MongoDB-inspired data-heavy presentation**
7. **EduTech-specific domain components**
8. **Responsive by design**
9. **Accessible by default**
10. **Backend remains the authority**
11. **Reuse components before creating new patterns**
12. **Do not over-engineer the design system**

The final result should feel like a single, modern educational operations product.

It should not feel like Notion, Cal.com, or MongoDB with EduTech data inserted into them.

It should feel like **EduTech**.
