import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, SESSION_COOKIE_NAME } from '../../apps/api/src/auth/presentation/guards/auth.guard';
import { RolesGuard } from '../../apps/api/src/auth/presentation/guards/roles.guard';
import type { AuthUser } from '@edutech/shared';

function createMockContext(request: any, handlerMetadata: Record<string, any> = {}): ExecutionContext {
  const reflector = new Reflector();
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('AuthGuard & RolesGuard', () => {
  const mockUser: AuthUser = {
    id: '12345678-1234-1234-1234-123456789abc',
    personnelCode: '1001',
    isActive: true,
    roles: ['TEACHER'],
    teacherId: 'teacher-1',
  };

  const mockAuthService = {
    validateSession: async (token: string) => {
      if (token === 'valid-token') {
        return mockUser;
      }
      return null;
    },
  };

  it('AuthGuard should allow access when @Public() metadata is present', async () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === 'isPublic',
    } as unknown as Reflector;

    const guard = new AuthGuard(reflector, mockAuthService as any);
    const req = { headers: {} };
    const ctx = createMockContext(req);

    const allowed = await guard.canActivate(ctx);
    assert.strictEqual(allowed, true);
  });

  it('AuthGuard should throw 401 UNAUTHENTICATED when no token is provided', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;

    const guard = new AuthGuard(reflector, mockAuthService as any);
    const req = { headers: {} };
    const ctx = createMockContext(req);

    await assert.rejects(
      async () => guard.canActivate(ctx),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.strictEqual(err.getResponse().code, 'UNAUTHENTICATED');
        return true;
      },
    );
  });

  it('AuthGuard should throw 401 UNAUTHENTICATED when session token is invalid', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;

    const guard = new AuthGuard(reflector, mockAuthService as any);
    const req = {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=invalid-or-expired-token`,
      },
    };
    const ctx = createMockContext(req);

    await assert.rejects(
      async () => guard.canActivate(ctx),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.strictEqual(err.getResponse().code, 'UNAUTHENTICATED');
        return true;
      },
    );
  });

  it('AuthGuard should allow and attach user when valid cookie is provided', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;

    const guard = new AuthGuard(reflector, mockAuthService as any);
    const req: any = {
      headers: {
        cookie: `some_other=123; ${SESSION_COOKIE_NAME}=valid-token`,
      },
    };
    const ctx = createMockContext(req);

    const allowed = await guard.canActivate(ctx);
    assert.strictEqual(allowed, true);
    assert.deepStrictEqual(req.user, mockUser);
    assert.strictEqual(req.rawSessionToken, 'valid-token');
  });

  it('AuthGuard should allow and attach user when valid Bearer header is provided', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;

    const guard = new AuthGuard(reflector, mockAuthService as any);
    const req: any = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };
    const ctx = createMockContext(req);

    const allowed = await guard.canActivate(ctx);
    assert.strictEqual(allowed, true);
    assert.deepStrictEqual(req.user, mockUser);
  });

  it('RolesGuard should allow when no roles required', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const ctx = createMockContext({ user: mockUser });

    assert.strictEqual(guard.canActivate(ctx), true);
  });

  it('RolesGuard should allow when user possesses the required role', () => {
    const reflector = {
      getAllAndOverride: () => ['TEACHER'],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const ctx = createMockContext({ user: mockUser });

    assert.strictEqual(guard.canActivate(ctx), true);
  });

  it('RolesGuard should throw 403 FORBIDDEN when user lacks required role', () => {
    const reflector = {
      getAllAndOverride: () => ['SUPERVISOR'],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const ctx = createMockContext({ user: mockUser });

    assert.throws(
      () => guard.canActivate(ctx),
      (err: any) => {
        assert.ok(err instanceof ForbiddenException);
        assert.strictEqual(err.getResponse().code, 'FORBIDDEN');
        return true;
      },
    );
  });
});
