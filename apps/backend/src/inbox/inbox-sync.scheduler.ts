import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from './inbox.service';
import { ImapInboxSyncService } from './imap-inbox-sync.service';

/**
 * Periodically pulls Gmail IMAP replies into Inbox for every workspace.
 * Uses the shared SMTP_* mailbox credentials.
 */
@Injectable()
export class InboxSyncScheduler {
  private readonly logger = new Logger(InboxSyncScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly imap: ImapInboxSyncService,
  ) {}

  /** Every 2 minutes while the API is running. */
  @Cron('0 */2 * * * *')
  async pullReplies() {
    if (this.running) {
      this.logger.debug('Inbox sync already running — skipping tick');
      return;
    }
    if (!this.imap.isConfigured()) {
      return;
    }

    this.running = true;
    try {
      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true },
        take: 50,
      });

      for (const ws of workspaces) {
        try {
          const result = await this.inbox.syncMailbox(ws.id);
          if (result.imported > 0 || result.backfilledConversations > 0) {
            this.logger.log(
              `Auto-sync workspace=${ws.id} imported=${result.imported} backfilled=${result.backfilledConversations} scanned=${result.scanned}`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown sync error';
          this.logger.warn(`Auto-sync failed for workspace ${ws.id}: ${message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
