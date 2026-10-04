import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthController } from '../../apps/api/src/auth/presentation/auth.controller';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { TeacherOwnershipPolicy } from '../../apps/api/src/auth/presentation/policies/teacher-ownership.policy';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import { applyMigrations } from '../helpers/migration-helper';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../../apps/api/src/auth/domain/auth-tokens';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';

let sharedDb: any;

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    RolesGuard,
    TeacherOwnershipPolicy,
    {
      provide: DRIZZLE_DB,
      useFactory: () => sharedDb,
    },
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
  ],
})
class TestApiModule {}

describe('Auth API HTTP Endpoint Tests', () => {
  let pg: PGlite;
  let db: any;
  let app: INestApplication;
  let baseUrl: string;
  const hasher = new ScryptPasswordHasher();

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    sharedDb = db;

    // Seed supervisor role and test account
    const [supRole] = await db
      .insert(roles)
      .values({ name: 'SUPERVISOR' })
      .returning();

    const passwordHash = await hasher.hash('ApiTestPassword2026!');
    const [testAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'API-USER-01',
        passwordHash,
        isActive: true,
      })
      .returning();

    await db.insert(accountRoles).values({
      accountId: testAccount.id,
      roleId: supRole.id,
    });

    // Create Nest app
    app = await NestFactory.create(TestApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 4000;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (pg) {
      await pg.close();
    }
  });

  it('POST /auth/login - rejects missing fields with 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  it('POST /auth/login - rejects invalid credentials with 401 INVALID_CREDENTIALS', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personnelCode: 'API-USER-01',
        password: 'IncorrectPassword',
      }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('GET /auth/me - rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
  });

  it('Complete HTTP workflow: Login -> Sets Cookie -> Get /me -> Logout -> /me fails', async () => {
    // 1. Login
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personnelCode: 'API-USER-01',
        password: 'ApiTestPassword2026!',
      }),
    });

    assert.strictEqual(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.strictEqual(loginBody.data.account.personnelCode, 'API-USER-01');
    assert.deepStrictEqual(loginBody.data.account.roles, ['SUPERVISOR']);

    // Check Set-Cookie header
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie, 'Response must include set-cookie header');
    assert.ok(setCookie.includes('edutech_session='), 'Cookie must contain edutech_session');
    assert.ok(setCookie.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');

    // Extract cookie value
    const match = setCookie.match(/edutech_session=([^;]+)/);
    assert.ok(match, 'Must extract session token from cookie');
    const cookieHeader = `edutech_session=${match[1]}`;

    // 2. Query /auth/me using authenticated cookie
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Cookie: cookieHeader,
      },
    });

    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.data.personnelCode, 'API-USER-01');
    assert.strictEqual(meBody.data.isActive, true);
    assert.deepStrictEqual(meBody.data.roles, ['SUPERVISOR']);
    assert.strictEqual((meBody.data as any).passwordHash, undefined, 'Password hash must never leak in /me');

    // 3. Logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
      },
    });

    assert.strictEqual(logoutRes.status, 200);
    const logoutBody = await logoutRes.json();
    assert.strictEqual(logoutBody.data.success, true);

    // Check that logout cleared the cookie
    const logoutCookie = logoutRes.headers.get('set-cookie');
    assert.ok(logoutCookie, 'Logout response must set cleared cookie');

    // 4. Try querying /auth/me again with the old cookie - must be rejected
    const afterLogoutRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Cookie: cookieHeader,
      },
    });

    assert.strictEqual(afterLogoutRes.status, 401);
    const afterLogoutBody = await afterLogoutRes.json();
    assert.strictEqual(afterLogoutBody.error.code, 'UNAUTHENTICATED');
  });
});
