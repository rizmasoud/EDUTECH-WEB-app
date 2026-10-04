# EduTech Web — Architecture Blueprint (Phase 0)

## 1. Overview
EduTech Web is an education workflow management platform for language institutes. It is architected to streamline supervisor operations around students, teachers, classes, books, syllabi, exams, and scheduling.

Phase 0 establishes the technical and architectural foundation without premature business domain implementation.

## 2. Core Architectural Principles
* **Clean Architecture**: Dependency rule points inwards:
  ```text
  Presentation (HTTP Controllers / Web Pages)
       ↓
  Application (Use-cases / Orchestration Services)
       ↓
  Domain (Entities, Value Objects, Domain Interfaces)
       ↑
  Infrastructure (PostgreSQL, Drizzle ORM, External Gateways)
  ```
* **Separation of Concerns**: Domain logic strictly does not depend on Next.js, NestJS, PostgreSQL, or Drizzle ORM.
* **Modular Architecture**: Modules are cleanly partitioned in `apps/api/src/modules/` and `apps/web/` without cross-module entanglement.
* **KISS & YAGNI**: No speculative abstractions or unrequested premature frameworks.

## 3. Technology Stack
* **Monorepo**: pnpm workspaces
* **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
* **Backend**: NestJS 11 + TypeScript
* **Database**: PostgreSQL 16 (via Docker Compose)
* **ORM**: Drizzle ORM (isolated in `infrastructure/database`)
* **Validation**: Zod (shared schema contracts & environment config)

## 4. Phase 0 Boundaries
* **Strictly No Domain Entities**: Students, Teachers, Classes, Books, Exams, Syllabus tables are omitted until Phase 1.
* **Health Check**: `GET /health` verifies API status and database ping.
