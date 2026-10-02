import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Sets (or clears) the session GUC used by RLS policies.
   * Always call this per-request so pooled connections cannot leak tenant context.
   */
  async setWorkspaceContext(workspaceId: string | null): Promise<void> {
    if (workspaceId) {
      if (!UUID_RE.test(workspaceId)) {
        throw new Error('Invalid workspaceId for RLS context');
      }
      await this.$executeRaw`
        SELECT set_config('app.current_workspace_id', ${workspaceId}, false)
      `;
      return;
    }

    await this.$executeRaw`
      SELECT set_config('app.current_workspace_id', '', false)
    `;
  }
}
