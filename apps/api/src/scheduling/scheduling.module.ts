import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SchedulesController } from './presentation/schedules.controller';
import { SchedulingProposalsController } from './presentation/scheduling-proposals.controller';
import { SchedulesService } from './application/services/schedules.service';
import { SchedulingProposalsService } from './application/services/scheduling-proposals.service';
import { DrizzleScheduleRepository } from './infrastructure/drizzle-schedule.repository';
import { DrizzleSchedulingProposalRepository } from './infrastructure/drizzle-scheduling-proposal.repository';
import { SchedulingEngine } from './domain/engine/scheduling.engine';
import { SchedulingDayPolicy } from './domain/policies/scheduling-day.policy';
import { SchedulingCapacityPolicy } from './domain/policies/scheduling-capacity.policy';
import { DefaultCandidateGenerator } from './domain/engine/default-candidate-generator';
import {
  SCHEDULING_ENGINE,
  SCHEDULING_DAY_POLICY,
  SCHEDULING_CAPACITY_POLICY,
  CANDIDATE_GENERATOR,
  SCHEDULE_REPOSITORY,
  SCHEDULING_PROPOSAL_REPOSITORY,
} from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SchedulesController, SchedulingProposalsController],
  providers: [
    SchedulesService,
    SchedulingProposalsService,
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: DrizzleScheduleRepository,
    },
    {
      provide: SCHEDULING_PROPOSAL_REPOSITORY,
      useClass: DrizzleSchedulingProposalRepository,
    },
    {
      provide: SCHEDULING_DAY_POLICY,
      useClass: SchedulingDayPolicy,
    },
    {
      provide: SCHEDULING_CAPACITY_POLICY,
      useClass: SchedulingCapacityPolicy,
    },
    {
      provide: CANDIDATE_GENERATOR,
      useClass: DefaultCandidateGenerator,
    },
    {
      provide: SCHEDULING_ENGINE,
      useFactory: (dayPolicy: SchedulingDayPolicy, candidateGenerator: DefaultCandidateGenerator) => {
        return new SchedulingEngine({
          candidateGenerator,
        });
      },
      inject: [SCHEDULING_DAY_POLICY, CANDIDATE_GENERATOR],
    },
  ],
  exports: [
    SchedulesService,
    SchedulingProposalsService,
    SCHEDULE_REPOSITORY,
    SCHEDULING_PROPOSAL_REPOSITORY,
    SCHEDULING_ENGINE,
    SCHEDULING_DAY_POLICY,
    SCHEDULING_CAPACITY_POLICY,
    CANDIDATE_GENERATOR,
  ],
})
export class SchedulingModule {}
