import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { HealthResponse } from '@edutech/shared';
import { HealthService } from '../application/health.service';
import { Public } from '../../auth/presentation/decorators/public.decorator';

// Intentionally unauthenticated: used by deployment/uptime probes (Docs/operations/deployment-and-operations.md §8).
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService)
    private readonly healthService: HealthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    return this.healthService.getHealth();
  }
}
