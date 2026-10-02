import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ImportJobStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LEAD_IMPORT_JOBS, QUEUE_NAMES } from '../queues/queue.constants';
import { ProcessImportJobData } from './leads-import.types';

@Injectable()
export class LeadsImportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.LEAD_IMPORT)
    private readonly leadImportQueue: Queue,
  ) {}

  async startImport(
    file: Express.Multer.File,
    workspaceId: string,
  ): Promise<{ jobId: string; status: 'PROCESSING' }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const filename = file.originalname || 'upload.csv';
    if (!filename.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are accepted');
    }

    // RLS already scoped by interceptor; still set workspaceId explicitly on the row
    const job = await this.prisma.leadImportJob.create({
      data: {
        filename,
        source: 'csv_import',
        status: ImportJobStatus.PENDING,
        workspaceId,
      },
    });

    await this.prisma.leadImportJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.PROCESSING },
    });

    const payload: ProcessImportJobData = {
      jobId: job.id,
      workspaceId,
      filename,
      csvBase64: file.buffer.toString('base64'),
    };

    await this.leadImportQueue.add(LEAD_IMPORT_JOBS.PROCESS_CSV, payload, {
      jobId: `import-${job.id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return { jobId: job.id, status: 'PROCESSING' };
  }

  async getJobStatus(jobId: string, workspaceId: string) {
    const job = await this.prisma.leadImportJob.findFirst({
      where: { id: jobId, workspaceId },
    });

    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    return {
      jobId: job.id,
      filename: job.filename,
      status: job.status,
      totalRecords: job.totalRecords,
      processedRecords: job.processedRecords,
      duplicateRecords: job.duplicateRecords,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }
}
