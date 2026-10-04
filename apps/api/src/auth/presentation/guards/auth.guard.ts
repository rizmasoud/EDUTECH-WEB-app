import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../application/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export const SESSION_COOKIE_NAME = 'edutech_session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
      });
    }

    const user = await this.authService.validateSession(token);

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session is invalid or expired.',
      });
    }

    // Attach user and raw token to request context
    (request as any).user = user;
    (request as any).rawSessionToken = token;

    return true;
  }

  private extractToken(req: Request): string | null {
    // 1. Check req.cookies if populated by cookie-parser
    if ((req as any).cookies && (req as any).cookies[SESSION_COOKIE_NAME]) {
      return (req as any).cookies[SESSION_COOKIE_NAME];
    }

    // 2. Parse raw Cookie header
    const cookieHeader = req.headers?.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(
        new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`),
      );
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    // 3. Optional Bearer token header support
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    return null;
  }
}
