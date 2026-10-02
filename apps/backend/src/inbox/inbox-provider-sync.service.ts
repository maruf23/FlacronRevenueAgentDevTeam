import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { GmailAdapter } from '../integrations/adapters/gmail.adapter';
import { MicrosoftAdapter } from '../integrations/adapters/microsoft.adapter';
import { InboxService } from './inbox.service';
import { InboxEmailPayload } from './inbox.types';

type GmailPushBody = {
  workspaceId?: string;
  // Normalized bridge fields
  subject?: string;
  from?: string;
  to?: string;
  body?: string;
  receivedAt?: string;
  externalId?: string;
  threadId?: string;
  messageId?: string;
  // Pub/Sub envelope
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
  emailAddress?: string;
  historyId?: string | number;
};

type MicrosoftPushBody = {
  workspaceId?: string;
  subject?: string;
  from?: string;
  to?: string;
  body?: string;
  receivedAt?: string;
  externalId?: string;
  threadId?: string;
  messageId?: string;
  value?: Array<{
    subscriptionId?: string;
    clientState?: string;
    changeType?: string;
    resource?: string;
    resourceData?: { id?: string; '@odata.type'?: string };
  }>;
};

@Injectable()
export class InboxProviderSyncService {
  private readonly logger = new Logger(InboxProviderSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly gmail: GmailAdapter,
    private readonly microsoft: MicrosoftAdapter,
    private readonly inbox: InboxService,
  ) {}

  /**
   * Accept normalized bridge payloads OR Gmail Pub/Sub push, fetch full mail, enqueue Inbox.
   */
  async handleGmailPush(body: GmailPushBody) {
    // Already-normalized bridge payload
    if (body.subject && body.from && body.to && body.body && body.workspaceId) {
      return this.inbox.enqueueInbound({
        workspaceId: body.workspaceId,
        provider: 'gmail',
        subject: body.subject,
        from: body.from,
        to: body.to,
        body: body.body,
        receivedAt: body.receivedAt,
        externalId: body.externalId ?? body.messageId,
        threadId: body.threadId,
      });
    }

    const pubsub = this.decodeGmailPubSub(body);
    const messageId = body.messageId ?? body.externalId ?? null;
    const emailAddress = (
      body.emailAddress ||
      pubsub?.emailAddress ||
      ''
    ).toLowerCase();

    const integration = await this.resolveIntegrationByEmail(
      emailAddress,
      EmailProvider.GMAIL,
      body.workspaceId,
    );
    const accessToken = await this.getValidAccessToken(integration);

    const results: Array<Record<string, unknown>> = [];

    if (messageId) {
      const fetched = await this.gmail.fetchMessage(accessToken, messageId);
      results.push(
        await this.enqueueFetched(integration.workspaceId, 'gmail', fetched),
      );
      return { imported: results.length, results };
    }

    // Pub/Sub history-only: pull recent inbox and import new ones
    const ids = await this.gmail.listRecentInboxIds(accessToken, 20);
    for (const id of ids) {
      try {
        const fetched = await this.gmail.fetchMessage(accessToken, id);
        // Skip mail sent by ourselves
        const from = fetched.from.toLowerCase();
        if (from.includes(integration.accountEmail.toLowerCase())) {
          continue;
        }
        results.push(
          await this.enqueueFetched(integration.workspaceId, 'gmail', fetched),
        );
      } catch (error) {
        this.logger.warn(
          `Gmail import skipped for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { imported: results.length, results, historyId: pubsub?.historyId };
  }

  /**
   * Accept normalized bridge payloads OR Microsoft Graph change notifications.
   */
  async handleMicrosoftPush(body: MicrosoftPushBody) {
    if (body.subject && body.from && body.to && body.body && body.workspaceId) {
      return this.inbox.enqueueInbound({
        workspaceId: body.workspaceId,
        provider: 'microsoft',
        subject: body.subject,
        from: body.from,
        to: body.to,
        body: body.body,
        receivedAt: body.receivedAt,
        externalId: body.externalId ?? body.messageId,
        threadId: body.threadId,
      });
    }

    const notifications = body.value ?? [];
    if (notifications.length === 0 && body.messageId && body.workspaceId) {
      const integration = await this.resolveIntegrationByWorkspace(
        body.workspaceId,
        EmailProvider.MICROSOFT,
      );
      const accessToken = await this.getValidAccessToken(integration);
      const fetched = await this.microsoft.fetchMessage(
        accessToken,
        body.messageId,
      );
      const result = await this.enqueueFetched(
        integration.workspaceId,
        'microsoft',
        fetched,
      );
      return { imported: 1, results: [result] };
    }

    const results: Array<Record<string, unknown>> = [];
    for (const note of notifications) {
      const messageId =
        note.resourceData?.id ||
        note.resource?.split('/').pop() ||
        null;
      if (!messageId) continue;

      // Prefer workspace from clientState when present (we set it to workspaceId)
      const workspaceHint =
        note.clientState &&
        /^[0-9a-f-]{36}$/i.test(note.clientState)
          ? note.clientState
          : body.workspaceId;

      let integration;
      try {
        integration = workspaceHint
          ? await this.resolveIntegrationByWorkspace(
              workspaceHint,
              EmailProvider.MICROSOFT,
            )
          : await this.prisma.emailIntegration.findFirst({
              where: { provider: EmailProvider.MICROSOFT },
              orderBy: { updatedAt: 'desc' },
            });
        if (!integration) {
          throw new NotFoundException('No Microsoft mailbox connected');
        }
      } catch (error) {
        this.logger.warn(
          `Microsoft notification skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }

      try {
        const accessToken = await this.getValidAccessToken(integration);
        const fetched = await this.microsoft.fetchMessage(
          accessToken,
          messageId,
        );
        const from = fetched.from.toLowerCase();
        if (from.includes(integration.accountEmail.toLowerCase())) {
          continue;
        }
        results.push(
          await this.enqueueFetched(
            integration.workspaceId,
            'microsoft',
            fetched,
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Microsoft import skipped for ${messageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { imported: results.length, results };
  }

  private async enqueueFetched(
    workspaceId: string,
    provider: 'gmail' | 'microsoft',
    fetched: {
      externalId: string;
      threadId?: string;
      subject: string;
      from: string;
      to: string;
      body: string;
      receivedAt?: string;
    },
  ) {
    const payload: InboxEmailPayload = {
      workspaceId,
      provider,
      subject: fetched.subject,
      from: fetched.from,
      to: fetched.to || 'unknown@localhost',
      body: fetched.body,
      receivedAt: fetched.receivedAt,
      externalId: fetched.externalId,
      threadId: fetched.threadId,
    };
    return this.inbox.enqueueInbound(payload);
  }

  private decodeGmailPubSub(body: GmailPushBody): {
    emailAddress?: string;
    historyId?: string;
  } | null {
    const data = body.message?.data;
    if (!data) {
      if (body.emailAddress || body.historyId) {
        return {
          emailAddress: body.emailAddress,
          historyId: body.historyId != null ? String(body.historyId) : undefined,
        };
      }
      return null;
    }
    try {
      const json = Buffer.from(data, 'base64').toString('utf8');
      const parsed = JSON.parse(json) as {
        emailAddress?: string;
        historyId?: number | string;
      };
      return {
        emailAddress: parsed.emailAddress,
        historyId:
          parsed.historyId != null ? String(parsed.historyId) : undefined,
      };
    } catch {
      return null;
    }
  }

  private async resolveIntegrationByEmail(
    email: string,
    provider: EmailProvider,
    workspaceId?: string,
  ) {
    if (workspaceId) {
      return this.resolveIntegrationByWorkspace(workspaceId, provider);
    }
    if (!email) {
      throw new NotFoundException(
        'Gmail push missing emailAddress and workspaceId',
      );
    }
    const integration = await this.prisma.emailIntegration.findFirst({
      where: {
        provider,
        accountEmail: { equals: email, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!integration) {
      throw new NotFoundException(
        `No ${provider} integration for mailbox ${email}`,
      );
    }
    return integration;
  }

  private async resolveIntegrationByWorkspace(
    workspaceId: string,
    provider: EmailProvider,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const integration = await this.prisma.emailIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider } },
    });
    if (!integration) {
      throw new NotFoundException(
        `No ${provider} mailbox connected for workspace`,
      );
    }
    return integration;
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
  }
}
