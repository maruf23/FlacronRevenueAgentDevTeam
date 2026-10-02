import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';
import { SkipAudit } from '../common/decorators/skip-audit.decorator';

@Public()
@SkipAudit()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    const result = await this.healthService.check();
    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
