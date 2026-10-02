import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmailSenderService } from '../email/email-sender.service';
import { SmtpMailService } from '../email/smtp-mail.service';
import { SequenceQueueService } from './sequence-queue.service';
import { SequenceQueueProcessor } from './sequence-queue.processor';
import { EmailWebhooksController } from '../webhooks/email-webhooks.controller';
import { MessagesController } from './messages.controller';

@Module({
  imports: [
    IntegrationsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SEQUENCE }),
  ],
  controllers: [EmailWebhooksController, MessagesController],
  providers: [
    SmtpMailService,
    EmailSenderService,
    SequenceQueueService,
    SequenceQueueProcessor,
  ],
  exports: [SequenceQueueService, EmailSenderService, SmtpMailService],
})
export class SequencesModule {}
