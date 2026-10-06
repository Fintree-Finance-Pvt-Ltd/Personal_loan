import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  plApplicationStageReminder: any;
  /**
   * Off by default. Set PRISMA_SLOW_QUERY_MS (e.g. 200) to log every SQL statement that
   * takes at least that long - the fastest way to find the query behind a slow endpoint.
   * Only the statement text is logged (with ? placeholders), never parameter values.
   */
  constructor() {
    const slowQueryMs = Number(process.env.PRISMA_SLOW_QUERY_MS);
    const watchSlowQueries = slowQueryMs > 0;
    super(
      watchSlowQueries
        ? ({
            log: [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
          } as any)
        : undefined,
    );
    if (watchSlowQueries) {
      const logger = new Logger('SlowQuery');
      (this as any).$on('query', (event: { query: string; duration: number }) => {
        if (event.duration >= slowQueryMs) {
          logger.warn(`${event.duration}ms: ${event.query.replace(/\s+/g, ' ').slice(0, 400)}`);
        }
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
