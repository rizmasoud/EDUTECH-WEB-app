import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Set global API prefix matching Docs/api/api-specification.md
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Global exception filter for standardized error contracts
  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT') || 4000;
  const env = configService.get<string>('NODE_ENV') || 'development';

  // Configure Express trust proxy setting securely
  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxy = configService.get<string>('TRUST_PROXY');
  if (trustProxy) {
    if (trustProxy === 'true') {
      expressApp.set('trust proxy', true);
    } else if (trustProxy === 'false') {
      expressApp.set('trust proxy', false);
    } else if (!isNaN(Number(trustProxy))) {
      expressApp.set('trust proxy', Number(trustProxy));
    } else {
      expressApp.set('trust proxy', trustProxy);
    }
  } else {
    // Fail-safe defaults
    if (env === 'production') {
      expressApp.set('trust proxy', false); // Do not trust arbitrary headers in production by default
    } else {
      expressApp.set('trust proxy', 'loopback'); // Local loopback operations in dev/test
    }
  }

  // Secure HTTP browser-facing security headers
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (env === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Enable environment-driven CORS for frontend communication
  const allowedOriginsStr = configService.get<string>('ALLOWED_ORIGINS') || '';
  let origin: any = true; // Flexible default for development

  if (env === 'production') {
    if (allowedOriginsStr) {
      const origins = allowedOriginsStr.split(',').map((o) => o.trim()).filter(Boolean);
      origin = origins.length > 0 ? origins : false;
    } else {
      origin = false; // Block all by default if production and no ALLOWED_ORIGINS
    }
  } else {
    if (allowedOriginsStr) {
      const origins = allowedOriginsStr.split(',').map((o) => o.trim()).filter(Boolean);
      if (origins.length > 0) {
        origin = origins;
      }
    }
  }

  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  await app.listen(port);
  logger.log(`EduTech API running on port ${port} [env=${env}]`);
  logger.log(`Health endpoint available at http://localhost:${port}/health`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during NestJS bootstrap:', err);
  process.exit(1);
});
