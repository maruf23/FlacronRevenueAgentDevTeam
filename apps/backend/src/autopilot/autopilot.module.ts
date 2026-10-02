import { Module } from '@nestjs/common';
import { AutopilotController } from './autopilot.controller';
import { AutopilotService } from './autopilot.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SafetyModule } from '../safety/safety.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [PrismaModule, SafetyModule, QueuesModule],
  controllers: [AutopilotController],
  providers: [AutopilotService],
  exports: [AutopilotService],
})
export class AutopilotModule {}
