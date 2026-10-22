# EduTech — Development Workflow

## 1. Purpose

This document defines the required development workflow for EduTech Web.

The goal is to deliver a working, maintainable MVP through small, verifiable steps while minimizing regressions, unnecessary refactoring, repeated debugging, and undocumented assumptions.

This workflow applies to implementation, bug fixing, testing, code review, and documentation updates.

## 2. Source of Truth

Before starting a task, inspect the current repository and identify the applicable sources of truth.

Use the following order:

1. Explicit product-owner decisions and instructions
2. `EDUTECH-BUSINESS-RULES.md` for approved business rules
3. `EDUTECH-MVP-ROADMAP.md` for product scope and priorities
4. `EDUTECH-CURRENT-STATE.md` for the latest evidence-based implementation status
5. Existing code, tests, migrations, and other technical documentation

If these sources conflict, report the conflict instead of silently choosing one.

Do not assume that a document is accurate merely because it exists. Verify claims against the current repository when relevant.

## 3. One Task at a Time

Work on one clearly defined task at a time.

Before implementation:

1. State the problem or missing capability.
2. Explain the expected behavior.
3. Inspect the relevant existing implementation.
4. Identify the files and components likely to be affected.
5. Identify relevant business rules and dependencies.
6. Define the smallest acceptable implementation.
7. Define the tests needed to verify it.

Do not combine unrelated features into one task.

Avoid broad refactoring unless it is necessary for the requested task and explicitly justified.

## 4. Inspect Before Editing

Before changing code:

- Read the relevant implementation and its callers.
- Inspect related tests and API contracts.
- Check the database schema and migrations when relevant.
- Check existing error handling and authorization.
- Search for related functionality that could be duplicated.
- Identify compatibility constraints and existing behavior that must be preserved.

Do not recreate an existing feature simply because its implementation is unfamiliar.

If the existing code cannot be understood confidently, investigate further before editing.

## 5. Protect Existing Work

Never overwrite or discard unrelated user changes.

Before editing, inspect Git status and identify pre-existing changes.

Do not:

- Reset branches or working trees to remove changes.
- Delete or overwrite user work without permission.
- Commit or push without explicit authorization.
- Merge branches without explicit authorization.
- Change deployment settings or secrets without permission.

Keep changes limited to the task.

If unexpected changes appear during implementation, stop and report them before taking corrective action.

## 6. Database Safety

Treat database changes as a separate risk category.

- Do not seed, reset, truncate, delete, or overwrite database records unless the task explicitly authorizes the operation.
- Do not apply migrations automatically without confirming that they are appropriate for the current environment.
- Inspect existing migration history before proposing schema changes.
- Preserve existing data and referential integrity.
- Do not expose credentials or connection strings containing secrets.
- Distinguish schema changes from data changes.
- Report any command that could modify database state before executing it.

When testing database-dependent functionality, identify which database and environment are being used. Never assume that development, staging, and production databases are interchangeable.

## 7. Implementation Standards

Follow the existing architecture and conventions unless there is a concrete reason to change them.

- Keep business logic separate from presentation code where appropriate.
- Validate inputs at the API boundary.
- Enforce authorization on the backend.
- Use database constraints and transactions where appropriate.
- Handle loading, empty, success, and error states in the UI.
- Return meaningful, safe error responses.
- Avoid duplicating business rules across unrelated components.
- Avoid adding dependencies without explaining their necessity.
- Do not introduce mock behavior into real application workflows without clearly identifying it.
- Do not claim that a feature is production-ready merely because it works locally.

Prefer the smallest maintainable solution that satisfies the approved requirements.

## 8. Testing Requirements

Choose tests according to the scope and risk of the change.

Where applicable, use:

1. Targeted unit tests
2. Integration tests
3. API or database tests
4. UI or end-to-end tests
5. Relevant regression tests
6. Build, type-check, and lint checks

Run the most relevant targeted tests first, then broader checks as appropriate.

Do not claim that a test passed unless it was actually executed and its result was observed.

If a test cannot run because of missing credentials, unavailable services, environment restrictions, or other blockers, report the limitation explicitly.

Do not weaken, remove, skip, or rewrite a failing test merely to make the test suite pass. Explain the failure and determine whether the test or implementation is incorrect.

## 9. Debugging Workflow

When a bug is reported:

1. Reproduce the problem when possible.
2. Collect the relevant error message and logs.
3. Trace the failure to its source.
4. Identify the root cause before proposing a fix.
5. Explain the cause and the smallest reasonable correction.
6. Implement the fix.
7. Add or update a regression test when appropriate.
8. Run the relevant tests.
9. Verify that the original behavior now works.
10. Check for related regressions.

Do not repeatedly apply speculative fixes without new evidence.

If multiple explanations remain possible, perform a targeted investigation or request the missing information.

## 10. Feature Completion Criteria

A task is not complete merely because code has been written.

Before marking a task complete, verify that:

- The approved behavior is implemented.
- Relevant business rules are respected.
- Authorization and input validation are appropriate.
- Error and empty states are handled.
- Relevant tests pass, or limitations are documented.
- Existing functionality has not been unintentionally broken.
- Required database changes are documented.
- Relevant documentation is updated.
- Remaining limitations are clearly listed.

Distinguish between implemented, tested, and end-to-end verified functionality.

## 11. Documentation Updates

After a meaningful milestone, update the relevant documentation.

- Update `EDUTECH-MVP-ROADMAP.md` when scope or priorities change.
- Update `EDUTECH-CURRENT-STATE.md` when implementation status changes and evidence is available.
- Update `EDUTECH-BUSINESS-RULES.md` only when the product owner confirms or changes a business rule.
- Update this workflow document only when the development process itself needs to change.

Do not update a feature's status based solely on generated code or an unverified claim.

## 12. Required Implementation Report

After each task, provide a concise report containing:

### A. Summary
What changed and why.

### B. Files Changed
List the changed files and explain the purpose of each change.

### C. Root Cause
For bug fixes, explain the confirmed cause. For new features, explain the relevant design decision.

### D. Tests
List the commands actually executed and their observed results.

### E. Verification
Describe what was verified and what remains unverified.

### F. Risks and Limitations
Identify any known regressions, security concerns, technical debt, or unresolved requirements.

### G. Documentation
List the documentation updated, if any.

### H. Next Step
Recommend the next smallest useful task without starting it automatically.

## 13. Audit Before Implementation

If the current implementation status is unknown, perform a read-only audit before making changes.

Use `EDUTECH-CURRENT-STATE.md` to guide the audit.

Do not implement a feature until its existing status, relevant dependencies, and required behavior are sufficiently understood.

If a required business rule is unresolved, identify the ambiguity and request a decision before implementing the affected behavior.

## 14. Final Principle

Prioritize verified progress over the volume of generated code.

Every change should have a clear purpose, limited scope, observable evidence, and a reliable way to check whether it works.

The objective is not to produce the largest implementation in one pass. It is to build EduTech incrementally without losing control of its behavior, architecture, data, or requirements.