import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class StageReminderRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(StageReminderRedisService.name);
  private sharedClient: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns connection options compatible with BullMQ Queue and Worker.
   */
  getConnectionOptions(): any {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      return {
        ...this.parseRedisUrl(redisUrl),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times: number) => Math.min(times * 200, 3000),
      };
    }

    const host = this.configService.get<string>('REDIS_HOST') || '127.0.0.1';
    const port = Number(this.configService.get<number | string>('REDIS_PORT')) || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;

    return {
      host,
      port,
      password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    };
  }

  /**
   * Creates an active Redis client with attached error handling.
   */
  createClient(): Redis {
    const options = this.getConnectionOptions();
    const client = new Redis(options);

    client.on('error', (err) => {
      this.logger.warn(`Redis connection warning: ${err?.message || err}`);
    });

    client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${options.host || 'url'}:${options.port || ''}`);
    });

    return client;
  }

  getSharedClient(): Redis {
    if (!this.sharedClient) {
      this.sharedClient = this.createClient();
    }
    return this.sharedClient;
  }

  private parseRedisUrl(urlStr: string): Partial<RedisOptions> {
    try {
      const parsed = new URL(urlStr);
      return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        password: parsed.password || undefined,
        username: parsed.username || undefined,
      };
    } catch {
      return { host: '127.0.0.1', port: 6379 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sharedClient) {
      try {
        await this.sharedClient.quit();
      } catch (err: any) {
        this.logger.warn(`Error closing Redis client: ${err?.message}`);
      }
      this.sharedClient = null;
    }
  }
}
