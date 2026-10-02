import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { SequencesModule } from '../sequences/sequences.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { InboxController } from './inbox.controller';
import { InboxWebhookController } from './inbox-webhook.controller';
import { InboxService } from './inbox.service';
import { InboxProcessor } from './inbox.processor';
import { ReplyClassificationService } from './reply-classification.service';
import { ImapInboxSyncService } from './imap-inbox-sync.service';
import { InboxSyncScheduler } from './inbox-sync.scheduler';
import { InboxProviderSyncService } from './inbox-provider-sync.service';
import { PostReplyAutomationService } from './post-reply-automation.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.INBOX }),
    SequencesModule,
    IntegrationsModule,
  ],
  controllers: [InboxController, InboxWebhookController],
  providers: [
    InboxService,
    InboxProcessor,
    ReplyClassificationService,
    ImapInboxSyncService,
    InboxSyncScheduler,
    InboxProviderSyncService,
    PostReplyAutomationService,
  ],
  exports: [InboxService, ReplyClassificationService, PostReplyAutomationService],
})
export class InboxModule {}
