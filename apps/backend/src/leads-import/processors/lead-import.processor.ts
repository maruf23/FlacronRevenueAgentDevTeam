import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ImportJobStatus,
  LeadStatus,
  VerificationStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEAD_IMPORT_JOBS,
  QUEUE_NAMES,
} from '../../queues/queue.constants';
import {
  CsvLeadRow,
  ProcessImportJobData,
  VerifyEmailsJobData,
} from '../../leads-import/leads-import.types';
import {
  VERIFICATION_PROVIDER,
  VerificationProvider,
  ProviderVerificationStatus,
} from '../../leads-import/verification/verification-provider.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const VERIFICATION_STATUS_MAP: Record<
  ProviderVerificationStatus,
  VerificationStatus
> = {
  verified: VerificationStatus.VERIFIED,
  catch_all: VerificationStatus.CATCH_ALL,
  invalid: VerificationStatus.INVALID,
  risky: VerificationStatus.RISKY,
};

@Processor(QUEUE_NAMES.LEAD_IMPORT)
@Injectable()
export class LeadImportProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(VERIFICATION_PROVIDER)
    private readonly verificationProvider: VerificationProvider,
    @InjectQueue(QUEUE_NAMES.LEAD_IMPORT)
    private readonly leadImportQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case LEAD_IMPORT_JOBS.PROCESS_CSV:
        await this.processCsv(job as Job<ProcessImportJobData>);
        return;
      case LEAD_IMPORT_JOBS.VERIFY_EMAILS:
        await this.verifyEmails(job as Job<VerifyEmailsJobData>);
        return;
      default:
        this.logger.warn(`Unknown lead-import job name: ${job.name}`);
    }
  }

  private async processCsv(job: Job<ProcessImportJobData>): Promise<void> {
    const { jobId, workspaceId, csvBase64 } = job.data;

    await this.prisma.setWorkspaceContext(workspaceId);

    try {
      const rows = await this.parseCsv(Buffer.from(csvBase64, 'base64'));
      const totalRecords = rows.length;

      await this.prisma.leadImportJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          totalRecords,
        },
      });

      let processedRecords = 0;
      let duplicateRecords = 0;
      const createdContactIds: string[] = [];

      // Preload existing emails in this workspace for efficient dedupe
      const existing = await this.prisma.contact.findMany({
        where: { workspaceId },
        select: { email: true },
      });
      const seenEmails = new Set(
        existing.map((c) => c.email.toLowerCase()),
      );

      for (const row of rows) {
        const email = row.email?.trim().toLowerCase();
        if (!email || !email.includes('@')) {
          continue;
        }

        if (seenEmails.has(email)) {
          duplicateRecords += 1;
          continue;
        }

        seenEmails.add(email);

        const contact = await this.prisma.contact.create({
          data: {
            email,
            firstName: row.firstName?.trim() || null,
            lastName: row.lastName?.trim() || null,
            companyName: row.companyName?.trim() || null,
            phone: row.phone?.trim() || null,
            title: row.title?.trim() || null,
            workspaceId,
            verificationStatus: VerificationStatus.PENDING,
          },
        });

        await this.prisma.lead.create({
          data: {
            workspaceId,
            contactId: contact.id,
            importJobId: jobId,
            status: LeadStatus.NEW,
            source: 'csv_import',
            lastActivityAt: new Date(),
          },
        });

        createdContactIds.push(contact.id);
        processedRecords += 1;

        if (processedRecords % 25 === 0) {
          await this.prisma.leadImportJob.update({
            where: { id: jobId },
            data: { processedRecords, duplicateRecords },
          });
          await job.updateProgress(
            Math.round((processedRecords / Math.max(totalRecords, 1)) * 100),
          );
        }
      }

      await this.prisma.leadImportJob.update({
        where: { id: jobId },
        data: { processedRecords, duplicateRecords },
      });

      if (createdContactIds.length === 0) {
        await this.prisma.leadImportJob.update({
          where: { id: jobId },
          data: {
            status: ImportJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        return;
      }

      // Chunk verification work so large imports stay manageable
      const chunkSize = 50;
      for (let i = 0; i < createdContactIds.length; i += chunkSize) {
        const contactIds = createdContactIds.slice(i, i + chunkSize);
        const payload: VerifyEmailsJobData = {
          jobId,
          workspaceId,
          contactIds,
        };
        await this.leadImportQueue.add(
          LEAD_IMPORT_JOBS.VERIFY_EMAILS,
          payload,
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1500 },
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        );
      }

      this.logger.log(
        `Import ${jobId}: created ${processedRecords}, duplicates ${duplicateRecords}, queued verification`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown import error';
      this.logger.error(`Import job ${jobId} failed: ${message}`);
      await this.prisma.setWorkspaceContext(workspaceId);
      await this.prisma.leadImportJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async verifyEmails(job: Job<VerifyEmailsJobData>): Promise<void> {
    const { jobId, workspaceId, contactIds } = job.data;
    await this.prisma.setWorkspaceContext(workspaceId);

    try {
      for (const contactId of contactIds) {
        const contact = await this.prisma.contact.findFirst({
          where: { id: contactId, workspaceId },
          select: { id: true, email: true },
        });

        if (!contact) {
          continue;
        }

        const result = await this.verificationProvider.verify(contact.email);
        await this.prisma.contact.update({
          where: { id: contact.id },
          data: {
            verificationStatus: VERIFICATION_STATUS_MAP[result.status],
          },
        });
      }

      // Mark import COMPLETED when no pending contacts remain for this job
      const pending = await this.prisma.contact.count({
        where: {
          workspaceId,
          verificationStatus: VerificationStatus.PENDING,
          leads: { some: { importJobId: jobId } },
        },
      });

      if (pending === 0) {
        await this.prisma.leadImportJob.update({
          where: { id: jobId },
          data: {
            status: ImportJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Verification failed';
      this.logger.error(`Verify job for import ${jobId} failed: ${message}`);
      await this.prisma.setWorkspaceContext(workspaceId);
      await this.prisma.leadImportJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private parseCsv(buffer: Buffer): Promise<CsvLeadRow[]> {
    return new Promise((resolve, reject) => {
      const rows: CsvLeadRow[] = [];
      Readable.from(buffer)
        .pipe(
          csvParser({
            mapHeaders: ({ header }) =>
              header.trim().replace(/^\uFEFF/, ''),
            mapValues: ({ value }) =>
              typeof value === 'string' ? value.trim() : value,
          }),
        )
        .on('data', (row: CsvLeadRow) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });
  }
}
