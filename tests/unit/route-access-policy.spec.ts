/**
 * Static route-access policy: authentication is enforced by default (global AuthGuard) and the set of
 * intentionally public routes is an explicit allowlist. Reads decorator metadata only - no database,
 * no application start, nothing touches `.pglite-storage`.
 */
import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { ApiRateLimiterGuard } from '../../apps/api/src/shared/guards/api-rate-limiter.guard';
import { IS_PUBLIC_KEY } from '../../apps/api/src/auth/presentation/decorators/public.decorator';
import { ROLES_KEY } from '../../apps/api/src/auth/presentation/decorators/roles.decorator';

// Loaded with require() on purpose: a static import would make the root `tsc -p tsconfig.json` type-check
// the whole application graph, which surfaces unrelated pre-existing errors (TS1272 in the health module).
const { AppModule } = require('../../apps/api/src/app.module') as { AppModule: any };

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

/** Verified public by design (see PR description for the evidence). Adding to this list is a policy decision. */
const PUBLIC_ROUTE_ALLOWLIST = ['GET /health', 'POST /auth/login'];

interface RouteInfo {
  route: string;
  controller: string;
  isPublic: boolean;
  roles: string[];
}

function collectRoutes(): RouteInfo[] {
  const modules = new Set<any>();
  const controllers = new Set<any>();
  const walk = (m: any): void => {
    const mod = m?.module ?? m;
    if (!mod || modules.has(mod)) return;
    modules.add(mod);
    for (const c of Reflect.getMetadata('controllers', mod) ?? []) controllers.add(c);
    for (const c of m?.controllers ?? []) controllers.add(c);
    for (const i of [...(Reflect.getMetadata('imports', mod) ?? []), ...(m?.imports ?? [])]) walk(i);
  };
  walk(AppModule);

  const routes: RouteInfo[] = [];
  for (const C of controllers) {
    const base: string = Reflect.getMetadata('path', C);
    for (const name of Object.getOwnPropertyNames(C.prototype)) {
      if (name === 'constructor') continue;
      const handler = C.prototype[name];
      const method = Reflect.getMetadata('method', handler);
      if (method === undefined) continue;
      const path: string = Reflect.getMetadata('path', handler);
      const isPublic = Boolean(Reflect.getMetadata(IS_PUBLIC_KEY, handler) || Reflect.getMetadata(IS_PUBLIC_KEY, C));
      const roles: string[] = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, C) ?? [];
      routes.push({
        route: `${HTTP_METHODS[method]} /${[base, path].filter((x) => x && x !== '/').join('/')}`,
        controller: `${C.name}.${name}`,
        isPublic,
        roles,
      });
    }
  }
  return routes;
}

describe('route access policy', () => {
  const routes = collectRoutes();

  it('discovers the registered API routes', () => {
    assert.ok(routes.length > 100, `expected the full API surface, found ${routes.length}`);
    assert.ok(routes.some((r) => r.route === 'GET /auth/me'));
  });

  it('the public routes are exactly the verified allowlist', () => {
    const pub = routes.filter((r) => r.isPublic).map((r) => r.route).sort();
    assert.deepEqual(pub, [...PUBLIC_ROUTE_ALLOWLIST].sort());
  });

  it('public routes carry no role requirement', () => {
    for (const r of routes.filter((x) => x.isPublic)) assert.deepEqual(r.roles, [], r.route);
  });

  it('AppModule registers AuthGuard as a global guard, after the rate limiter', () => {
    const providers: any[] = Reflect.getMetadata('providers', AppModule) ?? [];
    const globals = providers.filter((p) => p && p.provide === APP_GUARD).map((p) => p.useClass);
    assert.ok(globals.includes(AuthGuard), 'AuthGuard must be an APP_GUARD');
    assert.ok(globals.indexOf(ApiRateLimiterGuard) >= 0 && globals.indexOf(ApiRateLimiterGuard) < globals.indexOf(AuthGuard),
      'rate limiting must still run before authentication');
  });

  it('existing role metadata is preserved on representative real routes', () => {
    const roles = (route: string) => routes.find((r) => r.route === route)?.roles;
    assert.deepEqual(roles('POST /students'), ['SUPERVISOR']);
    assert.deepEqual(roles('POST /payrolls'), ['SUPERVISOR']);
    assert.deepEqual(roles('POST /substitution-requests/:id/respond'), ['TEACHER']);
    assert.deepEqual(roles('GET /sessions'), ['SUPERVISOR', 'TEACHER']);
    assert.deepEqual(roles('GET /students'), []);
  });
});
