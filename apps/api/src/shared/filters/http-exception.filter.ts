import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.defaultCodeForStatus(status);
      } else if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, any>;
        if (errorObj.error && typeof errorObj.error === 'object') {
          code = errorObj.error.code || this.defaultCodeForStatus(status);
          message = errorObj.error.message || exception.message;
        } else {
          code = errorObj.code || this.defaultCodeForStatus(status);
          message = Array.isArray(errorObj.message)
            ? errorObj.message.join(', ')
            : errorObj.message || exception.message;
        }
      }
    } else if (exception instanceof Error) {
      console.error('Unhandled server exception:', exception);
      const env = process.env.NODE_ENV || 'development';
      if (env === 'production') {
        message = 'An unexpected error occurred.';
      } else {
        message = exception.message;
      }
    } else {
      console.error('Unhandled unknown exception:', exception);
    }

    response.status(status).json({
      error: {
        code,
        message,
      },
    });
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
