# CLAUDE.md — Claude Instructions for EduTech

**Status:** Initial draft — review required  
**Applies to:** Claude-based coding sessions working on EduTech  
**Shared rules:** See `AGENTS.md` in the repository root

## 1. Purpose

This file provides Claude-specific entry instructions for working on EduTech.

The shared collaboration rules belong in `AGENTS.md`. This file must not duplicate those rules or create a competing source of truth.

Read and follow the shared guidelines in `AGENTS.md` whenever they are available and applicable.

If either file is missing, inaccessible, or inconsistent with the repository's established instructions, report the issue instead of assuming that the missing rules have been applied.

## 2. No Implicit Role Changes

Claude may be used as the primary implementation agent or as an additional contributor assigned to a specific task.

Do not infer your role from this file alone.

Your current role and authority are determined by the explicit instructions for your current session and task, subject to higher-priority requirements.

In particular:
- If you are the existing primary implementation agent, continue your assigned work according to the established project workflow.
- If you are assigned a specific feature, implement only the authorized scope.
- If you are assigned a review or audit, review and report findings without implementing changes unless implementation is explicitly authorized.
- If another agent is assigned a task, do not assume ownership of that task or modify its work without authorization.

This file does not appoint a permanent project manager, change the existing primary agent's responsibilities, or authorize a new workflow by itself.

## 3. Initial Adoption: Review Before Enforcement

When first asked to review these documents:

1. Read `AGENTS.md` and this file.
2. Inspect the existing project instructions and relevant repository documentation.
3. Compare the proposed rules with the actual architecture, Git workflow, testing process, and CI configuration where accessible.
4. Identify contradictions, ambiguities, missing rules, and implementation risks.
5. Report findings and recommendations without changing application code or operational configuration.

During this initial review, do not:
- Refactor or rewrite existing application code.
- Change database schemas or migrations.
- Modify GitHub Actions or other CI configuration.
- Change branch protection, Git settings, or permissions.
- Commit, push, merge, or deploy changes.
- Treat the presence of these documents as authorization to change your existing assignment.

The review request is advisory. The documents remain drafts until their adoption is explicitly approved.

## 4. Task Execution

For every subsequent implementation task:

- Read the assigned task and identify its acceptance criteria.
- Inspect relevant existing code and documentation before editing.
- Follow the approved architecture and established conventions.
- Keep changes within the authorized scope.
- Identify dependencies on shared files, interfaces, or other tasks.
- Avoid unnecessary rewrites and unrelated refactoring.
- Report blockers instead of inventing requirements.

Do not assume that every task requires a new architecture, new dependencies, or a broad redesign.

## 5. Collaboration With Other Agents

EduTech may use multiple Claude accounts and other coding tools.

When collaborating:
- Treat the shared rules in `AGENTS.md` as the common collaboration contract.
- Do not assume another agent has read this file or `AGENTS.md`; verify the applicable instructions in that agent's environment.
- Do not assume another agent's code, commits, or test results exist unless they can be verified.
- Avoid overlapping edits to shared files.
- Coordinate changes to shared API contracts, types, database schemas, migrations, and configuration.
- Produce a clear handoff when completing a task.
- When resuming work from another agent, inspect the relevant changes before continuing.

Do not introduce a competing implementation merely because another agent's work is unfamiliar. First determine whether its implementation already meets the requirements.

## 6. Context and Handoffs

When a task may be continued by another session or agent, leave a concise handoff containing:

- The task objective and current status.
- The implementation completed.
- The files changed.
- Important design decisions and assumptions.
- Tests executed and their actual results.
- Outstanding defects, blockers, and risks.
- Relevant branch and commit information, if applicable.
- The next recommended action.

Do not rely on conversation history alone when important state can be recorded in a repository document, commit, or task report.

Do not create or modify project-wide planning documents unless they are relevant to the assigned task or explicitly requested.

## 7. Verification and Reporting

Report only what has actually been verified.

Distinguish between:
- Implemented and tested.
- Implemented but not tested.
- Proposed but not implemented.
- Blocked or awaiting approval.

Never claim that the application, integration, build, CI, or deployment works without supporting evidence.

When a requirement cannot be verified in the current environment, state the limitation clearly.

## 8. Changes to These Instructions

Do not silently rewrite `AGENTS.md` or `CLAUDE.md` to resolve a disagreement.

If an instruction is outdated or conflicts with established project behavior:
1. Identify the conflicting rule.
2. Explain the practical consequence.
3. Recommend a specific correction.
4. Wait for authorization when the correction changes project-wide behavior.

Keep Claude-specific instructions limited to Claude-specific behavior. Shared rules should remain in `AGENTS.md`.

## 9. Final Principle

The objective is to help deliver a reliable, maintainable EduTech MVP with minimal unnecessary rework.

Follow the assigned task, preserve existing working behavior, coordinate shared changes, verify results, and leave the repository in a clear state for the next contributor.

