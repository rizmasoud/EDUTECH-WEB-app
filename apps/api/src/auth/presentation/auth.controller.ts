import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginSchema } from '@edutech/shared';
import type { AuthUser, ApiSuccessResponse, LoginResponseData } from '@edutech/shared';
import { AuthService, SESSION_TTL_MS } from '../application/auth.service';
import { AuthGuard, SESSION_COOKIE_NAME } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccessResponse<LoginResponseData>> {
    const parseResult = LoginSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => i.message).join('; ');
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: issues || 'Invalid login payload.',
      });
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      undefined;
    const userAgent = req.headers['user-agent'] || undefined;

    const { account, rawToken } = await this.authService.login(parseResult.data, {
      ipAddress,
      userAgent,
    });

    // Set secure HttpOnly session cookie
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });

    return {
      data: {
        account,
      },
    };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() user: AuthUser): Promise<ApiSuccessResponse<AuthUser>> {
    return {
      data: user,
    };
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiSuccessResponse<{ success: boolean }>> {
    const rawToken = (req as any).rawSessionToken;
    if (rawToken) {
      await this.authService.logout(rawToken, user.id);
    }

    // Invalidate cookie
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return {
      data: {
        success: true,
      },
    };
  }
}
