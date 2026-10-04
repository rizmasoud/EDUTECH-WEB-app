import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { LessonPlanService } from './application/services/lesson-plan.service';
import { ExamService } from './application/services/exam.service';
import { PromotionService } from './application/services/promotion.service';
import { ClassLessonPlansController } from './presentation/class-lesson-plans.controller';
import { LessonPlansController } from './presentation/lesson-plans.controller';
import { LessonPlanItemsController } from './presentation/lesson-plan-items.controller';
import { ClassExamsController } from './presentation/class-exams.controller';
import { ExamsController } from './presentation/exams.controller';
import { ExamResultsController } from './presentation/exam-results.controller';
import { PromotionsController } from './presentation/promotions.controller';
import { StudentPromotionsController } from './presentation/student-promotions.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    ClassLessonPlansController,
    LessonPlansController,
    LessonPlanItemsController,
    ClassExamsController,
    ExamsController,
    ExamResultsController,
    PromotionsController,
    StudentPromotionsController,
  ],
  providers: [LessonPlanService, ExamService, PromotionService],
  exports: [LessonPlanService, ExamService, PromotionService],
})
export class EducationModule {}
