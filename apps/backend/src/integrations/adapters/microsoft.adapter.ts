import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appendUnsubscribeFooter,
  buildListUnsubscribeHeaders,
  extractEmailAddress,
} from '../../email/email-deliverability';
import {
  EmailOAuthAdapter,
  FetchedInboundEmail,
  OAuthTokenSet,
  SendEmailInput,
  SendEmailResult,
} from './email-oauth.adapter';

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
].join(' ');

@Injectable()
export class MicrosoftAdapter implements EmailOAuthAdapter {
  readonly provider = 'microsoft' as const;

  constructor(private readonly config: ConfigService) {}

  getAuthUrl(state: string): string {
    const clientId = this.require('MICROSOFT_CLIENT_ID');
    const redirectUri = this.require('MICROSOFT_REDIRECT_URI');
    const tenant = this.config.get<string>('MICROSOFT_TENANT_ID', 'common');
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_SCOPES,
      state,
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokenSet> {
    const token = await this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.require('MICROSOFT_REDIRECT_URI'),
      scope: MICROSOFT_SCOPES,
    });
    const accountEmail = await this.fetchEmail(token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? '',
      expiresIn: token.expires_in,
      scope: token.scope,
      accountEmail,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    const token = await this.tokenRequest({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES,
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresIn: token.expires_in,
      scope: token.scope,
      accountEmail: '',
    };
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const fromEmail = (input.fromEmail || '').trim().toLowerCase();
    const body = appendUnsubscribeFooter(
      input.body,
      fromEmail || 'noreply@localhost',
    );
    const listHeaders = buildListUnsubscribeHeaders(
      fromEmail || 'noreply@localhost',
    );

    // Create draft first so we get a provider message + conversation id, then send.
    const createRes = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: input.subject.trim(),
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: input.to } }],
        ...(fromEmail
          ? {
              replyTo: [
                { emailAddress: { address: extractEmailAddress(fromEmail) } },
              ],
            }
          : {}),
        ...(listHeaders
          ? {
              internetMessageHeaders: [
                {
                  name: 'List-Unsubscribe',
                  value: listHeaders['List-Unsubscribe'],
                },
                {
                  name: 'List-Unsubscribe-Post',
                  value: listHeaders['List-Unsubscribe-Post'],
                },
              ],
            }
          : {}),
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new ServiceUnavailableException(
        `Microsoft create message failed (${createRes.status}): ${text}`,
      );
    }

    const created = (await createRes.json()) as {
      id?: string;
      conversationId?: string;
    };

    if (!created.id) {
      throw new ServiceUnavailableException(
        'Microsoft create message returned no id',
      );
    }

    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(created.id)}/send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.accessToken}` },
      },
    );

    if (!sendRes.ok) {
      const text = await sendRes.text();
      throw new ServiceUnavailableException(
        `Microsoft send failed (${sendRes.status}): ${text}`,
      );
    }

    return {
      providerMessageId: created.id,
      providerThreadId: created.conversationId,
    };
  }

  async fetchMessage(
    accessToken: string,
    messageId: string,
  ): Promise<FetchedInboundEmail> {
    const select =
      'id,conversationId,subject,body,from,toRecipients,receivedDateTime,internetMessageId';
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=${select}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Microsoft fetch message failed (${res.status}): ${text}`,
      );
    }
    const data = (await res.json()) as {
      id?: string;
      conversationId?: string;
      internetMessageId?: string;
      subject?: string;
      body?: { contentType?: string; content?: string };
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      receivedDateTime?: string;
    };

    const fromAddr = data.from?.emailAddress?.address || '';
    const fromName = data.from?.emailAddress?.name;
    const from = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
    const to =
      data.toRecipients
        ?.map((r) => r.emailAddress?.address)
        .filter(Boolean)
        .join(', ') || '';

    let body = data.body?.content || '';
    if ((data.body?.contentType || '').toLowerCase() === 'html') {
      body = body
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return {
      externalId: data.id || data.internetMessageId || messageId,
      threadId: data.conversationId,
      subject: data.subject || '(no subject)',
      from,
      to,
      body: body || '(empty)',
      receivedAt: data.receivedDateTime,
    };
  }

  private async tokenRequest(
    extra: Record<string, string>,
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }> {
    const tenant = this.config.get<string>('MICROSOFT_TENANT_ID', 'common');
    const body = new URLSearchParams({
      client_id: this.require('MICROSOFT_CLIENT_ID'),
      client_secret: this.require('MICROSOFT_CLIENT_SECRET'),
      ...extra,
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Microsoft token exchange failed (${res.status}): ${text}`,
      );
    }

    return (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(
        'Failed to fetch Microsoft user profile',
      );
    }
    const data = (await res.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    const email = (data.mail || data.userPrincipalName || '').toLowerCase();
    if (!email) {
      throw new ServiceUnavailableException('Microsoft account email missing');
    }
    return email;
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }
    return value;
  }
}
