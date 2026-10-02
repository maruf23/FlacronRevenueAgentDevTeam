import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  appendUnsubscribeFooter,
  buildListUnsubscribeHeaders,
  extractEmailAddress,
  formatFromAddress,
  humanizeLocalPart,
  isFreeMailbox,
  plainTextToHtml,
  sanitizeSubjectForInbox,
} from './email-deliverability';

export type SmtpSendInput = {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
};

/**
 * Gmail (or any SMTP) sending via username + app password.
 * Free Gmail sends use personal 1:1 mode (text-only, no bulk headers).
 */
@Injectable()
export class SmtpMailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    return Boolean(user && pass && !pass.startsWith('your-'));
  }

  getFromAddress(): string {
    const user = this.config.get<string>('SMTP_USER')?.trim() || '';
    const raw =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      user ||
      'noreply@flacron.local';
    const personalOverride = this.config.get<string>('SMTP_FROM_NAME')?.trim();
    return formatFromAddress(raw, {
      brandName:
        this.config.get<string>('APP_NAME')?.trim() || 'Flacron Lead Agent',
      personalName: personalOverride || humanizeLocalPart(user || raw),
    });
  }

  async send(input: SmtpSendInput): Promise<{ messageId?: string }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'SMTP is not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password) in apps/backend/.env',
      );
    }

    const transporter = this.getTransporter();
    const from = this.getFromAddress();
    const fromEmail = extractEmailAddress(from);
    const free = isFreeMailbox(fromEmail);
    const replyTo =
      input.replyTo?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      fromEmail;
    const body = appendUnsubscribeFooter(input.body, from);
    const subject = sanitizeSubjectForInbox(input.subject);
    const listHeaders = buildListUnsubscribeHeaders(from);

    try {
      // Free Gmail → keep the message identical to a normal personal email.
      // Custom domains → multipart + List-Unsubscribe for commercial compliance.
      const info = await transporter.sendMail({
        from,
        to: input.to,
        subject,
        text: body,
        ...(free
          ? {}
          : {
              html: plainTextToHtml(body),
              headers: listHeaders ?? undefined,
            }),
        replyTo,
      });

      this.logger.log(
        `SMTP sent to ${input.to} from=${from} mode=${free ? 'personal' : 'domain'} messageId=${info.messageId ?? 'n/a'}`,
      );

      return { messageId: info.messageId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(`SMTP send failed: ${message}`);
      throw new ServiceUnavailableException(`Failed to send email: ${message}`);
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const secure =
      this.config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true';
    const user = this.config.get<string>('SMTP_USER')!.trim();
    const pass = this.config
      .get<string>('SMTP_PASS')!
      .trim()
      .replace(/\s+/g, '');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      pool: true,
      maxConnections: 1,
      // Gmail free accounts: stay well under automated-send thresholds
      rateDelta: 15_000,
      rateLimit: 1,
    });

    return this.transporter;
  }
}
