import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignAutomationService } from './campaign-automation.service';
import { CampaignAutomationProcessor } from './campaign-automation.processor';
import { CampaignEventListener } from './campaign-event.listener';
import { CampaignLeadStatusService } from './campaign-lead-status.service';
import { AiModule } from '../ai/ai.module';
import { DeliverabilityModule } from '../deliverability/deliverability.module';
import { SequencesModule } from '../sequences/sequences.module';
import { QUEUE_NAMES } from '../queues/queue.constants';

@Module({
  imports: [
    AiModule,
    DeliverabilityModule,
    SequencesModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.CAMPAIGN }),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignAutomationService,
    CampaignAutomationProcessor,
    CampaignEventListener,
    CampaignLeadStatusService,
  ],
  exports: [CampaignsService, CampaignAutomationService, CampaignLeadStatusService],
})
export class CampaignsModule {}
