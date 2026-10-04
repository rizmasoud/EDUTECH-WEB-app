import { Module } from '@nestjs/common';
import { PayrollService } from './application/services/payroll.service';
import { PayrollPolicy } from './domain/policies/payroll.policy';
import { PayrollController, TeacherPayrollController } from './presentation/payroll.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PayrollController, TeacherPayrollController],
  providers: [PayrollService, PayrollPolicy],
  exports: [PayrollService, PayrollPolicy],
})
export class PayrollModule {}
