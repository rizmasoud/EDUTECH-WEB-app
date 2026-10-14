/**
 * Login must not fail, and must not record misleading metadata, when User-Agent / forwarded
 * headers are hostile. In-memory PGlite only; nothing here opens `.pglite-storage`.
 */
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
    { provide: DRIZZLE_DB, useFactory: () => sharedDb },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKEN_SERVICE, useClass: CryptoSessionTokenService },
    { provide: LOGIN_RATE_LIMITER, useClass: MemoryLoginRateLimiter },
    { provide: SECURITY_AUDIT_SERVICE, useClass: DrizzleSecurityAuditService },
  ],
})
class TestApiModule {}

const PASSWORD = 'MetadataTestPassword2026!';

describe('Login session metadata (User-Agent / client IP)', () => {
  let pg: PGlite;
  let app: INestApplication;
  let baseUrl: string;
  let express: any;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);
    sharedDb = drizzle(pg, { schema });
    const [role] = await sharedDb.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [acct] = await sharedDb
      .insert(accounts)
      .values({ personnelCode: 'META-01', passwordHash: await new ScryptPasswordHasher().hash(PASSWORD), isActive: true })
      .returning();
    await sharedDb.insert(accountRoles).values({ accountId: acct.id, roleId: role.id });

    app = await NestFactory.create(TestApiModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    express = app.getHttpAdapter().getInstance();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${(address as any).port}/api/v1`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  async function login(headers: Record<string, string>, password = PASSWORD) {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ personnelCode: 'META-01', password }),
    });
  }
  async function lastSession() {
    const r = await pg.query<{ user_agent: string | null; ip_address: string | null }>(
      'select user_agent, ip_address from sessions order by created_at desc, id desc limit 1',
    );
    return r.rows[0];
  }
  async function lastAudit(action: string) {
    const r = await pg.query<{ metadata: any }>(
      'select metadata from audit_logs where action = $1 order by created_at desc, id desc limit 1',
      [action],
    );
    return r.rows[0]?.metadata;
  }
  const LOOPBACK = /^(::ffff:)?127\.0\.0\.1$/;

  it('a 5000-character User-Agent does not break login; it is stored bounded and visibly shortened', async () => {
    const ua = 'Mozilla/5.0 ' + 'x'.repeat(5000);
    const res = await login({ 'User-Agent': ua });
    assert.equal(res.status, 200);
    const s = await lastSession();
    assert.ok(s.user_agent && s.user_agent.length === 255);
    assert.ok(s.user_agent.endsWith('...'));
    assert.ok(ua.startsWith(s.user_agent.slice(0, -3)));
    const audit = await lastAudit('AUTH_LOGIN_SUCCESS');
    assert.equal(audit.userAgent, s.user_agent, 'audit record uses the same bounded value');
  });

  it('a normal User-Agent is stored unchanged', async () => {
    assert.equal((await login({ 'User-Agent': 'MetaTest/1.0' })).status, 200);
    assert.equal((await lastSession()).user_agent, 'MetaTest/1.0');
  });

  it('failed logins with hostile headers still return 401 and write a bounded audit record', async () => {
    const res = await login({ 'User-Agent': 'y'.repeat(4000) }, 'wrong-password');
    assert.equal(res.status, 401);
    const audit = await lastAudit('AUTH_LOGIN_FAILURE');
    assert.equal(audit.userAgent.length, 255);
  });

  it('without a trusted proxy, a spoofed X-Forwarded-For is ignored and the socket address is stored', async () => {
    express.set('trust proxy', false);
    const res = await login({ 'X-Forwarded-For': '203.0.113.99, 198.51.100.1', 'User-Agent': 'NoProxy/1.0' });
    assert.equal(res.status, 200);
    const s = await lastSession();
    assert.match(s.ip_address as string, LOOPBACK);
    assert.equal((await lastAudit('AUTH_LOGIN_SUCCESS')).ipAddress, s.ip_address);
  });

  it('a very long forwarded header with no trusted proxy does not affect login or the stored IP', async () => {
    express.set('trust proxy', false);
    const res = await login({ 'X-Forwarded-For': '9'.repeat(3000) });
    assert.equal(res.status, 200);
    assert.match((await lastSession()).ip_address as string, LOOPBACK);
  });

  it("with the dev/test default trust proxy 'loopback', the framework-resolved client IP is stored", async () => {
    express.set('trust proxy', 'loopback');
    const res = await login({ 'X-Forwarded-For': '203.0.113.7' });
    assert.equal(res.status, 200);
    assert.equal((await lastSession()).ip_address, '203.0.113.7');
  });

  it("with trust proxy 'loopback', a garbage or over-long forwarded value is stored as NULL (never truncated) and login succeeds", async () => {
    express.set('trust proxy', 'loopback');
    for (const xff of ['x'.repeat(3000), 'not-an-ip', '1'.repeat(70)]) {
      const res = await login({ 'X-Forwarded-For': xff });
      assert.equal(res.status, 200, xff.slice(0, 20));
      assert.equal((await lastSession()).ip_address, null, xff.slice(0, 20));
    }
  });
});
