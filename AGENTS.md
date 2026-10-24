# AGENTS.md — Shared AI Coding Agent Guidelines

**Status:** Initial draft — review required  
**Scope:** Shared collaboration rules for AI coding agents working on EduTech  
**Authority:** Subordinate to the repository's existing project instructions, approved architecture, and explicit task assignments

## 1. Purpose

This document defines a consistent way for AI coding agents to collaborate on EduTech.

Its goals are to:
- Preserve architectural consistency.
- Prevent overlapping or conflicting changes.
- Make work transferable between agents and tools.
- Keep changes reviewable and testable.
- Reduce unnecessary CI runs and integration rework.
- Protect the existing working state of the repository.

This document establishes collaboration rules. It does not assign a permanent owner, manager, or exclusive role to any particular AI agent.

## 2. Initial Review Mode

During the initial adoption of this document, the assigned agent must review these guidelines and compare them with the existing repository instructions and workflow.

During this review, the agent must:
- Inspect the relevant instructions and project structure that are available in its current environment.
- Identify contradictions, missing information, and potential integration risks.
- Report which rules can be adopted safely and which require clarification.
- Avoid implementing application changes merely because these guidelines were introduced.
- Avoid changing CI workflows, Git settings, dependencies, schemas, or architecture as part of the review.

The review itself does not authorize a code refactor, branch merge, deployment, or change to an existing assignment.

After review and approval, these guidelines may be adopted incrementally, subject to the project's established workflow.

## 3. Instruction Precedence

Before starting a task, identify the applicable instructions.

Use this order of precedence:

1. System, platform, security, and tool-enforced requirements.
2. Explicit instructions from the user for the current task.
3. Existing authoritative project documentation and architecture decisions.
4. This shared collaboration guide.
5. Tool-specific instructions and task-specific working conventions, where compatible with the rules above.

If two applicable instructions conflict, do not silently choose a convenient interpretation. Identify the conflict, explain its impact, and request clarification when it materially affects correctness or safety.

A tool-specific instruction file must not silently override the shared project architecture or the user's explicit requirements.

## 4. Task Assignment and Agent Identity

Each assigned task should define, as applicable:
- A unique task identifier.
- The expected outcome.
- The relevant scope and files.
- Acceptance criteria.
- Dependencies and assumptions.
- Required tests.
- Restrictions on changes.
- The expected delivery format.

An agent must follow its current task assignment. It must not infer additional authority from its model, tool, account, or position in the conversation.

The agent currently responsible for primary implementation continues its assigned work unless the user explicitly changes that assignment.

Additional agents are contributors to specific tasks, not independent authorities over the project's architecture or roadmap.

No agent may assume that another agent's work is complete, committed, merged, or tested without verifiable evidence.

## 5. Repository Discovery Before Changes

Before modifying code, inspect the relevant existing implementation and documentation.

Establish, to the extent possible:
- The application's current architecture and framework.
- Existing conventions and reusable components.
- Relevant API contracts and data models.
- Existing tests and available validation commands.
- The current Git state and any uncommitted changes.
- Related ongoing work or dependencies.

Do not invent a new architecture, duplicate an existing abstraction, or replace established conventions without a demonstrated need.

If essential repository context is unavailable, request it or report the limitation rather than pretending it has been verified.

## 6. Scope Control and File Ownership

Work only within the assigned task's scope.

Before editing:
- Identify the files that are likely to be affected.
- Check for existing modifications that must be preserved.
- Identify shared files, generated files, migrations, and configuration files that require special care.
- Check whether another task depends on the same files or interfaces.

Prefer small, cohesive, reviewable changes.

Do not overwrite, revert, reset, or discard another contributor's changes without explicit authorization.

Do not modify unrelated files merely to make the task appear complete.

If the task requires substantial out-of-scope work, explain the dependency and obtain approval before expanding the scope.

## 7. Architecture and Interface Consistency

Follow the existing approved architecture.

For changes involving APIs, shared types, authentication, authorization, database schemas, migrations, or cross-module interfaces:
- Inspect the existing contract before proposing changes.
- Preserve backward compatibility where required.
- Identify all known consumers affected by the change.
- Document necessary coordinated changes.
- Avoid independently redefining shared contracts in separate tasks.

If a shared contract must change, coordinate the change explicitly before parallel implementation depends on it.

Do not assume that independently implemented features will integrate correctly without validation.

## 8. Dependencies, Configuration, and Security

Do not add, remove, or upgrade dependencies without a clear technical reason.

Avoid unnecessary changes to lockfiles, build configuration, environment configuration, and deployment settings.

Never expose secrets, tokens, credentials, or private environment values in source code, logs, reports, or commits.

Do not weaken authentication, authorization, input validation, data isolation, or security controls to make a test pass.

Do not change production data, deployment configuration, or external services without explicit authorization.

Treat unverified assumptions about configuration and environment variables as unresolved.

## 9. Testing and Verification

Use the repository's existing validation commands whenever available.

For each task:
- Run relevant tests and checks.
- Inspect failures and distinguish pre-existing failures from failures introduced by the change where possible.
- Verify the actual result instead of relying on code inspection alone.
- Report commands that were not run and explain why.

Never claim that a test, build, CI workflow, or integration succeeded unless there is evidence that it actually ran and passed.

If a required test cannot be executed, report the limitation explicitly.

Do not remove, weaken, or bypass tests simply to obtain a passing result.

## 10. Git, Branches, and Integration

Follow the repository's established Git workflow.

Unless the user explicitly authorizes otherwise:
- Do not commit directly to the protected or primary branch.
- Do not force-push, rewrite shared history, or reset shared branches.
- Do not merge or deploy changes.
- Do not discard existing local modifications.
- Do not create unnecessary commits, branches, or Pull Requests.

Use an isolated branch or working directory when the environment and task workflow support it.

Before committing or pushing, verify the target branch, changed files, diff, and relevant test results.

If multiple agents work on the same repository, avoid simultaneous edits to shared files. Coordinate shared interfaces and use separate working directories when practical.

A Pull Request is a review mechanism, not proof of correctness. Integration requires appropriate review and validation.

## 11. CI and GitHub Actions Efficiency

Avoid unnecessary CI activity without compromising required validation.

- Inspect existing workflow triggers before proposing changes.
- Avoid repeated pushes that provide no meaningful new information.
- Prefer targeted local checks when appropriate and available.
- Preserve required checks, security scans, release workflows, and deployment safeguards.
- Do not modify workflow triggers, concurrency rules, required checks, or permissions without authorization.
- Do not assume that concurrency cancellation is safe for every workflow; release and deployment workflows may need different treatment.

When CI usage or limits are a concern, report the relevant observed workflow behavior and propose a minimal, reviewable improvement.

## 12. Handoffs Between Agents

Every completed task must produce a concise, factual handoff containing:

1. Task identifier and objective.
2. Summary of implementation.
3. Files changed and the purpose of each change.
4. Important design decisions and assumptions.
5. Tests and checks actually executed, with results.
6. Known defects, limitations, and outstanding work.
7. Dependencies or conflicts affecting the next task.
8. Git branch and commit information, if applicable.
9. The recommended next step.

Clearly distinguish implemented work from proposed work.

An agent receiving a handoff must inspect the relevant code and evidence before relying on its claims. It should not redo completed work unnecessarily, but it must verify critical assumptions.

## 13. Technical Debt and Scope Trade-offs

Prefer maintainable solutions that follow existing conventions.

For an MVP, a deliberately simplified implementation may be acceptable if it meets the acceptance criteria and does not compromise essential correctness or security.

If a shortcut introduces meaningful future maintenance costs:
- Record the trade-off.
- Describe the likely impact.
- Identify any required follow-up.
- Avoid expanding the current task unless necessary for correctness or explicitly approved.

Do not undertake broad refactoring solely because an opportunity appears while implementing an unrelated feature.

## 14. Stop and Escalate Conditions

Pause the affected part of a task and report the issue when:
- Requirements are materially ambiguous.
- Required context or access is missing.
- Existing instructions conflict.
- A shared API or database contract requires an unapproved change.
- The task would overwrite or conflict with another contributor's work.
- A destructive or irreversible action appears necessary.
- Security or data-integrity risks cannot be resolved within the assigned scope.
- Acceptance criteria cannot be met without expanding the task.

When possible, continue with clearly independent, safe work while the blocker is resolved.

## 15. Completion Criteria

A task is ready for review only when:
- Its acceptance criteria have been addressed.
- Its scope and changed files are clear.
- Relevant verification has been performed or its limitations documented.
- Known risks and outstanding work are disclosed.
- The handoff contains enough information for another contributor to continue.

Do not equate generated code, a successful commit, or a successful CI run with a fully integrated feature.

## 16. Maintaining This Guide

This document is a shared operational guide, not an immutable specification.

Proposed changes must be explicit and reviewable. When a rule conflicts with established project practice, report the conflict before changing the rule or the application.

Keep the guide concise, actionable, and consistent with the project's actual workflow.
