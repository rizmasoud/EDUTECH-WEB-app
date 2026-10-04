import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { StudentsController } from './presentation/students.controller';
import { StudentsService } from './application/services/students.service';
import { DrizzleStudentRepository } from './infrastructure/drizzle-student.repository';
import { STUDENT_REPOSITORY } from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule, ClassesModule],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    {
      provide: STUDENT_REPOSITORY,
      useClass: DrizzleStudentRepository,
    },
  ],
  exports: [StudentsService, STUDENT_REPOSITORY],
})
export class StudentsModule {}
