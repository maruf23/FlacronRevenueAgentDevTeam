import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SuppressionReason } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { SkipAudit } from '../common/decorators/skip-audit.decorator';
import { SequenceQueueService } from '../sequences/sequence-queue.service';
import {
  EmailStatusWebhookDto,
  EmailWebhookDto,
} from './dto/email-webhook.dto';

@SkipAudit()
@Controller('webhooks/email')
export class EmailWebhooksController {
  constructor(
    private readonly sequences: SequenceQueueService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('bounce')
  bounce(
    @Body() dto: EmailWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.sequences.handleBounceOrComplaint({
      workspaceId: dto.workspaceId,
      email: dto.email,
      messageId: dto.messageId,
      providerMessageId: dto.providerMessageId,
      source: dto.source ?? 'bounce-webhook',
      reason: SuppressionReason.BOUNCE,
      bounceType: dto.bounceType,
    });
  }

  @Public()
  @Post('complaint')
  complaint(
    @Body() dto: EmailWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.sequences.handleBounceOrComplaint({
      workspaceId: dto.workspaceId,
      email: dto.email,
      messageId: dto.messageId,
      providerMessageId: dto.providerMessageId,
      source: dto.source ?? 'complaint-webhook',
      reason: SuppressionReason.COMPLAINT,
      complaintReason: dto.complaintReason,
    });
  }

  /** Generic delivery / send status (Gmail Pub/Sub bridge or Graph notifications) */
  @Public()
  @Post('status')
  status(
    @Body() dto: EmailStatusWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.sequences.handleDeliveryStatus({
      ...dto,
      source: dto.source ?? 'status-webhook',
    });
  }

  @Public()
  @Post('gmail/status')
  gmailStatus(
    @Body() dto: EmailStatusWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.sequences.handleDeliveryStatus({
      ...dto,
      provider: dto.provider ?? 'GMAIL',
      source: dto.source ?? 'gmail-status-webhook',
    });
  }

  @Public()
  @Post('microsoft/status')
  microsoftStatus(
    @Body() dto: EmailStatusWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.sequences.handleDeliveryStatus({
      ...dto,
      provider: dto.provider ?? 'MICROSOFT',
      source: dto.source ?? 'microsoft-status-webhook',
    });
  }

  private assertWebhookSecret(secret?: string) {
    const expected = this.config.get<string>('EMAIL_WEBHOOK_SECRET');
    if (!expected) {
      return; // allow in local/dev when unset
    }
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
