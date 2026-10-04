import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts, roles, accountRoles, sessions } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { AuthService } from '../../apps/api/src/auth/application/auth.service';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from '../../apps/api/src/auth/infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from '../../apps/api/src/auth/infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from '../../apps/api/src/auth/infrastructure/drizzle-security-audit.service';
import { applyMigrations } from '../helpers/migration-helper';

describe('Auth Workflow & Database Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let authService: AuthService;
  let hasher: ScryptPasswordHasher;
  let tokenService: CryptoSessionTokenService;
  let rateLimiter: MemoryLoginRateLimiter;
  let auditService: DrizzleSecurityAuditService;

  let supervisorRoleId: string;
  let teacherRoleId: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    hasher = new ScryptPasswordHasher();
    tokenService = new CryptoSessionTokenService();
    rateLimiter = new MemoryLoginRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    auditService = new DrizzleSecurityAuditService(db);

    authService = new AuthService(
      db,
      hasher,
      tokenService,
      rateLimiter,
      auditService,
    );

    // Seed roles
    const [sup] = await db
      .insert(roles)
      .values({ name: 'SUPERVISOR' })
      .returning();
    const [tch] = await db
      .insert(roles)
      .values({ name: 'TEACHER' })
      .returning();

    supervisorRoleId = sup.id;
    teacherRoleId = tch.id;
  });

  after(async () => {
    if (pg) {
      await pg.close();
    }
  });

  it('1. Successful Login generates session and audit log', async () => {
    const rawPass = 'SupervisorSecret2026!';
    const passwordHash = await hasher.hash(rawPass);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-101',
        passwordHash,
        isActive: true,
      })
      .returning();

    // Assign SUPERVISOR role
    await db.insert(accountRoles).values({
      accountId: account.id,
      roleId: supervisorRoleId,
    });

    const loginResult = await authService.login(
      { personnelCode: 'SUP-101', password: rawPass },
      { ipAddress: '127.0.0.1', userAgent: 'IntegrationTest/1.0' },
    );

    assert.ok(loginResult.rawToken, 'Must return raw session token');
    assert.strictEqual(loginResult.account.personnelCode, 'SUP-101');
    assert.strictEqual(loginResult.account.isActive, true);
    assert.deepStrictEqual(loginResult.account.roles, ['SUPERVISOR']);
    assert.strictEqual(loginResult.account.teacherId, null);
    assert.strictEqual((loginResult.account as any).passwordHash, undefined, 'Password hash must never leak in auth response');

    // Verify session in database
    const sessionTokenHash = tokenService.hashToken(loginResult.rawToken);
    const [dbSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, sessionTokenHash));

    assert.ok(dbSession, 'Session must exist in database');
    assert.strictEqual(dbSession.accountId, account.id);
    assert.strictEqual(dbSession.invalidatedAt, null);
    assert.ok(dbSession.expiresAt > new Date(), 'Session expiration must be in the future');

    // Verify audit log
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'AUTH_LOGIN_SUCCESS'));

    assert.ok(auditRows.length >= 1, 'AUTH_LOGIN_SUCCESS audit log must exist');
    const log = auditRows[auditRows.length - 1];
    assert.strictEqual(log.entityId, account.id);
    assert.strictEqual(log.actorAccountId, account.id);
    assert.strictEqual((log.metadata as any)?.personnelCode, 'SUP-101');
    assert.strictEqual((log.metadata as any)?.password, undefined, 'Audit log must not contain password');
    assert.strictEqual((log.metadata as any)?.rawToken, undefined, 'Audit log must not contain session token');
  });

  it('2. Invalid password triggers 401 INVALID_CREDENTIALS and records audit failure', async () => {
    await assert.rejects(
      async () =>
        authService.login(
          { personnelCode: 'SUP-101', password: 'WrongPassword!' },
          { ipAddress: '127.0.0.1' },
        ),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.strictEqual(err.getResponse().code, 'INVALID_CREDENTIALS');
        return true;
      },
    );

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'AUTH_LOGIN_FAILURE'));

    assert.ok(auditRows.length >= 1, 'AUTH_LOGIN_FAILURE audit log must exist');
    const lastLog = auditRows[auditRows.length - 1];
    assert.strictEqual((lastLog.metadata as any)?.reason, 'INVALID_CREDENTIALS');
  });

  it('3. Nonexistent personnel code triggers 401 INVALID_CREDENTIALS', async () => {
    await assert.rejects(
      async () =>
        authService.login(
          { personnelCode: 'NON-EXISTENT-999', password: 'AnyPassword' },
          { ipAddress: '127.0.0.1' },
        ),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.strictEqual(err.getResponse().code, 'INVALID_CREDENTIALS');
        return true;
      },
    );
  });

  it('4. Inactive account triggers 401 ACCOUNT_INACTIVE', async () => {
    const rawPass = 'InactivePass1!';
    const passwordHash = await hasher.hash(rawPass);

    await db.insert(accounts).values({
      personnelCode: 'INACTIVE-101',
      passwordHash,
      isActive: false,
    });

    await assert.rejects(
      async () =>
        authService.login(
          { personnelCode: 'INACTIVE-101', password: rawPass },
          { ipAddress: '127.0.0.1' },
        ),
      (err: any) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.strictEqual(err.getResponse().code, 'ACCOUNT_INACTIVE');
        return true;
      },
    );
  });

  it('5. Session validation and expiration check', async () => {
    const rawPass = 'SessionCheckPass!';
    const passwordHash = await hasher.hash(rawPass);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SESSION-USER',
        passwordHash,
        isActive: true,
      })
      .returning();

    const loginRes = await authService.login({
      personnelCode: 'SESSION-USER',
      password: rawPass,
    });

    // Validate active session
    const validUser = await authService.validateSession(loginRes.rawToken);
    assert.ok(validUser, 'Valid session should return user');
    assert.strictEqual(validUser.personnelCode, 'SESSION-USER');

    // Simulate session expiration in database
    const tokenHash = tokenService.hashToken(loginRes.rawToken);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000 * 60) })
      .where(eq(sessions.tokenHash, tokenHash));

    // Validating expired session should return null
    const expiredUser = await authService.validateSession(loginRes.rawToken);
    assert.strictEqual(expiredUser, null, 'Expired session must return null');
  });

  it('6. Logout invalidates session and writes audit event', async () => {
    const rawPass = 'LogoutPass123!';
    const passwordHash = await hasher.hash(rawPass);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'LOGOUT-USER',
        passwordHash,
        isActive: true,
      })
      .returning();

    const loginRes = await authService.login({
      personnelCode: 'LOGOUT-USER',
      password: rawPass,
    });

    // Verify session works before logout
    const beforeUser = await authService.validateSession(loginRes.rawToken);
    assert.ok(beforeUser);

    // Perform logout
    await authService.logout(loginRes.rawToken, account.id);

    // Verify session is invalidated
    const afterUser = await authService.validateSession(loginRes.rawToken);
    assert.strictEqual(afterUser, null, 'Invalidated session must return null');

    // Verify audit log
    const logoutLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'AUTH_LOGOUT'));
    assert.ok(logoutLogs.length >= 1, 'AUTH_LOGOUT audit log must exist');
  });

  it('7. Teacher Account link correctly populates teacherId on AuthUser', async () => {
    const rawPass = 'TeacherPass123!';
    const passwordHash = await hasher.hash(rawPass);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-201',
        passwordHash,
        isActive: true,
      })
      .returning();

    await db.insert(accountRoles).values({
      accountId: account.id,
      roleId: teacherRoleId,
    });

    // Create linked teacher domain record
    const [teacher] = await db
      .insert(teachers)
      .values({
        accountId: account.id,
        firstName: 'Zahra',
        lastName: 'Alavi',
        baseRate: '150000.00',
        isActive: true,
      })
      .returning();

    const loginRes = await authService.login({
      personnelCode: 'TCH-201',
      password: rawPass,
    });

    assert.strictEqual(loginRes.account.teacherId, teacher.id);
    assert.deepStrictEqual(loginRes.account.roles, ['TEACHER']);
  });

  it('8. Account Deactivation immediately invalidates active sessions', async () => {
    const rawPass = 'DeactivatePass!';
    const passwordHash = await hasher.hash(rawPass);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'DEACTIVATE-USER',
        passwordHash,
        isActive: true,
      })
      .returning();

    const loginRes = await authService.login({
      personnelCode: 'DEACTIVATE-USER',
      password: rawPass,
    });

    assert.ok(await authService.validateSession(loginRes.rawToken));

    // Deactivate account
    await authService.deactivateAccount(account.id, null);

    // Verify account state
    const [updatedAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id));
    assert.strictEqual(updatedAccount.isActive, false);

    // Session validation must fail
    assert.strictEqual(await authService.validateSession(loginRes.rawToken), null);

    // Re-login must fail
    await assert.rejects(
      async () =>
        authService.login({
          personnelCode: 'DEACTIVATE-USER',
          password: rawPass,
        }),
      (err: any) => {
        assert.strictEqual(err.getResponse().code, 'ACCOUNT_INACTIVE');
        return true;
      },
    );

    // Activate account again
    await authService.activateAccount(account.id, null);
    const [reactivated] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id));
    assert.strictEqual(reactivated.isActive, true);
  });

  it('9. Login rate limiting blocks after threshold and throws 429', async () => {
    const rawPass = 'RateLimitPass!';
    const passwordHash = await hasher.hash(rawPass);

    await db.insert(accounts).values({
      personnelCode: 'RATELIMIT-USER',
      passwordHash,
      isActive: true,
    });

    // Fail 5 times
    for (let i = 0; i < 5; i++) {
      await assert.rejects(async () =>
        authService.login({
          personnelCode: 'RATELIMIT-USER',
          password: 'BadPassword',
        }),
      );
    }

    // 6th attempt should be blocked by rate limiter with 429
    await assert.rejects(
      async () =>
        authService.login({
          personnelCode: 'RATELIMIT-USER',
          password: rawPass,
        }),
      (err: any) => {
        assert.ok(err instanceof HttpException);
        assert.strictEqual(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
        assert.strictEqual(err.getResponse().error.code, 'RATE_LIMIT_EXCEEDED');
        return true;
      },
    );
  });

  it('10. Database enforces unique personnel_code constraint', async () => {
    const passwordHash = await hasher.hash('pass');

    await assert.rejects(async () => {
      await db.insert(accounts).values({
        personnelCode: 'SUP-101', // Already exists from test 1
        passwordHash,
        isActive: true,
      });
    });
  });

  it('11. Database enforces unique session token_hash constraint', async () => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.personnelCode, 'SUP-101'));

    await db.insert(sessions).values({
      accountId: account.id,
      tokenHash: 'duplicate-token-hash-12345',
      expiresAt: new Date(Date.now() + 100000),
    });

    await assert.rejects(async () => {
      await db.insert(sessions).values({
        accountId: account.id,
        tokenHash: 'duplicate-token-hash-12345',
        expiresAt: new Date(Date.now() + 100000),
      });
    });
  });

  it('12. Database cascade deletes sessions when account is deleted', async () => {
    const passwordHash = await hasher.hash('pass');

    const [tempAccount] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TEMP-CASCADE-USER',
        passwordHash,
        isActive: true,
      })
      .returning();

    await db.insert(sessions).values({
      accountId: tempAccount.id,
      tokenHash: 'temp-session-token-hash-abc',
      expiresAt: new Date(Date.now() + 100000),
    });

    // Delete account
    await db.delete(accounts).where(eq(accounts.id, tempAccount.id));

    // Verify session was cascaded
    const remainingSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.accountId, tempAccount.id));

    assert.strictEqual(remainingSessions.length, 0, 'Sessions must be cascade deleted with account');
  });
});
