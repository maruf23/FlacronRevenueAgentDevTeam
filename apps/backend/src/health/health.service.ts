import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OpenAiProvider } from '../providers/openai.provider';

export type HealthCheckResult = {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  checks: {
    database: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    redis: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    ai: { status: 'up' | 'down' | 'skipped'; latencyMs?: number; error?: string };
  };
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly openai: OpenAiProvider,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [database, redis, ai] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkAi(),
    ]);

    const statuses = [database.status, redis.status, ai.status].filter(
      (s) => s !== 'skipped',
    );
    const anyDown = statuses.includes('down');
    const allUp = statuses.every((s) => s === 'up');

    return {
      status: allUp ? 'ok' : anyDown ? 'error' : 'degraded',
      service: 'flacron-lead-agent-api',
      timestamp: new Date().toISOString(),
      checks: { database, redis, ai },
    };
  }

  private async checkDatabase() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' as const, latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('Health DB check failed', error);
      return {
        status: 'down' as const,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkRedis() {
    const start = Date.now();
    try {
      const pong = await this.redis.client.ping();
      if (pong !== 'PONG') {
        return {
          status: 'down' as const,
          latencyMs: Date.now() - start,
          error: `Unexpected PING response: ${pong}`,
        };
      }
      return { status: 'up' as const, latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('Health Redis check failed', error);
      return {
        status: 'down' as const,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkAi() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey || apiKey.startsWith('sk-your-')) {
      return {
        status: 'skipped' as const,
        error: 'OPENAI_API_KEY not configured',
      };
    }

    const start = Date.now();
    try {
      const ok = await this.openai.healthCheck();
      return {
        status: ok ? ('up' as const) : ('down' as const),
        latencyMs: Date.now() - start,
        error: ok ? undefined : 'AI provider healthCheck returned false',
      };
    } catch (error) {
      this.logger.error('Health AI check failed', error);
      return {
        status: 'down' as const,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
