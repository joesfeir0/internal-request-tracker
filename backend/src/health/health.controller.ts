import { Controller, Get, Res } from '@nestjs/common';
import { HealthService } from './health.service';

// Public and safe to expose: states only, never secrets, raw errors, provider URLs or request data.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // Full capability check for monitoring and release decisions. 503 only when the core path is blocked.
  @Get()
  async check(@Res({ passthrough: true }) response: { status(code: number): unknown }) {
    const result = await this.health.check();
    if (result.status === 'unhealthy') response.status(503);
    return result;
  }

  // Process liveness only, for the platform's frequent checks, so they never wake the database or call AI.
  @Get('live')
  live() { return { status: 'ok' }; }
}
