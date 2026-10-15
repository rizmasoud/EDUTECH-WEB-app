/**
 * Global AuthGuard behaviour over HTTP. In-memory PGlite only; nothing here opens `.pglite-storage`.
 * Uses the real AuthController, HealthController and StudentsController (with a stub service) plus a
 * small probe controller that has NO per-controller AuthGuard, so protection comes from the global guard.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { DRIZZLE_DB } from '../../apps/api/src/infrastructure/database/drizzle.provider';
import { AuthController } from '../../apps/api/src/auth/presentation/auth.controller';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import { Public } from '../../apps/api/src/auth/presentation/decorators/public.decorator';
import { Roles } from '../../apps/api/src/auth/presentation/decorators/roles.decorator';
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
import { StudentsController } from '../../apps/api/src/students/presentation/students.controller';
import { StudentsService } from '../../apps/api/src/students/application/services/students.service';
import { HttpExceptionFilter } from '../../apps/api/src/shared/filters/http-exception.filter';
import { applyMigrations } from '../helpers/migration-helper';

// Loaded with require() on purpose: a static import would make the root `tsc -p tsconfig.json` type-check
// health module files that have unrelated pre-existing errors (TS1272). Behaviour is identical at runtime.
const { HealthController } = require('../../apps/api/src/health/presentation/health.controller') as { HealthController: any };
const { HealthService } = require('../../apps/api/src/health/application/health.service') as { HealthService: any };

let sharedDb: any;

/**
 * No AuthGuard on this controller on purpose: only the global guard can protect these routes.
 * Decorators are applied functionally because test files are not compiled with `experimentalDecorators`
 * (method decorators would fail), unlike the application sources.
 */
class ProbeController {
  unannotated() {
    return { data: 'unannotated' };
  }
  open() {
    return { data: 'open' };
  }
  supervisor() {
    return { data: 'supervisor' };
  }
  teacher() {
    return { data: 'teacher' };
  }
}
Controller('probe')(ProbeController);
UseGuards(RolesGuard)(ProbeController);
function route(name: keyof ProbeController & string, ...decorators: MethodDecorator[]): void {
  const descriptor = Object.getOwnPropertyDescriptor(ProbeController.prototype, name) as PropertyDescriptor;
  for (const decorate of decorators) decorate(ProbeController.prototype, name, descriptor);
}
route('unannotated', Get('unannotated'));
route('open', Public(), Get('open'));
route('supervisor', Roles('SUPERVISOR'), Get('supervisor'));
route('teacher', Roles('TEACHER'), Get('teacher'));

const studentsStub = {
  findAll: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
  create: async () => ({ id: 'stub' }),
};

@Module({
  controllers: [AuthController, HealthController, StudentsController, ProbeController],
  providers: [
    AuthService,
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: DRIZZLE_DB, useFactory: () => sharedDb },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: SESSION_TOKEN_SERVICE, useClass: CryptoSessionTokenService },
    { provide: LOGIN_RATE_LIMITER, useClass: MemoryLoginRateLimiter },
    { provide: SECURITY_AUDIT_SERVICE, useClass: DrizzleSecurityAuditService },
    { provide: HealthService, useValue: { getHealth: async () => ({ status: 'ok' }) } },
    { provide: StudentsService, useValue: studentsStub },
  ],
})
class TestApiModule {}

describe('Global AuthGuard (HTTP)', () => {
  let pg: PGlite;
  let app: INestApplication;
  let baseUrl: string;
  let rootUrl: string;
  const PASSWORD = 'GlobalGuardPassword2026!';

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);
    sharedDb = drizzle(pg, { schema });
    const hash = await new ScryptPasswordHasher().hash(PASSWORD);
    const [sup] = await sharedDb.insert(roles).values({ name: 'SUPERVISOR' }).returning();
    const [tch] = await sharedDb.insert(roles).values({ name: 'TEACHER' }).returning();
    const mk = async (code: string, roleIds: string[]) => {
      const [a] = await sharedDb.insert(accounts).values({ personnelCode: code, passwordHash: hash, isActive: true }).returning();
      for (const roleId of roleIds) await sharedDb.insert(accountRoles).values({ accountId: a.id, roleId });
    };
    await mk('GG-SUP', [sup.id]);
    await mk('GG-TCH', [tch.id]);
    await mk('GG-BOTH', [sup.id, tch.id]);

    app = await NestFactory.create(TestApiModule, { logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['health'] }); // same as main.ts
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
    const port = (app.getHttpServer().address() as any).port;
    rootUrl = `http://127.0.0.1:${port}`;
    baseUrl = `${rootUrl}/api/v1`;
  });

  after(async () => {
    if (app) await app.close();
    if (pg) await pg.close();
  });

  async function cookieFor(code: string): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelCode: code, password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie') as string;
    return setCookie.split(';')[0];
  }
  const get = (url: string, cookie?: string) => fetch(url, { headers: cookie ? { Cookie: cookie } : {} });

  it('an unannotated route rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
    const res = await get(`${baseUrl}/probe/unannotated`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'UNAUTHENTICATED');
  });

  it('an invalid session cookie is rejected on an unannotated route', async () => {
    const res = await get(`${baseUrl}/probe/unannotated`, 'edutech_session=not-a-real-token');
    assert.equal(res.status, 401);
  });

  it('a @Public() route and the real health endpoint work without a session', async () => {
    assert.equal((await get(`${baseUrl}/probe/open`)).status, 200);
    const health = await get(`${rootUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
  });

  it('login stays public and a wrong password is still 401 INVALID_CREDENTIALS (not UNAUTHENTICATED)', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelCode: 'GG-SUP', password: 'wrong' }),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'INVALID_CREDENTIALS');
  });

  it('/auth/me and /auth/logout still require a session', async () => {
    assert.equal((await get(`${baseUrl}/auth/me`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/auth/logout`, { method: 'POST' })).status, 401);
  });

  it('a valid session reaches protected routes, and logout ends it', async () => {
    const cookie = await cookieFor('GG-TCH');
    assert.equal((await get(`${baseUrl}/probe/unannotated`, cookie)).status, 200);
    const me = await get(`${baseUrl}/auth/me`, cookie);
    assert.equal(me.status, 200);
    assert.deepEqual((await me.json()).data.roles, ['TEACHER']);
    const out = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(out.status, 200);
    assert.equal((await get(`${baseUrl}/probe/unannotated`, cookie)).status, 401);
  });

  it('role restrictions still apply: teacher-only and supervisor-only routes', async () => {
    const teacher = await cookieFor('GG-TCH');
    assert.equal((await get(`${baseUrl}/probe/teacher`, teacher)).status, 200);
    const denied = await get(`${baseUrl}/probe/supervisor`, teacher);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');

    const supervisor = await cookieFor('GG-SUP');
    assert.equal((await get(`${baseUrl}/probe/supervisor`, supervisor)).status, 200);
    assert.equal((await get(`${baseUrl}/probe/teacher`, supervisor)).status, 403);
  });

  it('role restrictions on a real controller (StudentsController) are unchanged', async () => {
    const teacher = await cookieFor('GG-TCH');
    const supervisor = await cookieFor('GG-SUP');
    const post = (cookie?: string) =>
      fetch(`${baseUrl}/students`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: '{}' });
    assert.equal((await post()).status, 401);
    assert.equal((await post(teacher)).status, 403);
    assert.equal((await post(supervisor)).status, 201);
    assert.equal((await get(`${baseUrl}/students`, teacher)).status, 200, 'GET /students has no role restriction');
    assert.equal((await get(`${baseUrl}/students`)).status, 401);
  });

  it('multi-role accounts keep the union-of-roles behaviour', async () => {
    const both = await cookieFor('GG-BOTH');
    assert.equal((await get(`${baseUrl}/probe/supervisor`, both)).status, 200);
    assert.equal((await get(`${baseUrl}/probe/teacher`, both)).status, 200);
    const me = await get(`${baseUrl}/auth/me`, both);
    assert.deepEqual([...(await me.json()).data.roles].sort(), ['SUPERVISOR', 'TEACHER']);
    const post = await fetch(`${baseUrl}/students`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: both }, body: '{}' });
    assert.equal(post.status, 201);
  });

  it('a controller that still declares AuthGuard validates the session only once per request', async () => {
    const cookie = await cookieFor('GG-TCH');
    const auth = app.get(AuthService);
    const original = auth.validateSession.bind(auth);
    let calls = 0;
    auth.validateSession = async (t: string) => {
      calls++;
      return original(t);
    };
    try {
      assert.equal((await get(`${baseUrl}/students`, cookie)).status, 200);
      assert.equal(calls, 1);
    } finally {
      auth.validateSession = original;
    }
  });
});
