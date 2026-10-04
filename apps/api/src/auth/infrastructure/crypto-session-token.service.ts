import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import type {
  GeneratedToken,
  ISessionTokenService,
} from '../domain/session-token.interface';

@Injectable()
export class CryptoSessionTokenService implements ISessionTokenService {
  generateToken(): GeneratedToken {
    // 32 cryptographically strong random bytes -> 64-character hex string
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    return {
      rawToken,
      tokenHash,
    };
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
