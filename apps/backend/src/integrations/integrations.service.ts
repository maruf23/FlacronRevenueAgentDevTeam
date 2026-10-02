import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { GmailAdapter } from './adapters/gmail.adapter';
import { MicrosoftAdapter } from './adapters/microsoft.adapter';
import { signOAuthState, verifyOAuthState } from './oauth-state';
import { EmailOAuthAdapter } from './adapters/email-oauth.adapter';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: TokenEncryptionService,
    private readonly gmail: GmailAdapter,
    private readonly microsoft: MicrosoftAdapter,
  ) {}

  async getConnectionStatus(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const [integrations, smtpUser, smtpPass, hunterKey] = await Promise.all([
      this.prisma.emailIntegration.findMany({
        where: { workspaceId },
        select: {
          provider: true,
          accountEmail: true,
          updatedAt: true,
        },
      }),
      Promise.resolve(this.config.get<string>('SMTP_USER')?.trim() || ''),
      Promise.resolve(this.config.get<string>('SMTP_PASS')?.trim() || ''),
      Promise.resolve(this.config.get<string>('HUNTER_API_KEY')?.trim() || ''),
    ]);

    const byProvider = Object.fromEntries(
      integrations.map((row) => [row.provider, row]),
    ) as Partial<
      Record<
        EmailProvider,
        { provider: EmailProvider; accountEmail: string; updatedAt: Date }
      >
    >;

    const smtpConfigured =
      Boolean(smtpUser) &&
      Boolean(smtpPass) &&
      !smtpPass.startsWith('your-') &&
      !smtpUser.startsWith('your-');

    const hunterConfigured =
      Boolean(hunterKey) &&
      !hunterKey.startsWith('your-') &&
      hunterKey.length > 8;

    const gmail = byProvider[EmailProvider.GMAIL];
    const microsoft = byProvider[EmailProvider.MICROSOFT];

    return {
      gmail: {
        connected: Boolean(gmail) || smtpConfigured,
        accountEmail: gmail?.accountEmail ?? (smtpConfigured ? smtpUser : null),
        via: gmail ? 'oauth' : smtpConfigured ? 'smtp' : null,
      },
      microsoft: {
        connected: Boolean(microsoft),
        accountEmail: microsoft?.accountEmail ?? null,
        via: microsoft ? 'oauth' : null,
      },
      hunter: {
        connected: hunterConfigured,
        detail: hunterConfigured ? 'API key configured' : null,
      },
      googleCalendar: {
        connected: Boolean(gmail),
        accountEmail: gmail?.accountEmail ?? null,
        detail: gmail
          ? 'Uses Gmail OAuth calendar scopes when connected'
          : null,
      },
      metaAds: {
        connected: false,
        detail: null as string | null,
      },
      smtpConfigured,
    };
  }

  createConnectUrl(
    provider: 'gmail' | 'microsoft',
    user: { userId: string; workspaceId: string },
  ): { url: string } {
    const secret = this.stateSecret();
    const state = signOAuthState(
      {
        workspaceId: user.workspaceId,
        userId: user.userId,
        provider,
      },
      secret,
    );
    const adapter = this.adapterFor(provider);
    return { url: adapter.getAuthUrl(state) };
  }

  async handleCallback(
    provider: 'gmail' | 'microsoft',
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ redirectUrl: string }> {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth code or state');
    }

    let payload;
    try {
      payload = verifyOAuthState(state, this.stateSecret());
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (payload.provider !== provider) {
      throw new BadRequestException('OAuth provider mismatch');
    }

    const adapter = this.adapterFor(provider);
    const tokens = await adapter.exchangeCode(code);

    if (!tokens.refreshToken) {
      throw new BadRequestException(
        'No refresh token returned. Reconnect and grant offline access.',
      );
    }

    await this.prisma.setWorkspaceContext(payload.workspaceId);

    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null;

    await this.prisma.emailIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: payload.workspaceId,
          provider:
            provider === 'gmail' ? EmailProvider.GMAIL : EmailProvider.MICROSOFT,
        },
      },
      create: {
        workspaceId: payload.workspaceId,
        provider:
          provider === 'gmail' ? EmailProvider.GMAIL : EmailProvider.MICROSOFT,
        accountEmail: tokens.accountEmail,
        accessTokenEnc: this.encryption.encrypt(tokens.accessToken),
        refreshTokenEnc: this.encryption.encrypt(tokens.refreshToken),
        tokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
      update: {
        accountEmail: tokens.accountEmail,
        accessTokenEnc: this.encryption.encrypt(tokens.accessToken),
        refreshTokenEnc: this.encryption.encrypt(tokens.refreshToken),
        tokenExpiresAt: expiresAt,
        scope: tokens.scope,
      },
    });

    const frontend = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return {
      redirectUrl: `${frontend}/integrations?integration=${provider}&status=connected`,
    };
  }

  adapterFor(provider: 'gmail' | 'microsoft'): EmailOAuthAdapter {
    return provider === 'gmail' ? this.gmail : this.microsoft;
  }

  private stateSecret(): string {
    return (
      this.config.get<string>('OAUTH_STATE_SECRET') ||
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }
}
