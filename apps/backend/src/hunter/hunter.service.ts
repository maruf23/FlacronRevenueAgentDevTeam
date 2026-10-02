import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ImportJobStatus,
  LeadStatus,
  VerificationStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { HunterProvider } from '../providers/hunter.provider';
import {
  LEAD_IMPORT_JOBS,
  QUEUE_NAMES,
} from '../queues/queue.constants';
import { VerifyEmailsJobData } from '../leads-import/leads-import.types';
import {
  HunterConfirmImportDto,
  HunterDomainSearchDto,
  HunterEmailFinderDto,
  HunterEmailVerifierDto,
  HunterEnrichDto,
  HunterImportContactDto,
} from './dto/hunter.dto';

/** Canonical lead / import source for Hunter-sourced records. */
export const HUNTER_LEAD_SOURCE = 'HUNTER';

@Injectable()
export class HunterService {
  private readonly logger = new Logger(HunterService.name);

  constructor(
    private readonly hunter: HunterProvider,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.LEAD_IMPORT)
    private readonly leadImportQueue: Queue,
  ) {}

  async discover(filters: Record<string, unknown> = {}) {
    const result = await this.hunter.discover(filters);
    return { source: HUNTER_LEAD_SOURCE, ...this.asObject(result) };
  }

  async domainSearch(dto: HunterDomainSearchDto) {
    const result = await this.hunter.domainSearch({
      domain: dto.domain,
      limit: dto.limit,
      offset: dto.offset,
      type: dto.type,
      seniority: dto.seniority,
      department: dto.department,
    });
    return { source: HUNTER_LEAD_SOURCE, ...this.asObject(result) };
  }

  async emailFinder(dto: HunterEmailFinderDto) {
    const result = await this.hunter.emailFinder({
      firstName: dto.firstName,
      lastName: dto.lastName,
      domain: dto.domain,
    });
    return { source: HUNTER_LEAD_SOURCE, ...this.asObject(result) };
  }

  async emailVerifier(dto: HunterEmailVerifierDto) {
    const result = await this.hunter.emailVerifier(dto.email);
    return {
      source: HUNTER_LEAD_SOURCE,
      status: result.status,
      score: result.score,
      email: result.email,
      data: this.asObject(result.raw).data ?? result.raw,
    };
  }

  async enrich(dto: HunterEnrichDto) {
    const result = await this.hunter.enrich({
      domain: dto.domain,
      url: dto.url,
    });
    return { source: HUNTER_LEAD_SOURCE, ...this.asObject(result) };
  }

  /**
   * Import Hunter domain-search contacts into Contact + Lead rows.
   * Skips emails that already exist in the workspace; queues verification.
   */
  async confirmImport(workspaceId: string, dto: HunterConfirmImportDto) {
    await this.prisma.setWorkspaceContext(workspaceId);

    if (!dto.contacts?.length) {
      throw new BadRequestException('contacts array is required');
    }

    const companyName =
      dto.organization?.trim() || dto.domain?.trim() || null;
    const filename = `hunter:${dto.domain?.trim() || companyName || 'import'}`;

    const job = await this.prisma.leadImportJob.create({
      data: {
        filename,
        source: HUNTER_LEAD_SOURCE,
        status: ImportJobStatus.PROCESSING,
        totalRecords: dto.contacts.length,
        workspaceId,
      },
    });

    const existing = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { email: true },
    });
    const seenEmails = new Set(existing.map((c) => c.email.toLowerCase()));

    let created = 0;
    let skippedDuplicates = 0;
    let skippedInvalid = 0;
    const createdContactIds: string[] = [];

    for (const raw of dto.contacts) {
      const normalized = this.normalizeContact(raw, companyName);
      if (!normalized) {
        skippedInvalid += 1;
        continue;
      }

      if (seenEmails.has(normalized.email)) {
        skippedDuplicates += 1;
        continue;
      }
      seenEmails.add(normalized.email);

      const contact = await this.prisma.contact.create({
        data: {
          email: normalized.email,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          companyName: normalized.companyName,
          phone: normalized.phone,
          title: normalized.title,
          workspaceId,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      await this.prisma.lead.create({
        data: {
          workspaceId,
          contactId: contact.id,
          importJobId: job.id,
          status: LeadStatus.NEW,
          source: HUNTER_LEAD_SOURCE,
          lastActivityAt: new Date(),
        },
      });

      createdContactIds.push(contact.id);
      created += 1;
    }

    await this.prisma.leadImportJob.update({
      where: { id: job.id },
      data: {
        processedRecords: created,
        duplicateRecords: skippedDuplicates,
      },
    });

    if (createdContactIds.length === 0) {
      await this.prisma.leadImportJob.update({
        where: { id: job.id },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } else {
      const chunkSize = 50;
      for (let i = 0; i < createdContactIds.length; i += chunkSize) {
        const contactIds = createdContactIds.slice(i, i + chunkSize);
        const payload: VerifyEmailsJobData = {
          jobId: job.id,
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
        `Hunter import ${job.id}: created ${created}, duplicates ${skippedDuplicates}, queued verification`,
      );
    }

    return {
      source: HUNTER_LEAD_SOURCE,
      jobId: job.id,
      created,
      skippedDuplicates,
      skippedInvalid,
      total: dto.contacts.length,
      status: createdContactIds.length === 0 ? 'COMPLETED' : 'PROCESSING',
    };
  }

  private normalizeContact(
    raw: HunterImportContactDto,
    companyName: string | null,
  ): {
    email: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    phone: string | null;
    companyName: string | null;
  } | null {
    const email = (raw.email || raw.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return null;
    }

    return {
      email,
      firstName: (raw.firstName || raw.first_name || '').trim() || null,
      lastName: (raw.lastName || raw.last_name || '').trim() || null,
      title: (raw.title || raw.position || '').trim() || null,
      phone: (raw.phone || raw.phone_number || '').trim() || null,
      companyName,
    };
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { data: value };
  }
}
