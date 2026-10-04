# Deployment, Operations & Infrastructure Specification

## 1. Purpose

This document defines the deployment, runtime, infrastructure, backup, observability, and operational requirements for EduTech.

EduTech is an online-first web application. It is not an offline-first desktop application and does not require local synchronization.

The goal is to provide a simple, reliable, secure, and maintainable production architecture without introducing unnecessary infrastructure complexity.

---

## 2. Production Architecture

The initial production architecture should follow this model:

```text
Internet
   |
 HTTPS
   |
Reverse Proxy
   |
   +--------------------+
   |                    |
Next.js              NestJS API
Frontend             Backend
                         |
                    PostgreSQL
                         |
                  External File Storage
```

The exact hosting provider is not fixed yet.

The architecture must remain portable enough that the hosting provider can be changed later without requiring major application redesign.

---

## 3. Application Components

### 3.1 Next.js Frontend

Responsibilities:

- Render the web UI.
- Handle frontend routing.
- Manage UI state.
- Communicate with the NestJS API.
- Display server data.
- Perform client-side validation for user experience.
- Never directly access PostgreSQL.
- Never contain authoritative business rules.

The frontend must not be treated as a security boundary.

---

### 3.2 NestJS Backend

Responsibilities:

- Authentication.
- Authorization.
- REST API.
- DTO validation.
- Business workflows.
- Domain policies.
- Database access.
- Transactions.
- File upload orchestration.
- Audit logging.
- Notifications.
- Background jobs where required.

The backend is the authoritative application boundary.

Critical business rules must be enforced here.

---

### 3.3 PostgreSQL

PostgreSQL is the primary persistent database.

It stores:

- Accounts.
- Roles.
- Teachers.
- Students.
- Books.
- Academic terms.
- Classes.
- Enrollments.
- Schedules.
- Class sessions.
- Attendance.
- Syllabi.
- Lesson plans.
- Exams.
- Promotions.
- Substitution requests.
- Payroll.
- Tickets.
- Notifications.
- Import jobs/results.
- Audit logs.
- File metadata.

The database must not be publicly accessible from the Internet.

---

### 3.4 External File Storage

Uploaded files must not be stored permanently inside the application container.

External/object storage should be used for:

- Ticket attachments.
- Import files.
- Other future supported attachments.

PostgreSQL stores file metadata and a secure storage reference.

The exact provider is an implementation-time decision.

---

## 4. Environments

At minimum, the project should support:

### Development

Used for local development.

Characteristics:

- Local Next.js.
- Local NestJS.
- Local PostgreSQL or development database.
- Development configuration.
- Debug logging where appropriate.

### Testing

Used for automated integration/API/E2E testing.

Testing must not depend on production data.

### Production

Used by actual users.

Production must have:

- HTTPS.
- Production database.
- Secure authentication configuration.
- Restricted database access.
- External file storage.
- Production logging.
- Backup strategy.
- Health checks.

A staging environment may be introduced later if operational needs justify it.

---

## 5. Environment Configuration

Configuration must be environment-based.

Examples include:

```text
DATABASE_URL
AUTH_SECRET
FILE_STORAGE_ENDPOINT
FILE_STORAGE_BUCKET
FILE_STORAGE_ACCESS_KEY
FILE_STORAGE_SECRET_KEY
APP_URL
API_URL
CORS_ORIGINS
```

The exact variable names may change during implementation.

Secrets must never be committed to Git.

Production secrets must not appear in:

- Source code.
- Frontend bundles.
- Logs.
- Audit metadata.
- Error messages.
- API responses.

---

## 6. Database Migrations

Database schema changes must be managed through versioned migrations.

Requirements:

- Every production schema change must have a migration.
- Migrations must be committed to version control.
- Production schema must not be changed manually as the normal workflow.
- Migration execution must be controlled and observable.
- Destructive migrations require additional review.
- Database migrations must be compatible with the deployment process.

The ORM is an implementation detail and may be selected during Phase 0.

---

## 7. Deployment Strategy

The initial deployment strategy should remain simple.

A deployment should conceptually follow:

```text
Install dependencies
        |
Lint
        |
Typecheck
        |
Tests
        |
Build
        |
Database migration
        |
Deploy application
        |
Health check
```

A deployment must not be considered successful merely because the application process started.

The application health endpoint must be checked after deployment.

---

## 8. Application Health

The backend should expose a health endpoint.

Example:

```text
GET /api/v1/health
```

The health system should distinguish between:

- Application process is running.
- Database is reachable.
- Required infrastructure is available.

Health checks must not expose secrets or sensitive internal information.

A future readiness/liveness distinction may be introduced if the deployment environment requires it.

---

## 9. Logging

Application logging and AuditLog serve different purposes.

### Application Logs

Used for:

- Errors.
- Debugging.
- Performance investigation.
- Infrastructure problems.
- Request tracing.
- Operational diagnostics.

### Audit Logs

Used for:

- Security-sensitive actions.
- Business-sensitive changes.
- Data corrections.
- Payroll finalization.
- Promotion decisions.
- Attendance corrections.
- Account/role changes.
- Other actions defined by the Audit specification.

Application logs must not replace AuditLog.

AuditLog must not be treated as a general debugging log.

---

## 10. Request Correlation

Backend requests should support request correlation.

A request identifier should be available in application logs so that an error can be traced across related log entries.

The identifier should not contain sensitive user information.

This becomes especially useful for:

- Import failures.
- Scheduling operations.
- Payroll calculation.
- Authentication problems.
- File upload failures.
- Production errors.

---

## 11. Error Monitoring

Production errors should be observable through an appropriate error-monitoring mechanism.

The exact provider is not fixed.

The monitoring solution should capture:

- Unexpected backend errors.
- Frontend runtime errors.
- Relevant request context.
- Stack traces.
- Deployment/version information where possible.

Sensitive information must be filtered before being sent to third-party monitoring services.

---

## 12. Performance Monitoring

Initial performance monitoring should focus on meaningful application behavior rather than premature infrastructure optimization.

Important areas include:

- API response time.
- Database query performance.
- Import processing time.
- Scheduling calculation time.
- Payroll calculation time.
- Page load performance.
- File upload/download performance.

Performance baselines should be established after the first working MVP rather than guessing optimization targets beforehand.

---

## 13. Background Jobs

Background jobs should only be introduced when an operation is sufficiently long-running or operationally unsuitable for a normal HTTP request.

Potential examples:

- Large Shahvar imports.
- Large scheduling calculations.
- Payroll calculations if they become expensive.
- File processing.

Do not introduce a message broker or job infrastructure merely because the architecture could eventually need one.

Start with the simplest reliable mechanism.

---

## 14. Backup Strategy

Backups must cover both:

1. PostgreSQL data.
2. External file storage.

Backing up only PostgreSQL is insufficient because database records may reference files stored externally.

The backup system should support:

- Automated database backups.
- File-storage backup or replication strategy.
- Retention policy.
- Secure backup storage.
- Restore procedures.

The exact:

- RPO.
- RTO.
- Backup frequency.
- Retention period.

remain implementation/operations decisions.

---

## 15. Restore Testing

A backup is not considered reliable merely because it was successfully created.

Restore procedures should be tested periodically.

A restore test should verify that:

- PostgreSQL can be restored.
- Required files can be restored.
- File metadata still corresponds to stored files.
- The application can start against restored data.
- Authentication still works.
- Critical workflows remain usable.

Restore testing should be documented.

---

## 16. Security Requirements

Production deployment must include:

- HTTPS.
- Secure authentication cookies.
- Restricted CORS.
- Protected database access.
- Secure file access.
- Environment-based secrets.
- Rate limiting on authentication endpoints.
- Production error sanitization.
- Dependency updates.
- Principle of least privilege.

The PostgreSQL server must not be directly exposed to the public Internet.

File storage objects must not be publicly accessible by default.

---

## 17. Reverse Proxy

A reverse proxy should sit in front of the application services.

Responsibilities may include:

- HTTPS termination.
- Routing.
- Request forwarding.
- Security headers.
- Compression where appropriate.
- Static asset handling where appropriate.
- Basic request limits.

The exact reverse proxy is not fixed.

Common candidates may include:

- Nginx.
- Caddy.
- Apache.

The choice should be based on operational simplicity rather than theoretical performance.

---

## 18. Database Reliability

PostgreSQL operations must account for:

- Connection limits.
- Connection pooling.
- Transaction failures.
- Migration safety.
- Backup availability.
- Disk capacity.
- Database health.

The application must fail safely when the database is temporarily unavailable.

It must not silently report successful business operations when persistence has failed.

---

## 19. File Storage Reliability

File upload operations must not leave inconsistent state.

For example:

```text
Upload file
    |
Validate
    |
Store file
    |
Persist metadata
```

If a multi-step operation fails, the system should clean up or otherwise reconcile incomplete storage state.

The database record and physical file must not silently diverge.

---

## 20. Deployment and Rollback

Application deployments should be versioned.

If a deployment introduces a serious application failure, the application version should be rollback-capable.

Database rollback requires additional care.

Application rollback must not automatically imply destructive database rollback.

Database migrations should therefore prefer backward-compatible changes where practical.

---

## 21. CI/CD

The initial CI/CD pipeline should include:

```text
Install
  ↓
Lint
  ↓
Typecheck
  ↓
Unit Tests
  ↓
Integration Tests
  ↓
Build
  ↓
Deploy
```

E2E tests may run before deployment or as a deployment gate depending on execution time.

Production deployment should not occur when required quality gates fail.

---

## 22. Dependency Management

Dependencies should be kept reasonably current.

The project should:

- Review dependency updates regularly.
- Remove unused dependencies.
- Avoid unnecessary libraries.
- Monitor security advisories.
- Avoid adding infrastructure dependencies without a clear requirement.

Dependency count should remain manageable.

---

## 23. Operational Runbook

The project should eventually contain a short operational runbook covering:

### Deployment

- How to deploy.
- How to verify deployment.
- How to inspect logs.
- How to run migrations.

### Rollback

- How to rollback application versions.
- What to do if a migration has already run.

### Backup

- How backups are created.
- Where backups are stored.
- Retention rules.

### Restore

- How to restore PostgreSQL.
- How to restore files.
- How to reconnect the application.

### Account Operations

- How to deactivate an account.
- How to reset a password.
- How to recover from authentication problems.

### Import Failures

- How to inspect an ImportJob.
- How to identify failed rows.
- How to safely retry an import.

---

## 24. Production Readiness Checklist

Before production launch, verify:

### Application

- [ ] Frontend builds successfully.
- [ ] Backend builds successfully.
- [ ] Required environment variables are configured.
- [ ] Production configuration is separated from development.
- [ ] Health endpoint works.

### Database

- [ ] PostgreSQL is not publicly exposed.
- [ ] Production migrations are applied.
- [ ] Database constraints are active.
- [ ] Backup is configured.
- [ ] Restore procedure has been tested.

### Security

- [ ] HTTPS is enabled.
- [ ] Secure cookies are configured.
- [ ] CORS is restricted.
- [ ] Authentication rate limiting is enabled.
- [ ] Secrets are not committed.
- [ ] Production errors do not expose sensitive information.
- [ ] File storage is private.

### Operations

- [ ] Application logs are available.
- [ ] Error monitoring is configured.
- [ ] Request correlation is available.
- [ ] Deployment version can be identified.
- [ ] Rollback procedure is documented.

### Core Workflows

- [ ] Login works.
- [ ] Supervisor workflow works.
- [ ] Teacher workflow works.
- [ ] Student/class workflow works.
- [ ] Attendance works.
- [ ] Lesson plans work.
- [ ] Promotion workflow works.
- [ ] Substitution workflow works.
- [ ] Payroll workflow works.
- [ ] Import workflow works.
- [ ] Tickets and attachments work.
- [ ] Notifications work.
- [ ] Audit logging works.

---

## 25. Infrastructure Principles

EduTech should follow these principles:

1. Prefer simple infrastructure.
2. Do not introduce microservices prematurely.
3. Do not introduce distributed systems without a demonstrated need.
4. Keep PostgreSQL protected and private.
5. Treat backups and restore testing as part of the system, not an afterthought.
6. Keep secrets outside source control.
7. Make deployments observable and reversible.
8. Prefer predictable operations over clever infrastructure.
9. Scale only when actual workload requires it.
10. Keep infrastructure replaceable where practical.

---

## 26. Open Infrastructure Decisions

The following decisions remain intentionally open:

1. Hosting provider.
2. Reverse proxy choice.
3. PostgreSQL hosting model.
4. External file-storage provider.
5. Authentication/session implementation details.
6. Backup frequency.
7. Backup retention.
8. RPO/RTO targets.
9. Error-monitoring provider.
10. CI/CD provider.
11. Background-job mechanism if required.
12. Production domain and networking configuration.

These decisions should be made during implementation based on actual deployment requirements rather than prematurely.

---

## 27. Final Principle

EduTech should be operationally simple but not operationally fragile.

The first production architecture should be capable of supporting the complete MVP without requiring a large infrastructure stack.

The system should gain complexity only when real requirements justify it.
