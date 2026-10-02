import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { INBOX_JOBS, QUEUE_NAMES } from '../queues/queue.constants';
import { InboxService } from './inbox.service';
import { ProcessInboxJobData } from './inbox.types';

@Processor(QUEUE_NAMES.INBOX)
@Injectable()
export class InboxProcessor extends WorkerHost {
  private readonly logger = new Logger(InboxProcessor.name);

  constructor(private readonly inboxService: InboxService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== INBOX_JOBS.PROCESS_INBOUND) {
      this.logger.warn(`Unknown inbox job: ${job.name}`);
      return;
    }

    const data = job.data as ProcessInboxJobData;
    await this.inboxService.processInbound(data.payload);
  }
}
