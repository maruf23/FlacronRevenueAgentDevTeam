import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export type FetchedInboundMail = {
  messageId: string | null;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
};

/**
 * Fetches recent inbound mail via IMAP using the same SMTP_* credentials.
 * Gmail: enable IMAP + App Password (same as SMTP_PASS).
 */
@Injectable()
export class ImapInboxSyncService {
  private readonly logger = new Logger(ImapInboxSyncService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    return Boolean(user && pass && !pass.startsWith('your-'));
  }

  async fetchRecentInbound(options?: {
    sinceDays?: number;
    limit?: number;
  }): Promise<FetchedInboundMail[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'IMAP sync needs SMTP_USER and SMTP_PASS (Gmail App Password) in apps/backend/.env',
      );
    }

    const user = this.config.get<string>('SMTP_USER')!.trim();
    const pass = this.config
      .get<string>('SMTP_PASS')!
      .trim()
      .replace(/\s+/g, '');
    const host = this.config.get<string>('IMAP_HOST', 'imap.gmail.com');
    const port = Number(this.config.get<string>('IMAP_PORT', '993'));
    const sinceDays = options?.sinceDays ?? 14;
    const limit = options?.limit ?? 50;

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    const results: FetchedInboundMail[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const since = new Date();
        since.setDate(since.getDate() - sinceDays);

        const searchResult = await client.search({ since }, { uid: true });
        const uidList = Array.isArray(searchResult) ? searchResult : [];
        const recent = uidList.slice(-limit);

        if (recent.length === 0) {
          return results;
        }

        for await (const msg of client.fetch(
          recent,
          { uid: true, source: true },
          { uid: true },
        )) {
          if (!msg.source) continue;

          const parsed = await simpleParser(msg.source);
          const fromRaw = parsed.from;
          const fromAddr =
            (Array.isArray(fromRaw)
              ? fromRaw[0]?.value?.[0]?.address
              : fromRaw?.value?.[0]?.address) ||
            this.extractAngleEmail(
              Array.isArray(fromRaw)
                ? String(fromRaw[0]?.text ?? '')
                : String(fromRaw?.text ?? ''),
            ) ||
            '';
          if (!fromAddr) continue;

          // Skip mail we sent ourselves
          if (fromAddr.toLowerCase() === user.toLowerCase()) continue;

          const toRaw = parsed.to;
          const toAddr =
            (Array.isArray(toRaw)
              ? toRaw[0]?.value?.[0]?.address
              : toRaw?.value?.[0]?.address) || user;

          const body =
            (typeof parsed.text === 'string' && parsed.text.trim()) ||
            (typeof parsed.html === 'string'
              ? parsed.html
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
              : '') ||
            '(empty body)';

          results.push({
            messageId: parsed.messageId ?? null,
            from: fromAddr,
            to: toAddr,
            subject: parsed.subject?.trim() || '(no subject)',
            body,
            receivedAt: (parsed.date ?? new Date()).toISOString(),
          });
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown IMAP error';
      this.logger.error(`IMAP fetch failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to sync inbox via IMAP: ${message}`,
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }

    this.logger.log(`IMAP fetched ${results.length} inbound message(s)`);
    return results;
  }

  private extractAngleEmail(raw: string): string | null {
    const match = raw.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
    if (raw.includes('@')) return raw.trim();
    return null;
  }
}
