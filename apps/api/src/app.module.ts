import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './shared/config/env.schema';
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
import { CatchAllController } from './shared/controllers/catch-all.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
  controllers: [CatchAllController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiRateLimiterGuard,
    },
  ],
})
export class AppModule {}

