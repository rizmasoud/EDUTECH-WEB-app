import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthController } from './presentation/auth.controller';
import { AuthService } from './application/auth.service';
import { AuthGuard } from './presentation/guards/auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { TeacherOwnershipPolicy } from './presentation/policies/teacher-ownership.policy';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';
import { CryptoSessionTokenService } from './infrastructure/crypto-session-token.service';
import { MemoryLoginRateLimiter } from './infrastructure/memory-login-rate-limiter';
import { DrizzleSecurityAuditService } from './infrastructure/drizzle-security-audit.service';
import {
  PASSWORD_HASHER,
  SESSION_TOKEN_SERVICE,
  LOGIN_RATE_LIMITER,
  SECURITY_AUDIT_SERVICE,
} from './domain/auth-tokens';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    RolesGuard,
    TeacherOwnershipPolicy,
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
  exports: [
    AuthService,
    AuthGuard,
    RolesGuard,
    TeacherOwnershipPolicy,
    PASSWORD_HASHER,
    SESSION_TOKEN_SERVICE,
    LOGIN_RATE_LIMITER,
    SECURITY_AUDIT_SERVICE,
  ],
})
export class AuthModule {}
