import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { AiJobsProcessor } from './processors/ai-jobs.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT') ?? 6380),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
        prefix: config.get<string>('BULLMQ_PREFIX', 'flacron'),
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.AI_JOBS },
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.TENANT_TASKS },
      { name: QUEUE_NAMES.LEAD_IMPORT },
      { name: QUEUE_NAMES.SEQUENCE },
      { name: QUEUE_NAMES.INBOX },
      { name: QUEUE_NAMES.CAMPAIGN },
    ),
  ],
  providers: [AiJobsProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
