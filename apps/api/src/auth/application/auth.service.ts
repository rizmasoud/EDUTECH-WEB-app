import {
  Injectable,
  Inject,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { DRIZZLE_DB } from '../../infrastructure/database/drizzle.provider';
import type { DrizzleDb } from '../../infrastructure/database/drizzle.provider';
import {
  accounts,
  roles,
  accountRoles,
  sessions,
} from '../../infrastructure/database/schema/auth.schema';
import { teachers } from '../../infrastructure/database/schema/teachers.schema';
import type {
  AuthUser,
  LoginDto,
  RoleName,
} from '@edutech/shared';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from '../domain/auth-tokens';
import type { IPasswordHasher } from '../domain/password-hasher.interface';
import type { ISessionTokenService } from '../domain/session-token.interface';
import type { ILoginRateLimiter } from '../domain/rate-limiter.interface';
import type { ISecurityAuditService } from '../domain/security-audit.interface';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: DrizzleDb,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    @Inject(SESSION_TOKEN_SERVICE)
    private readonly sessionTokenService: ISessionTokenService,
    @Inject(LOGIN_RATE_LIMITER)
    private readonly rateLimiter: ILoginRateLimiter,
    @Inject(SECURITY_AUDIT_SERVICE)
    private readonly auditService: ISecurityAuditService,
  ) {}

  async login(
    dto: LoginDto,
    clientInfo: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ account: AuthUser; rawToken: string }> {
    const rateLimitKey = `login:${dto.personnelCode}`;

    if (this.rateLimiter.isRateLimited(rateLimitKey)) {
      await this.auditService.recordEvent({
        action: 'AUTH_RATE_LIMITED',
        entityType: 'Account',
        metadata: {
          personnelCode: dto.personnelCode,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
      });

      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts. Please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Lookup account by personnel code
    const [accountRecord] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.personnelCode, dto.personnelCode))
      .limit(1);

    if (!accountRecord) {
      this.rateLimiter.recordFailure(rateLimitKey);

      await this.auditService.recordEvent({
        action: 'AUTH_LOGIN_FAILURE',
        entityType: 'Account',
        metadata: {
          personnelCode: dto.personnelCode,
          reason: 'INVALID_CREDENTIALS',
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
      });

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid personnel code or password.',
      });
    }

    if (!accountRecord.isActive) {
      this.rateLimiter.recordFailure(rateLimitKey);

      await this.auditService.recordEvent({
        action: 'AUTH_LOGIN_FAILURE',
        entityType: 'Account',
        entityId: accountRecord.id,
        metadata: {
          personnelCode: dto.personnelCode,
          reason: 'ACCOUNT_INACTIVE',
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
      });

      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is inactive.',
      });
    }

    const isPasswordValid = await this.passwordHasher.verify(
      dto.password,
      accountRecord.passwordHash,
    );

    if (!isPasswordValid) {
      this.rateLimiter.recordFailure(rateLimitKey);

      await this.auditService.recordEvent({
        action: 'AUTH_LOGIN_FAILURE',
        entityType: 'Account',
        entityId: accountRecord.id,
        metadata: {
          personnelCode: dto.personnelCode,
          reason: 'INVALID_CREDENTIALS',
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
      });

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid personnel code or password.',
      });
    }

    // Reset rate limiter on successful login
    this.rateLimiter.reset(rateLimitKey);

    // Generate secure session
    const { rawToken, tokenHash } = this.sessionTokenService.generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.db.insert(sessions).values({
      accountId: accountRecord.id,
      tokenHash,
      expiresAt,
      userAgent: clientInfo.userAgent ?? null,
      ipAddress: clientInfo.ipAddress ?? null,
    });

    const user = await this.buildAuthUser(accountRecord.id);

    await this.auditService.recordEvent({
      actorAccountId: accountRecord.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'Account',
      entityId: accountRecord.id,
      metadata: {
        personnelCode: accountRecord.personnelCode,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
    });

    return {
      account: user,
      rawToken,
    };
  }

  async validateSession(rawToken: string): Promise<AuthUser | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    const [activeSession] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.invalidatedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!activeSession) {
      return null;
    }

    const [accountRecord] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, activeSession.accountId))
      .limit(1);

    if (!accountRecord || !accountRecord.isActive) {
      return null;
    }

    return this.buildAuthUser(accountRecord.id);
  }

  async logout(rawToken: string, accountId?: string): Promise<void> {
    if (!rawToken) return;

    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    await this.db
      .update(sessions)
      .set({ invalidatedAt: new Date() })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.invalidatedAt)));

    await this.auditService.recordEvent({
      actorAccountId: accountId ?? null,
      action: 'AUTH_LOGOUT',
      entityType: 'Account',
      entityId: accountId ?? null,
    });
  }

  async activateAccount(accountId: string, actorAccountId?: string): Promise<void> {
    const [accountRecord] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!accountRecord) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found.',
      });
    }

    await this.db
      .update(accounts)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));

    await this.auditService.recordEvent({
      actorAccountId: actorAccountId ?? null,
      action: 'ACCOUNT_ACTIVATED',
      entityType: 'Account',
      entityId: accountId,
    });
  }

  async deactivateAccount(accountId: string, actorAccountId?: string): Promise<void> {
    const [accountRecord] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!accountRecord) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found.',
      });
    }

    await this.db
      .update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));

    // Immediately invalidate all active sessions for deactivated account
    await this.db
      .update(sessions)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(sessions.accountId, accountId),
          isNull(sessions.invalidatedAt),
        ),
      );

    await this.auditService.recordEvent({
      actorAccountId: actorAccountId ?? null,
      action: 'ACCOUNT_DEACTIVATED',
      entityType: 'Account',
      entityId: accountId,
    });
  }

  async buildAuthUser(accountId: string): Promise<AuthUser> {
    const [accountRecord] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!accountRecord) {
      throw new NotFoundException('Account not found');
    }

    // Fetch assigned roles
    const roleRows = await this.db
      .select({ name: roles.name })
      .from(accountRoles)
      .innerJoin(roles, eq(accountRoles.roleId, roles.id))
      .where(eq(accountRoles.accountId, accountId));

    const effectiveRoles = roleRows.map((r: { name: string }) => r.name as RoleName);

    // Fetch linked teacher if any
    const [linkedTeacher] = await this.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.accountId, accountId))
      .limit(1);

    return {
      id: accountRecord.id,
      personnelCode: accountRecord.personnelCode,
      isActive: accountRecord.isActive,
      roles: effectiveRoles,
      teacherId: linkedTeacher?.id ?? null,
      createdAt: accountRecord.createdAt,
      updatedAt: accountRecord.updatedAt,
    };
  }
}
