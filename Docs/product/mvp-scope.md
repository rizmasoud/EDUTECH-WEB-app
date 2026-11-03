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

### D5 — Exam results, make-up exams, score corrections and promotion re-evaluation (approval date not recorded)

The product owner confirmed the rules below, including the final boundary for teacher score corrections. The date of approval was not stated and is deliberately not recorded here. The requirement text lives in `Docs/business/business-rules.md` (BR-B) §17.4–§17.9 and §18; this entry records the decision, its boundaries and its verified implementation status.

**Three separate concepts.** Exam closure, class completion and academic-term closure are different things and are never used interchangeably in the documentation: (1) *exam closure* is the closing of the exam event (what it means and who closes it is open, U13); (2) *class completion* is the Class status `COMPLETED` (BR-B §7.2); (3) *academic-term closure* is the term being fully closed (BR-B §3.2). No new exam status or class status is introduced by D5.

- **Final exam.** The final exam of a Class in an academic term is the exam whose type is `FINAL`. Each Class has exactly one final exam per academic term. A `MIDTERM` exam is optional: a Class may or may not have one. It is for progress assessment and does not trigger level promotion. Only the Class's single `FINAL` exam determines whether the student progresses to the next level, subject to all existing promotion eligibility conditions. The final exam is generally scheduled from the beginning of the term; if an unexpected event postpones it by several days or a week, that is a change of date of the same exam (exam date rule below), not a new final exam. The current schema stores the exam type but does not enforce one `FINAL` exam per Class (see "Technical design still required").
- **Result completion.** Every student in an exam's applicable roster has a recorded outcome: a numeric score or an explicit ABSENT status. Absence is never represented as score zero. Initial result entry is complete only when every applicable student has an outcome. Corrections are revisions of existing results, never additional students or additional results.
- **Reporting.** Reports and exam summaries distinguish total applicable students, students with numeric scores, absent students, make-up outcomes and score corrections.
- **Make-up exams.** An absent student is not eligible for promotion until a make-up exam produces a numeric score. A make-up result follows the same scoring and promotion rules, replaces the ABSENT outcome, and its history identifies the make-up origin. Make-up outcomes are counted separately from score corrections: a make-up result replacing ABSENT does not increase the correction count.
- **Score corrections: who and when.** The deciding boundary is the academic term. The teacher of the relevant Class may directly correct an existing score of that Class's exam, without prior Supervisor approval, whether the exam is open or closed and whether the Class is active or `COMPLETED`, as long as the academic term is active. Once the term is fully closed, teachers cannot directly correct scores. Supervisors may correct scores in all of these states, including results already corrected by a teacher. A teacher cannot correct the results of another teacher's Class.

  | Exam | Class | Academic term | Class's teacher may directly correct a score? |
  |---|---|---|---|
  | Closed | Active or Completed | Active | Yes |
  | Open | Active or Completed | Active | Yes |
  | Any | Any | Fully closed | No (Supervisor only) |

- **Score corrections: record.** Every correction needs a non-empty reason. Every correction by either role is kept in an append-only revision history (previous and new score or status, reason, actor, timestamp) that later changes never overwrite or delete. Supervisors keep visibility of corrections and their reasons.
- **Creating exams and entering initial results (temporary restriction, with one exception).** Once a Class is `COMPLETED`, its teacher cannot create a new exam. Once the academic term is fully closed, the teacher cannot create an exam or enter initial exam results. Exception: the teacher of a `COMPLETED` Class may still enter the initial results of that Class's already-created final exam (the exam of type `FINAL`), as long as the academic term is active. The exception covers only the final exam of that same Class; it does not allow creating another exam or entering initial results for any other exam, so the restrictions on `MIDTERM` and `OTHER` exams are unchanged. These restrictions apply to teachers; Supervisors retain their existing broader access. None of this limits score corrections, which follow the term rule above (permitted after exam closure and after class completion while the term is active; Supervisor only once the term is fully closed). The motivating workflow is a language-school Class of 12 regular teaching sessions followed by the final exam in session 13: completing the regular teaching does not stop the teacher from entering the final exam's initial results. No new Class status, exam status, field or endpoint represents this exception.
- **Supervisor visibility.** Teacher score corrections must be visible to Supervisors in reports and in activity and history records: Supervisors can review corrections and their reasons and see exam-level summaries that separate student counts, make-up outcomes and correction counts. A separate notification to the Supervisor is not required and is not a confirmed requirement. No mandatory review or approval queue is introduced.
- **Promotion.** Thresholds are unchanged (BR-B §18.1). A score of 70 or above promotes automatically, provided all other existing promotion conditions are satisfied. The existing Conditional range (60–69) needs a decision by the Class's teacher or the Supervisor. ABSENT students are not promoted until a numeric make-up result exists.
- **Scores below 60 (provisional policy).** A score below 60 results in `NOT_PROMOTED`. It does not create `PENDING_DECISION`, and it does not automatically create a Supervisor decision task or notification. No teacher exception is allowed, and no Repeat or Remedial pathway is currently approved for below-60 results. A possible future exception would require a separate explicit product-owner decision and Supervisor authority; none is approved. This is a temporary policy, explicitly subject to future product-owner review, and is not permanently settled.
- **Re-evaluation after a correction.** Every score correction triggers promotion re-evaluation against all existing promotion conditions, not against score thresholds alone. For example, `55 → 70` gives automatic promotion if all other conditions are satisfied; `75 → 60` revokes the previous promotion and moves the student's current progression state to Conditional; a corrected score below 60 does not qualify under the provisional policy above (any previous promotion is revoked and the status becomes `NOT_PROMOTED`).
- **Revocation and history.** When a correction invalidates a previous promotion, the original promotion record and its history are preserved, and a promotion-revocation event is recorded with its timestamp and audit information. If the corrected score is in the Conditional range, the student's current progression state becomes Conditional (a pending decision by the Class's teacher or the Supervisor). Enrollment, attendance and class participation records in a higher-level class are never deleted or automatically reversed. If the student is already enrolled in and attending a higher-level class, the Supervisor receives a concise explanation, for example "The student is currently enrolled in and attending a higher-level class."
- **Exam date.** A teacher may change an exam's date until the exam event is closed, and not afterwards. Score corrections remain permitted after exam closure, under the term rule above. The product rule does not prescribe how closure is implemented.

Not part of D5: a student role or student-submitted objections; any change to pass or Conditional thresholds; the open points in U13.

**Technical design still required (not product decisions):** how a promotion-revocation event is represented (a status, a separate record or a history entry), since the promotion statuses in `Docs/database/database-specification.md` §30 contain no revoked status and none is defined here; how the promotion uniqueness and idempotency rules (BR-B §18.3, DB §30, §52) coexist with preserved superseded promotions; how ABSENT, make-up origin, the revision history and exam closure are stored; and the schema gap for the final exam: the product rule is exactly one `FINAL` exam per Class per academic term, but the `exams` table stores `type` (`FINAL`, `MIDTERM`, `OTHER`) with no uniqueness constraint on it, and no code was found that restricts promotion processing to `FINAL` exams. How to enforce the rule is a design decision; no field, migration, endpoint or status is defined here.

**Implementation status (code inspection of `origin/main` `921d64d`; not runtime-tested except where stated): D5 is not yet fully implemented. The below-60 promotion rule is implemented; the remaining D5 requirements are pending implementation.** The `exams` table has no closure field. `exam_results.score` is `NOT NULL` with a 0–100 check, so ABSENT cannot be recorded and absence would have to be stored as a number. The result-update request accepts a score only (no reason), no make-up marker exists, and the only trace of an update is an audit-log entry holding the previous and new score and status. Exam and score writes check only that the teacher owns the Class; no check of Class status, academic-term status or exam type was found (the exam type is stored and returned only), and an earlier runtime probe showed a teacher could update a score and create an exam on a `COMPLETED` Class. The term-based correction boundary, the creation restriction and its final-exam exception are therefore not enforced. Promotion decisions are Supervisor-only; promotion processing may be triggered by a Supervisor or by the Class's own teacher. Promotion processing (PR #27) sets `NOT_PROMOTED` for newly processed results below 60, keeps `PENDING_DECISION` for 60 up to but not including 70, and keeps the existing automatic-promotion behavior for 70 or above, subject to existing eligibility conditions. Existing promotion records are not rewritten: previously stored below-60 `PENDING_DECISION` records remain unchanged and can still be decided. The below-60 policy remains provisional and subject to product-owner review as recorded in D5. Promotion processing still applies to the result of any exam type. No revision history, make-up count or Supervisor-facing correction report was found. This status is recorded here because `Docs/EDUTECH-CURRENT-STATE.md` is not being edited as part of this change.

---

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
| U9 | Teacher corrections: direct edit versus ticket. Resolved by D5 for exam scores only (direct teacher correction with a reason and revision history, no prior approval); every other teacher-recorded correction remains undecided | BR-A `BR-TEACH-003`; API §31 | Decide for the remaining corrections |
| U10 | Duplicate-student matching and book sequence | BR-A `BR-STU-003`, `BR-BOOK-002` | Criteria |
| U11 | Minimum class capacity (8 or 10), teacher skill granularity, multiple sessions per day, Shahvar column mapping, institute scope | BR-B §33.1, 33.3, 33.4, 33.8, 33.7 | Decide when real data is available |
| U12 | Two overlapping business-rule documents (BR-A and BR-B) | Both | Decide how they are consolidated; not done here |
| U13 | Points D5 does not settle: (a) what "exam closed" means and who closes an exam; (b) whether "fully closed" is exactly the term lifecycle state `closed` (BR-B §3.2) or something narrower; (c) whether a Supervisor may change the date of a closed exam; (d) how a correction affects a student whose promotion or non-promotion was set by an explicit teacher or Supervisor decision rather than automatically, including a correction that stays within the same range; (e) whether any exception for a score below 60 will ever be allowed (the no-exception policy is provisional, pending product-owner review); (f) who receives decision-required promotion notifications now that a teacher may decide (BR-B §25.3); (g) whether an approved substitute may decide, correct, or enter the final exam's initial results; (h) what the "applicable roster" of an exam is for a student who withdrew or joined after the exam was created; (i) whether replacing ABSENT with a make-up result needs a recorded reason | BR-B §17.4–§18.4, §25.3; DB §29–§30; API §33–§34 | Product-owner decision |

## 7. Decision Log

| ID | Decision | Date | Approved by | Sources affected |
|---|---|---|---|---|
| D1 | Student book/level placement required at creation | 2026-10-28 | Product owner | BR-A `BR-STU-001`; PS §9 |
| D2 | Supervisor creates teacher accounts; teachers see only authorized data; no pay rates for teachers | 2026-10-28 | Product owner | BR-A `BR-TEACH-001`, `BR-SEC-001`; PS §3.2, §10; BR-B §26 |
| D3 | MVP = documented core educational management scope; tuition/accounting, analytical reports, Settings excluded | 2026-10-28 | Product owner | RM §4; PS §33–34 |
| D4 | Six-month inactivity rule remains unconfirmed | 2026-10-28 | Product owner | none |
| D5 | Exam outcomes (score or ABSENT), make-up exams counted separately from corrections, teacher score corrections while the academic term is active and Supervisor corrections in all states, append-only revision history, Supervisor visibility of corrections in reports and history (no mandatory notification), promotion re-evaluation and revocation after correction, provisional no-exception policy below 60, temporary restriction on new exams and initial results after class completion or term closure with an exception for the final exam's initial results, one `FINAL` exam per Class per term (final exam result decides progression), below-60 outcome `NOT_PROMOTED` without pending decision, exam date change until exam closure | Not recorded | Product owner | BR-A `BR-TEACH-003`, `BR-PROMO-002`; PS §3.2, §22–§23; BR-B §17–§18; API §33–§34; DB §29–§30 |

## 8. Maintenance

Update this file whenever the product owner approves, changes or retires a scope decision. Keep requirement text in its source document and link to it here. Related references: `Docs/EDUTECH-BUSINESS-RULES.md` §14, `Docs/EDUTECH-MVP-ROADMAP.md` §4, `Docs/EDUTECH-CURRENT-STATE.md`.
