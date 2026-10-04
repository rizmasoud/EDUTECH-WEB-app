import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { TeachersController } from './presentation/teachers.controller';
import { TeachersService } from './application/services/teachers.service';
import { DrizzleTeacherRepository } from './infrastructure/drizzle-teacher.repository';
import { TeacherOwnershipPolicy } from '../auth/presentation/policies/teacher-ownership.policy';
import { TEACHER_REPOSITORY } from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule, ClassesModule],
  controllers: [TeachersController],
  providers: [
    TeachersService,
    TeacherOwnershipPolicy,
    {
      provide: TEACHER_REPOSITORY,
      useClass: DrizzleTeacherRepository,
    },
  ],
  exports: [TeachersService, TEACHER_REPOSITORY],
})
export class TeachersModule {}
