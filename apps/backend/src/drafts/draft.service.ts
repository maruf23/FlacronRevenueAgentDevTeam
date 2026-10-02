import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_PROVIDER,
  AiProvider,
  DRAFT_PROMPT_VERSION,
  DraftLeadContext,
  DraftProductContext,
} from '../providers/ai.provider';
import { OpenAiProvider } from '../providers/openai.provider';
import { ApproveDraftDto } from './dto/approve-draft.dto';
import { GenerateDraftDto } from './dto/generate-draft.dto';
import { EmailSenderService } from '../email/email-sender.service';

@Injectable()
export class DraftService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly emailSender: EmailSenderService,
  ) {}

  async generate(dto: GenerateDraftDto, workspaceId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, workspaceId },
      include: {
        contact: true,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${dto.leadId} not found`);
    }

    const product = await this.resolveProduct(workspaceId, dto.productId);

    const leadContext: DraftLeadContext = {
      id: lead.id,
      status: lead.status,
      contact: {
        firstName: lead.contact.firstName,
        lastName: lead.contact.lastName,
        email: lead.contact.email,
        title: lead.contact.title,
        phone: lead.contact.phone,
      },
      company: {
        name: lead.contact.companyName,
      },
    };

    const productContext: DraftProductContext = {
      id: product.id,
      name: product.name,
      description: product.description,
      valueProps: product.valueProps,
    };

    const generated = await this.aiProvider.generateEmailDraft(
      leadContext,
      productContext,
    );

    const modelName =
      this.aiProvider instanceof OpenAiProvider
        ? this.aiProvider.modelName
        : 'unknown';

    const draft = await this.prisma.draft.create({
      data: {
        leadId: lead.id,
        workspaceId,
        promptVersion: DRAFT_PROMPT_VERSION,
        modelName,
        generatedSubject: generated.subject,
        generatedBody: generated.body,
        evidenceUsed: generated.evidence_used,
        approvalStatus: ApprovalStatus.PENDING,
      },
    });

    return {
      id: draft.id,
      leadId: draft.leadId,
      promptVersion: draft.promptVersion,
      modelName: draft.modelName,
      subject: draft.generatedSubject,
      body: draft.generatedBody,
      evidence_used: draft.evidenceUsed,
      approvalStatus: draft.approvalStatus,
      workspaceId: draft.workspaceId,
      createdAt: draft.createdAt,
    };
  }

  async approve(
    draftId: string,
    workspaceId: string,
    dto: ApproveDraftDto = {},
  ) {
    const existing = await this.prisma.draft.findFirst({
      where: { id: draftId, workspaceId },
      include: {
        lead: {
          include: { contact: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const toEmail = existing.lead.contact.email;
    const subject = (dto.subject ?? existing.generatedSubject).trim();
    const body = (dto.body ?? existing.generatedBody).trim();
    const wasEdited =
      subject !== existing.generatedSubject ||
      body !== existing.generatedBody;

    // Create outbound message first
    const message = await this.prisma.message.create({
      data: {
        workspaceId,
        leadId: existing.leadId,
        draftId: existing.id,
        subject,
        body,
        toEmail,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.DRAFT,
        sequenceStep: 1,
      },
    });

    try {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.SENDING },
      });

      const sendResult = await this.emailSender.send({
        workspaceId,
        to: toEmail,
        subject,
        body,
      });

      await this.prisma.$transaction([
        this.prisma.draft.update({
          where: { id: draftId },
          data: {
            approvalStatus: ApprovalStatus.APPROVED,
            ...(wasEdited
              ? {
                  userEdits: {
                    subject,
                    body,
                    editedAt: new Date().toISOString(),
                  },
                }
              : {}),
          },
        }),
        this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.SENT,
            sentAt: new Date(),
            provider: sendResult.provider,
            providerMessageId: sendResult.providerMessageId ?? null,
            toEmail,
          },
        }),
        this.prisma.lead.update({
          where: { id: existing.leadId },
          data: {
            status: LeadStatus.CONTACTED,
            lastActivityAt: new Date(),
            nextRecommendedAction: 'Await reply',
          },
        }),
      ]);

      // Open an Inbox thread so replies land in the same conversation
      const contactId = existing.lead.contactId;
      let conversation = await this.prisma.conversation.findUnique({
        where: {
          workspaceId_contactId_leadId: {
            workspaceId,
            contactId,
            leadId: existing.leadId,
          },
        },
      });
      const preview = body.slice(0, 180);
      const now = new Date();
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            workspaceId,
            contactId,
            leadId: existing.leadId,
            subject,
            lastMessageAt: now,
            lastMessagePreview: preview,
          },
        });
      } else {
        conversation = await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            subject: subject || conversation.subject,
            lastMessageAt: now,
            lastMessagePreview: preview,
          },
        });
      }
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          conversationId: conversation.id,
          toEmail,
        },
      });

      return {
        id: existing.id,
        leadId: existing.leadId,
        approvalStatus: ApprovalStatus.APPROVED,
        subject,
        body,
        sent: true,
        messageId: message.id,
        conversationId: conversation.id,
        to: toEmail,
        via: sendResult.via,
        provider: sendResult.provider,
        updatedAt: new Date(),
      };
    } catch (error) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Send failed',
        },
      });

      if (
        error instanceof ServiceUnavailableException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      const messageText =
        error instanceof Error ? error.message : 'Unknown send error';
      throw new ServiceUnavailableException(
        `Email was not sent: ${messageText}`,
      );
    }
  }

  async reject(draftId: string, workspaceId: string) {
    return this.updateApproval(draftId, workspaceId, ApprovalStatus.REJECTED);
  }

  private async updateApproval(
    draftId: string,
    workspaceId: string,
    approvalStatus: ApprovalStatus,
  ) {
    const existing = await this.prisma.draft.findFirst({
      where: { id: draftId, workspaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const draft = await this.prisma.draft.update({
      where: { id: draftId },
      data: { approvalStatus },
    });

    return {
      id: draft.id,
      leadId: draft.leadId,
      approvalStatus: draft.approvalStatus,
      subject: draft.generatedSubject,
      body: draft.generatedBody,
      updatedAt: draft.updatedAt,
    };
  }

  private async resolveProduct(workspaceId: string, productId?: string) {
    if (productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, workspaceId },
      });
      if (!product) {
        throw new NotFoundException(`Product ${productId} not found`);
      }
      return product;
    }

    const product = await this.prisma.product.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (product) {
      return product;
    }

    return this.prisma.product.create({
      data: {
        workspaceId,
        name: 'Flacron Lead Agent',
        description:
          'AI-assisted outbound platform that finds, qualifies, and converts B2B leads.',
        valueProps: [
          'Multi-tenant lead import and verification',
          'AI email drafting with human approval',
          'Deliverability guardrails and emergency stop',
        ],
      },
    });
  }
}
