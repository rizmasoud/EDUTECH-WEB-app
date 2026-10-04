# EduTech Web — Phase 0: Foundation

## 1. What is EduTech Web?
**EduTech Web** is an education workflow management system designed specifically for language institutes. Its core mission is to minimize manual administrative overhead for the **Supervisor** across academic terms, student records, teacher allocations, class scheduling, syllabi, book segment tracking, and exams.

Phase 0 establishes the clean, modular, and maintainable technical foundation. Strictly no business domain entities or features have been prematurely implemented in this phase.

---

## 2. Technology Stack
* **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
* **Backend**: NestJS 11 + TypeScript
* **Database**: PostgreSQL 16
* **ORM**: Drizzle ORM
* **Validation**: Zod (for environment and shared health contracts)
* **Package Manager**: pnpm (workspace monorepo)
* **Containerization**: Docker Compose (for local PostgreSQL development)

---

## 3. Monorepo Repository Structure
```text
edutech-web/
├── apps/
│   ├── web/                    # Next.js 15 App Router frontend shell
│   │   ├── app/                # Root layout, health check UI, and API route
│   │   ├── next.config.ts      # Next.js configuration & API rewrites
│   │   └── package.json
│   └── api/                    # NestJS 11 modular API
│       ├── src/
│       │   ├── main.ts         # Bootstrap and CORS configuration
│       │   ├── app.module.ts   # Root NestJS application module
│       │   ├── health/         # Clean Architecture health check module
│       │   │   ├── domain/     # IDatabaseHealthChecker (no framework deps)
│       │   │   ├── application/# HealthService orchestration
│       │   │   ├── presentation/ HealthController (GET /health)
│       │   │   └── infrastructure/ DrizzleDatabaseHealthChecker
│       │   ├── infrastructure/
│       │   │   └── database/   # Drizzle ORM provider and schema barrel
│       │   ├── shared/config/  # Zod-validated environment config
│       │   └── modules/        # Reserved for future business modules
│       ├── drizzle.config.ts   # Drizzle Kit configuration
│       └── package.json
├── packages/
│   ├── shared/                 # Framework-independent contracts & types
│   │   └── src/                # HealthResponse, Zod schemas, types
│   └── config/                 # Shared tooling configurations
├── infrastructure/
│   └── docker/
│       └── init/01-init.sql    # PostgreSQL initial extensions
├── docs/                       # Architecture and phase specifications
├── scripts/                    # Development, setup, and verification scripts
├── .github/workflows/          # CI pipeline (lint, build, health checks)
├── package.json                # Root workspace orchestration
├── pnpm-workspace.yaml         # Monorepo package registry
├── tsconfig.base.json          # Strict base TypeScript config
├── docker-compose.yml          # Local PostgreSQL 16 container service
├── .editorconfig               # Formatting & whitespace standard
├── .env.example                # Documented environment template
└── README.md                   # Project documentation
```

---

## 4. Prerequisites
* **Node.js**: >= 20.0.0 (Node 22 LTS recommended)
* **pnpm**: >= 9.0.0 (`corepack enable` to activate)
* **Docker & Docker Compose**: For local PostgreSQL 16

---

## 5. How to Install Dependencies
```bash
# Enable pnpm if not already available
corepack enable

# Install all workspace dependencies
pnpm install
```

---

## 6. How to Start PostgreSQL
```bash
# Start PostgreSQL via Docker Compose in the background
docker compose up -d

# Verify container is running and healthy
docker compose ps
```

---

## 7. How to Run the Web Application
```bash
# Run Next.js web application
pnpm --filter @edutech/web dev

# The web application will be accessible at:
# http://localhost:3000
```

---

## 8. How to Run the API
```bash
# Run NestJS API in development watch mode
pnpm --filter @edutech/api dev

# The API will be accessible at:
# http://localhost:4000
```

To run both API and Web concurrently:
```bash
pnpm dev
```

---

## 9. How to Verify the Health Endpoint
The NestJS API exposes a structured health endpoint at `GET /health`.

### Via cURL:
```bash
curl http://localhost:4000/health
```

### Response format:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-09-20T12:00:00.000Z",
  "database": "connected",
  "details": {
    "databaseLatencyMs": 2,
    "uptimeSeconds": 14,
    "message": "PostgreSQL connection verified via Drizzle ORM"
  }
}
```

The Next.js frontend at `http://localhost:3000` also displays the live health state with interactive re-check controls.

---

## 10. How Environment Variables are Configured
Configuration is cleanly decoupled from source code:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Key environment variables:
   * `DATABASE_URL`: PostgreSQL connection string (`postgresql://edutech_user:edutech_password@localhost:5432/edutech_db`)
   * `NODE_ENV`: Runtime environment (`development`, `production`, `test`)
   * `API_PORT`: Backend port (default `4000`)
   * `PORT`: Frontend port (default `3000`)
   * `NEXT_PUBLIC_API_URL`: Browser-accessible API URL
   * `INTERNAL_API_URL`: Server-side API endpoint for Next.js internal calls

Never commit `.env` or real credentials to Git.

---

## 11. Architecture Rules (Phase 0 Boundaries)
* **Dependency Flow**: Presentation $\rightarrow$ Application $\rightarrow$ Domain $\leftarrow$ Infrastructure
* **Strict Domain Isolation**: Domain interfaces have zero framework dependencies.
* **No Business Modules in Phase 0**: No tables or endpoints for Students, Teachers, Classes, Books, Syllabus, or Exams exist until Phase 1.
