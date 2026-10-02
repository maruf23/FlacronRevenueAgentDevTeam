import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HunterProvider } from '../providers/hunter.provider';
import { HunterController } from './hunter.controller';
import { HunterService } from './hunter.service';
import { QUEUE_NAMES } from '../queues/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.LEAD_IMPORT })],
  controllers: [HunterController],
  providers: [HunterProvider, HunterService],
  exports: [HunterProvider, HunterService],
})
export class HunterModule {}
