# EduTech — MVP Scope (Authoritative)

**Status:** Authoritative for scope decisions recorded below. Created 2026-10-28.
**Based on:** repository state at `main` commit `18f9ffd`.

## 1. Purpose and Precedence

This document is the single authoritative record of the approved EduTech MVP boundary and of the product-owner decisions that changed or clarified it.

It does not replace the detailed specifications. Requirement text stays in its source documents; this file records what is in scope, what is excluded, and what is still undecided, and points to the source for each item.

Precedence for scope questions:

1. Decisions recorded in section 3 of this document (approved by the product owner).
2. `Docs/product/product-specification.md` (PS) and `Docs/business/business-rules.md` (BR-B).
3. `Docs/EDUTECH-BUSINESS-RULES.md` (BR-A) and `Docs/EDUTECH-MVP-ROADMAP.md` (RM).

Existing code and earlier AI-generated checklists are not evidence of an agreed requirement.

## 2. Status Vocabulary

- **Approved:** explicitly approved by the product owner on the date shown.
- **Documented MVP:** listed as MVP in a source document and not contradicted by a later decision.
- **Post-MVP / excluded:** outside the current MVP.
- **Unresolved:** no approved decision exists; it must not be implemented or described as a requirement.

## 3. Approved Decisions (2026-10-28)

### D1 — Student book/level placement (Approved 2026-10-28)

A student must have a book/level placement as part of student creation.

Conflict resolved: BR-A `BR-STU-001` (confirmed requirement) versus PS §9 "Students", whose conceptual student contains no book or level. The product owner decision is that BR-STU-001 applies. PS §9 is read as amended by this decision for the placement requirement only; its other content, including the list of excluded student information (phone, age, date of birth, financial debt and discounts), is unchanged.

Not decided by D1 (remain unresolved, see section 6): whether the placement is a single current book/level or derived from history, whether it is mandatory for imported students, and how it relates to the book sequence (BR-A `BR-BOOK-002`).

### D2 — Teacher accounts and security (Approved 2026-10-28)

- The supervisor must be able to create teacher login accounts.
- Teachers may access only data they are authorized to see. This is enforced by backend API authorization, not by hiding UI elements (BR-A `BR-SEC-001`; BR-B §26.4; `Docs/api/api-specification.md` §9).
- Teachers must not be shown teachers' base salary / pay rates unless a future explicit decision authorizes it.

Effect on PS §3.2: the bullet "View relevant payroll information according to the authorization policy" is not authorization for teachers to see pay rates. Until a later decision defines a teacher-visible payroll view, no pay information is exposed to teacher accounts.

Not decided by D2: personnel-code format, who sets or resets initial passwords, password policy, and the exact set of data each teacher may read (see section 6).

### D3 — MVP boundary (Approved 2026-10-28)

The MVP is the documented core educational management scope (PS §33, PS §44), including class sessions, student and teacher attendance, session-level teacher substitution, and teacher payroll.

Outside the current MVP: student tuition/payment/accounting, analytical reports, and Settings.

This resolves RM §4, which left the final MVP boundary to be agreed.

### D4 — Six-month inactivity rule (Not approved)

The rule that students become inactive after six months without a qualifying new enrollment is **unconfirmed**. No document in the repository defines it. It must not be implemented or treated as a requirement until the product owner supplies and approves the exact trigger and behavior.

## 4. Confirmed MVP Scope

Sources: PS §33 "MVP Scope" and PS §44 "Definition of a Successful MVP" unless stated.

- Authentication, roles (`SUPERVISOR`, `TEACHER`) and authorization (PS §4, §5; BR-B §26)
- Academic terms; books and book structure
- Students, including book/level placement at creation (D1)
- Teachers, teacher skills, and teacher login accounts (D2)
- Shahvar import
- Classes, including regular and private classes, and teacher assignment
- Enrollments and enrollment history (PS §13)
- Scheduling and scheduling proposals
- Class sessions
- Student attendance and teacher attendance
- Syllabus, lesson plans, exams, exam results, promotion
- Session-level teacher substitution (PS §25; BR-B §19)
- Tickets and ticket attachments
- Payroll, including per-teacher base rate (PS §27; BR-B §21) — supervisor-controlled; rates not exposed to teachers (D2)
- In-app notifications
- Audit logs; backup and recovery capabilities

Each item keeps its detailed requirements in the source documents above. Implementation status is tracked in `Docs/EDUTECH-CURRENT-STATE.md`, not here.

## 5. Post-MVP and Excluded

- Student tuition, payments, debt, discounts, and any accounting system (D3; PS §9, PS §34)
- Analytical / advanced BI reports (D3; PS §34)
- Settings page (D3)
- Full chat, student portal, parent portal, CRM, online payment, SMS, email notification infrastructure, Shahvar replacement, advanced task management, advanced notes, native mobile applications, microservice decomposition, offline-first synchronization, real-time WebSocket infrastructure (PS §34; BR-B §34)
- Secretary role (PS §4; BR-B §26.2)

## 6. Unresolved Questions and Source Conflicts

These are not resolved by D1–D4 and must not be treated as approved.

| # | Item | Sources | Needed |
|---|---|---|---|
| U1 | Six-month inactivity rule and any student enrollment date (D4) | None found | Original text, exact trigger, automatic or supervisor-confirmed |
| U2 | Teacher unavailable times: required by BR-A `BR-SCHED-001` and RM §3.E; absent from PS §14–16 and BR-B §10 apart from the default Friday rule | BR-A; RM; PS; BR-B | Confirm requirement, owner, recurrence and whether it applies to rooms |
| U3 | Student placement model (single current level or derived), mandatory for imports, relation to book sequence | BR-A `BR-STU-001`, `BR-BOOK-002` | Product-owner decision |
| U4 | Teacher account provisioning details: personnel-code format, initial/reset password handling, password policy | PS §5; BR-B §26.1 | Product-owner decision |
| U5 | Exact teacher read scope for students, classes and own pay (PS §3.2 "relevant payroll information") | PS §3.2; BR-B §26.4; API §25 | Define per-resource rules |
| U6 | Supervisor who also teaches: separate teacher account (BR-A Proposed `BR-TEACH-002`) versus multi-role account (PS §4; BR-B §26.3) | BR-A; PS; BR-B | Choose one |
| U7 | Substitution approval and notification rules (BR-A `BR-SUB-002` "needs clarification" versus PS §25 supervisor final approval); "swapping a teacher between classes" is not documented (PS §25 is session-level) | BR-A; PS §25 | Confirm intended behavior |
| U8 | Payroll formula, syllabus and substitution payments, cancelled-session rules | BR-B §33.2; BR-A `BR-PAY-002` | Approved formula |
| U9 | Teacher corrections: direct edit versus ticket | BR-A `BR-TEACH-003`; API §31 | Decide |
| U10 | Duplicate-student matching and book sequence | BR-A `BR-STU-003`, `BR-BOOK-002` | Criteria |
| U11 | Minimum class capacity (8 or 10), teacher skill granularity, multiple sessions per day, Shahvar column mapping, institute scope | BR-B §33.1, 33.3, 33.4, 33.8, 33.7 | Decide when real data is available |
| U12 | Two overlapping business-rule documents (BR-A and BR-B) | Both | Decide how they are consolidated; not done here |

## 7. Decision Log

| ID | Decision | Date | Approved by | Sources affected |
|---|---|---|---|---|
| D1 | Student book/level placement required at creation | 2026-10-28 | Product owner | BR-A `BR-STU-001`; PS §9 |
| D2 | Supervisor creates teacher accounts; teachers see only authorized data; no pay rates for teachers | 2026-10-28 | Product owner | BR-A `BR-TEACH-001`, `BR-SEC-001`; PS §3.2, §10; BR-B §26 |
| D3 | MVP = documented core educational management scope; tuition/accounting, analytical reports, Settings excluded | 2026-10-28 | Product owner | RM §4; PS §33–34 |
| D4 | Six-month inactivity rule remains unconfirmed | 2026-10-28 | Product owner | none |

## 8. Maintenance

Update this file whenever the product owner approves, changes or retires a scope decision. Keep requirement text in its source document and link to it here. Related references: `Docs/EDUTECH-BUSINESS-RULES.md` §14, `Docs/EDUTECH-MVP-ROADMAP.md` §4, `Docs/EDUTECH-CURRENT-STATE.md`.
