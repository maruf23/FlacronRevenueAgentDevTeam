import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SkipAudit } from '../common/decorators/skip-audit.decorator';
import { InboxService } from './inbox.service';
import { InboxProviderSyncService } from './inbox-provider-sync.service';
import { InboxWebhookDto } from './dto/inbox-webhook.dto';

@SkipAudit()
@Controller('webhooks/inbox')
export class InboxWebhookController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly providerSync: InboxProviderSyncService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  handleNormalized(
    @Body() dto: InboxWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertSecret(secret);
    return this.inboxService.enqueueInbound({
      ...dto,
      provider: dto.provider ?? 'normalized',
      threadId: dto.threadId,
    });
  }

  /**
   * Gmail Pub/Sub push or normalized bridge payload.
   * Imports external replies into FLA Inbox even when mail was sent outside the platform.
   */
  @Public()
  @Post('gmail')
  handleGmail(
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    // Pub/Sub push often has no custom secret header — allow when EMAIL_WEBHOOK_SECRET unset
    // or when X-Goog-Channel headers present; otherwise enforce secret for bridge clients.
    const isPubSub = Boolean(
      body && typeof body === 'object' && 'message' in body && 'subscription' in body,
    );
    if (!isPubSub) {
      this.assertSecret(secret);
    }
    return this.providerSync.handleGmailPush(body as never);
  }

  /**
   * Microsoft Graph change notification (or normalized bridge payload).
   */
  @Public()
  @Post('microsoft')
  handleMicrosoft(
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    const isGraphNotification = Boolean(
      body && typeof body === 'object' && Array.isArray((body as { value?: unknown }).value),
    );
    if (!isGraphNotification) {
      this.assertSecret(secret);
    }
    return this.providerSync.handleMicrosoftPush(body as never);
  }

  /** Graph subscription validation handshake */
  @Public()
  @Get('microsoft')
  validateMicrosoft(
    @Query('validationToken') validationToken: string | undefined,
    @Res() res: Response,
  ) {
    if (validationToken) {
      res.status(200).type('text/plain').send(validationToken);
      return;
    }
    res.status(400).send('validationToken required');
  }

  private assertSecret(secret?: string) {
    const expected = this.config.get<string>('EMAIL_WEBHOOK_SECRET');
    if (!expected) return;
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
