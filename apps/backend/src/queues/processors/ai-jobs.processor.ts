import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

@Processor(QUEUE_NAMES.AI_JOBS)
@Injectable()
export class AiJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(AiJobsProcessor.name);

  async process(job: Job): Promise<void> {
    // Skeleton — implement durable AI job handling later
    this.logger.debug(`Received AI job ${job.id} (${job.name})`);
  }
}
