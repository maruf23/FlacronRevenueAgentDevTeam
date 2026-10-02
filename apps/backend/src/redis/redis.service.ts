import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');

    this.client = url
      ? new Redis(url, { maxRetriesPerRequest: null })
      : new Redis({
          host: this.config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(this.config.get('REDIS_PORT') ?? 6380),
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
        });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
