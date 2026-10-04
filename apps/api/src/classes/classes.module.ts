import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesController } from './presentation/classes.controller';
import { EnrollmentsController } from './presentation/enrollments.controller';
import { ClassesService } from './application/services/classes.service';
import { EnrollmentsService } from './application/services/enrollments.service';
import { DrizzleClassRepository } from './infrastructure/drizzle-class.repository';
import { DrizzleEnrollmentRepository } from './infrastructure/drizzle-enrollment.repository';
import { CLASS_REPOSITORY, ENROLLMENT_REPOSITORY } from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ClassesController, EnrollmentsController],
  providers: [
    ClassesService,
    EnrollmentsService,
    {
      provide: CLASS_REPOSITORY,
      useClass: DrizzleClassRepository,
    },
    {
      provide: ENROLLMENT_REPOSITORY,
      useClass: DrizzleEnrollmentRepository,
    },
  ],
  exports: [
    ClassesService,
    EnrollmentsService,
    CLASS_REPOSITORY,
    ENROLLMENT_REPOSITORY,
  ],
})
export class ClassesModule {}
