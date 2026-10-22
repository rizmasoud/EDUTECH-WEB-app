import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './shared/config/env.schema';
import { resolveEnvFilePaths } from './shared/config/env-files';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AcademicsModule } from './academics/academics.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';
import { ImportsModule } from './imports/imports.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SessionsModule } from './sessions/sessions.module';
import { EducationModule } from './education/education.module';
import { SubstitutionModule } from './substitution/substitution.module';
import { SupportModule } from './support/support.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PayrollModule } from './payroll/payroll.module';
import { ApiRateLimiterGuard } from './shared/guards/api-rate-limiter.guard';
import { AuthGuard } from './auth/presentation/guards/auth.guard';

const ENV_FILE_PATHS = resolveEnvFilePaths(process.cwd(), __dirname);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load .env explicitly: from the working directory and from the repository root, so the API
      // finds it whether it is started from the root (pnpm dev) or from apps/api. Variables that
      // are already set in the environment always win.
      envFilePath: ENV_FILE_PATHS,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    AcademicsModule,
    ClassesModule,
    StudentsModule,
    TeachersModule,
    ImportsModule,
    SchedulingModule,
    SessionsModule,
    EducationModule,
    SubstitutionModule,
    SupportModule,
    NotificationsModule,
    PayrollModule,
  ],
  controllers: [],
  providers: [
    // Global guards run in registration order: rate limiting first (unchanged), then authentication.
    // Routes are protected by default; intentionally public routes must carry @Public().
    {
      provide: APP_GUARD,
      useClass: ApiRateLimiterGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}

