import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appendUnsubscribeFooter,
  buildListUnsubscribeHeaders,
  encodeSubject,
  formatFromAddress,
  humanizeLocalPart,
  isFreeMailbox,
  plainTextToHtml,
  sanitizeSubjectForInbox,
} from '../../email/email-deliverability';
import {
  EmailOAuthAdapter,
  FetchedInboundEmail,
  OAuthTokenSet,
  SendEmailInput,
  SendEmailResult,
} from './email-oauth.adapter';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

@Injectable()
export class GmailAdapter implements EmailOAuthAdapter {
  readonly provider = 'gmail' as const;

  constructor(private readonly config: ConfigService) {}

  getAuthUrl(state: string): string {
    const clientId = this.require('GOOGLE_CLIENT_ID');
    const redirectUri = this.require('GOOGLE_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokenSet> {
    const token = await this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.require('GOOGLE_REDIRECT_URI'),
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
    const free = fromEmail ? isFreeMailbox(fromEmail) : true;
    const from = fromEmail
      ? formatFromAddress(fromEmail, {
          personalName: humanizeLocalPart(fromEmail),
        })
      : undefined;
    const body = appendUnsubscribeFooter(
      input.body,
      fromEmail || 'noreply@localhost',
    );
    const subject = encodeSubject(sanitizeSubjectForInbox(input.subject));
    const listHeaders = buildListUnsubscribeHeaders(
      fromEmail || 'noreply@localhost',
    );

    // Free Gmail: plain text only — looks like a normal personal message
    const headers = [
      from ? `From: ${from}` : null,
      `To: ${input.to}`,
      fromEmail ? `Reply-To: ${fromEmail}` : null,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      ...(free || !listHeaders
        ? ['Content-Type: text/plain; charset="UTF-8"']
        : [
            `List-Unsubscribe: ${listHeaders['List-Unsubscribe']}`,
            `List-Unsubscribe-Post: ${listHeaders['List-Unsubscribe-Post']}`,
            `Content-Type: multipart/alternative; boundary="flacron_${Date.now().toString(36)}"`,
          ]),
    ].filter(Boolean) as string[];

    let raw: string;
    if (free || !listHeaders) {
      raw = [...headers, '', body].join('\r\n');
    } else {
      const boundary = headers
        .find((h) => h.startsWith('Content-Type: multipart'))
        ?.match(/boundary="([^"]+)"/)?.[1];
      raw = [
        ...headers,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        body,
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        plainTextToHtml(body),
        `--${boundary}--`,
      ].join('\r\n');
    }

    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Gmail send failed (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as { id?: string; threadId?: string };
    let threadId = data.threadId;
    if (data.id && !threadId) {
      try {
        const fetched = await this.fetchMessage(input.accessToken, data.id);
        threadId = fetched.threadId;
      } catch {
        // non-fatal
      }
    }
    return {
      providerMessageId: data.id,
      providerThreadId: threadId,
    };
  }

  async fetchMessage(
    accessToken: string,
    messageId: string,
  ): Promise<FetchedInboundEmail> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Gmail fetch message failed (${res.status}): ${text}`,
      );
    }
    const data = (await res.json()) as {
      id?: string;
      threadId?: string;
      internalDate?: string;
      payload?: {
        headers?: Array<{ name?: string; value?: string }>;
        body?: { data?: string };
        parts?: Array<{
          mimeType?: string;
          body?: { data?: string };
          parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
        }>;
      };
    };

    const headers = data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => (h.name || '').toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    const body = this.extractGmailBody(data.payload);
    const receivedMs = data.internalDate ? Number(data.internalDate) : Date.now();

    return {
      externalId: data.id || messageId,
      threadId: data.threadId,
      subject: getHeader('Subject') || '(no subject)',
      from: getHeader('From') || '',
      to: getHeader('To') || '',
      body: body || '(empty)',
      receivedAt: new Date(receivedMs).toISOString(),
    };
  }

  /**
   * List recent inbox message ids (fallback when Pub/Sub only sends historyId).
   */
  async listRecentInboxIds(
    accessToken: string,
    maxResults = 15,
  ): Promise<string[]> {
    const params = new URLSearchParams({
      maxResults: String(maxResults),
      q: 'in:inbox -in:chats newer_than:2d',
    });
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Gmail list messages failed (${res.status}): ${text}`,
      );
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return (data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));
  }

  private extractGmailBody(payload?: {
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
      parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
    }>;
  }): string {
    if (!payload) return '';
    const decode = (data?: string) => {
      if (!data) return '';
      const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(normalized, 'base64').toString('utf8');
    };

    if (payload.body?.data) {
      return decode(payload.body.data);
    }

    const walk = (
      parts?: Array<{
        mimeType?: string;
        body?: { data?: string };
        parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
      }>,
    ): string => {
      if (!parts) return '';
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return decode(part.body.data);
        }
      }
      for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return decode(part.body.data)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
      for (const part of parts) {
        const nested = walk(part.parts);
        if (nested) return nested;
      }
      return '';
    };

    return walk(payload.parts);
  }

  private async tokenRequest(
    extra: Record<string, string>,
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }> {
    const body = new URLSearchParams({
      client_id: this.require('GOOGLE_CLIENT_ID'),
      client_secret: this.require('GOOGLE_CLIENT_SECRET'),
      ...extra,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Google token exchange failed (${res.status}): ${text}`,
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
    const res = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new ServiceUnavailableException('Failed to fetch Google user email');
    }
    const data = (await res.json()) as { email?: string };
    if (!data.email) {
      throw new ServiceUnavailableException('Google account email missing');
    }
    return data.email.toLowerCase();
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }
    return value;
  }
}
