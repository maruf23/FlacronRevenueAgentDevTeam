import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AiModule } from '../ai/ai.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [AiModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
