import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { applyMigrations } from '../helpers/migration-helper';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { academicTerms } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { tickets, attachments } from '../../apps/api/src/infrastructure/database/schema/support.schema';
import { payrolls, payrollItems } from '../../apps/api/src/infrastructure/database/schema/payroll.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { PayrollService } from '../../apps/api/src/payroll/application/services/payroll.service';
import { PayrollPolicy } from '../../apps/api/src/payroll/domain/policies/payroll.policy';
import { PayrollController, TeacherPayrollController } from '../../apps/api/src/payroll/presentation/payroll.controller';
import { TicketService } from '../../apps/api/src/support/application/services/ticket.service';
import { TicketsController } from '../../apps/api/src/support/presentation/tickets.controller';
import { NotificationService } from '../../apps/api/src/notifications/application/services/notification.service';
import { AuthController } from '../../apps/api/src/auth/presentation/auth.controller';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { ApiRateLimiterGuard } from '../../apps/api/src/shared/guards/api-rate-limiter.guard';
import { CatchAllController } from '../../apps/api/src/shared/controllers/catch-all.controller';
import { eq, and } from 'drizzle-orm';

let sharedDb: any;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    AuthController,
    PayrollController,
    TeacherPayrollController,
    TicketsController,
    CatchAllController,
  ],
  providers: [
    PayrollService,
    PayrollPolicy,
    TicketService,
    NotificationService,
    AuthService,
    AuthGuard,
    RolesGuard,
    {
      provide: PASSWORD_HASHER,
      useClass: ScryptPasswordHasher,
    },
    {
      provide: SESSION_TOKEN_SERVICE,
      useClass: CryptoSessionTokenService,
    },
    {
      provide: LOGIN_RATE_LIMITER,
      useClass: MemoryLoginRateLimiter,
    },
    {
      provide: SECURITY_AUDIT_SERVICE,
      useClass: DrizzleSecurityAuditService,
    },
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
    {
      provide: APP_GUARD,
      useClass: ApiRateLimiterGuard,
    },
  ],
})
class TestSecurityHardeningModule {}

describe('Phase 12: Audit and Security Hardening Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;

  let supervisorToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  let supervisorAccountId: string;
  let teacherAAccountId: string;
  let teacherBAccountId: string;

  let teacherAId: string;
  let teacherBId: string;

  let termId: string;
  let ticketBId: string;
  let payrollAId: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;

    // Build Nest Application
    app = await NestFactory.create(TestSecurityHardeningModule);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    const server = app.getHttpServer();
    await server.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;

    const hasher = new ScryptPasswordHasher();
    const tokenService = new CryptoSessionTokenService();

    // Seed roles
    const [supRole] = await db.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tchRole] = await db.insert(roles).values({ name: 'TEACHER' }).returning();

    const pass = 'Password123!';
    const hash = await hasher.hash(pass);
    const now = new Date();

    // 1. Seed Supervisor
    const [supervisorAcc] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-001',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    supervisorAccountId = supervisorAcc.id;

    await db.insert(accountRoles).values({
      accountId: supervisorAcc.id,
      roleId: supRole.id,
    });

    const supSession = tokenService.generateToken();
    await db.insert(schema.sessions).values({
      accountId: supervisorAccountId,
      tokenHash: supSession.tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    });
    supervisorToken = supSession.rawToken;

    // 2. Seed Teacher A
    const [tRecA] = await db
      .insert(teachers)
      .values({
        firstName: 'Alice',
        lastName: 'Smith',
        baseRate: '200.00',
        isActive: true,
      })
      .returning();
    teacherAId = tRecA.id;

    const [tAccA] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-001',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    teacherAAccountId = tAccA.id;

    await db.update(teachers).set({ accountId: teacherAAccountId }).where(eq(teachers.id, teacherAId));
    await db.insert(accountRoles).values({
      accountId: teacherAAccountId,
      roleId: tchRole.id,
    });

    const tSessionA = tokenService.generateToken();
    await db.insert(schema.sessions).values({
      accountId: teacherAAccountId,
      tokenHash: tSessionA.tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    });
    teacherAToken = tSessionA.rawToken;

    // 3. Seed Teacher B
    const [tRecB] = await db
      .insert(teachers)
      .values({
        firstName: 'Bob',
        lastName: 'Jones',
        baseRate: '250.00',
        isActive: true,
      })
      .returning();
    teacherBId = tRecB.id;

    const [tAccB] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-002',
        passwordHash: hash,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    teacherBAccountId = tAccB.id;

    await db.update(teachers).set({ accountId: teacherBAccountId }).where(eq(teachers.id, teacherBId));
    await db.insert(accountRoles).values({
      accountId: teacherBAccountId,
      roleId: tchRole.id,
    });

    const tSessionB = tokenService.generateToken();
    await db.insert(schema.sessions).values({
      accountId: teacherBAccountId,
      tokenHash: tSessionB.tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    });
    teacherBToken = tSessionB.rawToken;

    // Seed Academic Term
    const [term] = await db
      .insert(academicTerms)
      .values({
        name: 'Fall 2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-31'),
        isActive: true,
      })
      .returning();
    termId = term.id;

    // Seed Ticket B owned by Teacher B
    const [ticketB] = await db
      .insert(tickets)
      .values({
        title: 'Issue with Class A',
        description: 'Need help',
        status: 'OPEN',
        type: 'OTHER',
        createdBy: teacherBAccountId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    ticketBId = ticketB.id;

    // Seed Payroll A for Teacher A
    const [payrollA] = await db
      .insert(payrolls)
      .values({
        teacherId: teacherAId,
        academicTermId: termId,
        status: 'DRAFT',
        totalAmount: '0.00',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    payrollAId = payrollA.id;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // AUTHENTICATION & COOKIE SECURITY TESTS
  // ==========================================
  describe('Authentication & Cookie Security', () => {
    it('unauthenticated request is denied', async () => {
      const res = await fetch(`${baseUrl}/tickets`);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'UNAUTHENTICATED');
    });

    it('invalid or expired session is denied', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: 'Bearer invalid-token-xyz' },
      });
      assert.strictEqual(res.status, 401);
    });

    it('session cookie attributes are configured correctly upon login', async () => {
      // Temporarily mock NODE_ENV to production to test secure cookie attributes
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personnelCode: 'TCH-001',
            password: 'Password123!',
          }),
        });
        assert.strictEqual(res.status, 200);
        const cookieHeader = res.headers.get('set-cookie');
        assert.ok(cookieHeader, 'Set-Cookie header should be present');
        assert.ok(cookieHeader.toLowerCase().includes('httponly'), 'Should have HttpOnly');
        assert.ok(cookieHeader.toLowerCase().includes('secure'), 'Should have Secure under production env');
        assert.ok(cookieHeader.toLowerCase().includes('samesite=lax'), 'Should have SameSite=Lax');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ==========================================
  // DATABASE UNIQUE CONSTRAINT TESTS
  // ==========================================
  describe('Database Unique Constraints (Concurrency Hardening)', () => {
    it('prevents creating duplicate payrolls for the same teacher and academic term', async () => {
      // Attempt to create a duplicate payroll directly in database
      await assert.rejects(
        async () => {
          await db.insert(payrolls).values({
            teacherId: teacherAId,
            academicTermId: termId,
            status: 'DRAFT',
            totalAmount: '100.00',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        },
        (err: any) => {
          const errMsg = err?.message || '';
          const causeMsg = err?.cause?.message || String(err?.cause || '');
          return errMsg.includes('Failed query') || causeMsg.includes('unique') || causeMsg.includes('duplicate');
        },
        'Should reject duplicate teacher/term pair with UNIQUE constraint violation',
      );
    });
  });

  // ==========================================
  // OBJECT-LEVEL AUTHORIZATION & IDOR TESTS
  // ==========================================
  describe('Object-Level Authorization & IDOR Protection', () => {
    it('Teacher A cannot view Teacher B payroll', async () => {
      const res = await fetch(`${baseUrl}/teachers/${teacherBId}/payrolls`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(res.status, 403, 'Should forbid access to other teacher payroll list');
    });

    it('Teacher A cannot view payroll details of Teacher B via IDOR', async () => {
      // Fetch a payroll for Teacher B (seed one first)
      const [payrollB] = await db
        .insert(payrolls)
        .values({
          teacherId: teacherBId,
          academicTermId: termId,
          status: 'DRAFT',
          totalAmount: '0.00',
        })
        .returning();

      const res = await fetch(`${baseUrl}/payrolls/${payrollB.id}`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(res.status, 403, 'Should reject other teacher viewing payroll detail');
    });

    it('Teacher A cannot view or manipulate Teacher B ticket', async () => {
      // View ticketB (owned by Bob/Teacher B) using Alice/Teacher A token
      const resGet = await fetch(`${baseUrl}/tickets/${ticketBId}`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(resGet.status, 403, 'Should forbid viewing other user ticket');

      const resPatch = await fetch(`${baseUrl}/tickets/${ticketBId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Hacked Title' }),
      });
      assert.strictEqual(resPatch.status, 403, 'Should forbid modifying other user ticket');
    });

    it('Teacher A cannot access or add attachments to Teacher B ticket', async () => {
      const resGet = await fetch(`${baseUrl}/tickets/${ticketBId}/attachments`, {
        headers: { Authorization: `Bearer ${teacherAToken}` },
      });
      assert.strictEqual(resGet.status, 403, 'Should forbid listing attachments of other user ticket');

      const resPost = await fetch(`${baseUrl}/tickets/${ticketBId}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'confidential.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          storageKey: 'uploads/confidential.pdf',
        }),
      });
      assert.strictEqual(resPost.status, 403, 'Should forbid adding attachment to other user ticket');
    });
  });

  // ==========================================
  // ATTACHMENT PATH TRAVERSAL TESTS
  // ==========================================
  describe('Attachment Path Traversal Protection', () => {
    it('prevents adding attachment with path traversal characters in storageKey', async () => {
      // Create a ticket owned by Alice so she has write access to it
      const [ticketA] = await db
        .insert(tickets)
        .values({
          title: 'Alice Issue',
          description: 'Help Alice',
          status: 'OPEN',
          type: 'OTHER',
          createdBy: teacherAAccountId,
        })
        .returning();

      const res = await fetch(`${baseUrl}/tickets/${ticketA.id}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: 'hacked.txt',
          mimeType: 'text/plain',
          size: 100,
          storageKey: 'uploads/../../etc/passwd',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'INVALID_INPUT');
      assert.ok(json.error.message.includes('path traversal'));
    });
  });

  // ==========================================
  // STATE INTEGRITY TESTS
  // ==========================================
  describe('State Integrity Enforcement', () => {
    it('prevents manual adjustments on finalized payrolls', async () => {
      // Set payroll A to FINALIZED
      await db
        .update(payrolls)
        .set({ status: 'FINALIZED' })
        .where(eq(payrolls.id, payrollAId));

      const res = await fetch(`${baseUrl}/payrolls/${payrollAId}/adjustments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supervisorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: '50.00',
          description: 'Production bonus',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'PAYROLL_ALREADY_FINALIZED');
    });
  });

  // ==========================================
  // GLOBAL RATE LIMITING TESTS
  // ==========================================
  describe('Global Rate Limiting Protection', () => {
    it('allows requests below threshold and triggers 429 above threshold', async () => {
      const headers = { 'x-test-rate-limit': 'true' };

      // Request 1: Succeeds (not rate limited, returns 404)
      const res1 = await fetch(`${baseUrl}/non-existent-limit-1`, { headers });
      assert.notStrictEqual(res1.status, 429);

      // Request 2: Succeeds (limit is 2, returns 404)
      const res2 = await fetch(`${baseUrl}/non-existent-limit-1`, { headers });
      assert.notStrictEqual(res2.status, 429);

      // Request 3: Exceeds limit (triggers 429)
      const res3 = await fetch(`${baseUrl}/non-existent-limit-1`, { headers });
      assert.strictEqual(res3.status, 429);
      const json = await res3.json();
      assert.strictEqual(json.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(json.error.message, 'Too many requests, please try again later.');
    });

    it('Test A & B — prevents rate-limit bypass via spoofed X-Forwarded-For headers', async () => {
      // Temporarily mock NODE_ENV to production to enforce strict proxy trust checks
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Request 1: succeeds (not rate limited, returns 404)
        const res1 = await fetch(`${baseUrl}/non-existent-limit-2`, {
          headers: {
            'x-test-rate-limit': 'true',
            'X-Forwarded-For': '1.1.1.1',
          },
        });
        assert.notStrictEqual(res1.status, 429);

        // Request 2: succeeds (returns 404)
        const res2 = await fetch(`${baseUrl}/non-existent-limit-2`, {
          headers: {
            'x-test-rate-limit': 'true',
            'X-Forwarded-For': '2.2.2.2',
          },
        });
        assert.notStrictEqual(res2.status, 429);

        // Request 3: Exceeds limit (triggers 429 because the spoofed header was ignored and stable socket IP was used!)
        const res3 = await fetch(`${baseUrl}/non-existent-limit-2`, {
          headers: {
            'x-test-rate-limit': 'true',
            'X-Forwarded-For': '3.3.3.3',
          },
        });
        assert.strictEqual(res3.status, 429, 'Spoofed X-Forwarded-For should be ignored and trigger 429');
        const json = await res3.json();
        assert.strictEqual(json.error.code, 'RATE_LIMIT_EXCEEDED');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('Test D — standard/default production limit route works without being affected by the test hook', async () => {
      // Send 5 rapid requests WITHOUT the test hook header to a fresh endpoint
      // Since default limits are 200/60, none of these should hit a 429
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${baseUrl}/non-existent-limit-3`);
        assert.notStrictEqual(res.status, 429);
      }
    });

    it('Test E — test hook cannot disable or bypass rate limiting in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Use POST method on a fresh route to ensure a clean rate limiting bucket is used
        const res1 = await fetch(`${baseUrl}/non-existent-limit-4`, {
          method: 'POST',
          headers: {
            'x-test-rate-limit': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.notStrictEqual(res1.status, 429);

        const res2 = await fetch(`${baseUrl}/non-existent-limit-4`, {
          method: 'POST',
          headers: {
            'x-test-rate-limit': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.notStrictEqual(res2.status, 429);

        const res3 = await fetch(`${baseUrl}/non-existent-limit-4`, {
          method: 'POST',
          headers: {
            'x-test-rate-limit': 'true',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res3.status, 429);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ==========================================
  // PRODUCTION ERROR SANITIZATION TESTS
  // ==========================================
  describe('Production Error Sanitization', () => {
    it('returns raw message under development environment', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        // Querying tickets with a malformed UUID 'invalid-uuid-123' will throw a DB query error
        const res = await fetch(`${baseUrl}/tickets/invalid-uuid-123`, {
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });
        assert.strictEqual(res.status, 500);
        const json = await res.json();
        assert.strictEqual(json.error.code, 'INTERNAL_ERROR');
        assert.ok(json.error.message.includes('Failed query') || json.error.message.includes('select'));
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('returns generic sanitized message under production environment', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await fetch(`${baseUrl}/tickets/invalid-uuid-123`, {
          headers: { Authorization: `Bearer ${supervisorToken}` },
        });
        assert.strictEqual(res.status, 500);
        const json = await res.json();
        assert.strictEqual(json.error.code, 'INTERNAL_ERROR');
        assert.strictEqual(json.error.message, 'An unexpected error occurred.');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ==========================================
  // SERVER-DERIVED ACTOR IDENTITIES & AUDIT
  // ==========================================
  describe('Audit Trail & Identity Integrity', () => {
    it('verifies actor identity in audit logs is strictly server-derived', async () => {
      // Let's create a ticket using Alice/Teacher A's account
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${teacherAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Integrity Test Ticket',
          description: 'Valid description',
          type: 'OTHER',
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      const ticketId = json.id;

      // Query audit logs table directly to verify actorAccountId matches Alice
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, ticketId), eq(auditLogs.action, 'CREATE_TICKET')))
        .limit(1);

      assert.ok(auditLog, 'Audit log entry should be created for CREATE_TICKET');
      assert.strictEqual(auditLog.actorAccountId, teacherAAccountId, 'Actor account ID must be Alice (server-derived)');
    });
  });
});
