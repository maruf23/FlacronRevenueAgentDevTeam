import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmailProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { GmailAdapter } from '../integrations/adapters/gmail.adapter';
import { MicrosoftAdapter } from '../integrations/adapters/microsoft.adapter';
import { SmtpMailService } from './smtp-mail.service';

export type SendMessagePayload = {
  workspaceId: string;
  to: string;
  subject: string;
  body: string;
  preferredProvider?: EmailProvider;
};

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly gmail: GmailAdapter,
    private readonly microsoft: MicrosoftAdapter,
    private readonly smtp: SmtpMailService,
  ) {}

  async send(payload: SendMessagePayload): Promise<{
    provider: EmailProvider;
    providerMessageId?: string;
    providerThreadId?: string;
    via: 'smtp' | 'oauth';
  }> {
    await this.prisma.setWorkspaceContext(payload.workspaceId);

    // Prefer SMTP app-password when configured (works without OAuth)
    if (this.smtp.isConfigured()) {
      const result = await this.smtp.send({
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
      });
      this.logger.log(`Sent via SMTP to ${payload.to}`);
      return {
        provider: EmailProvider.GMAIL,
        providerMessageId: result.messageId,
        via: 'smtp',
      };
    }

    const integration = await this.resolveIntegration(
      payload.workspaceId,
      payload.preferredProvider,
    );

    const accessToken = await this.getValidAccessToken(integration);

    const adapter =
      integration.provider === EmailProvider.GMAIL
        ? this.gmail
        : this.microsoft;

    const result = await adapter.sendEmail({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      accessToken,
      fromEmail: integration.accountEmail,
    });

    return {
      provider: integration.provider,
      providerMessageId: result.providerMessageId,
      providerThreadId: result.providerThreadId,
      via: 'oauth',
    };
  }

  private async resolveIntegration(
    workspaceId: string,
    preferred?: EmailProvider,
  ) {
    if (preferred) {
      const preferredIntegration = await this.prisma.emailIntegration.findUnique(
        {
          where: {
            workspaceId_provider: { workspaceId, provider: preferred },
          },
        },
      );
      if (preferredIntegration) {
        return preferredIntegration;
      }
    }

    const any = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!any) {
      throw new NotFoundException(
        'No email channel configured. Set SMTP_USER + SMTP_PASS (Gmail App Password) in apps/backend/.env, or connect Gmail/Microsoft under Integrations.',
      );
    }

    return any;
  }

  private async getValidAccessToken(integration: {
    id: string;
    provider: EmailProvider;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    tokenExpiresAt: Date | null;
    workspaceId: string;
  }): Promise<string> {
    const expiresSoon =
      !integration.tokenExpiresAt ||
      integration.tokenExpiresAt.getTime() < Date.now() + 60_000;

    if (!expiresSoon) {
      return this.encryption.decrypt(integration.accessTokenEnc);
    }

    const refreshToken = this.encryption.decrypt(integration.refreshTokenEnc);
    const adapter =
      integration.provider === EmailProvider.GMAIL
        ? this.gmail
        : this.microsoft;

    try {
      const refreshed = await adapter.refreshAccessToken(refreshToken);
      const expiresAt = refreshed.expiresIn
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null;

      await this.prisma.emailIntegration.update({
        where: { id: integration.id },
        data: {
          accessTokenEnc: this.encryption.encrypt(refreshed.accessToken),
          refreshTokenEnc: this.encryption.encrypt(
            refreshed.refreshToken || refreshToken,
          ),
          tokenExpiresAt: expiresAt,
          scope: refreshed.scope,
        },
      });

      return refreshed.accessToken;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Token refresh failed';
      throw new ServiceUnavailableException(
        `Unable to refresh ${integration.provider} token: ${message}`,
      );
    }
  }
}
