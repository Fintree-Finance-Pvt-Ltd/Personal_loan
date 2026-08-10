import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LenderIntegrationService } from './lender-integration.service';
import { normalizeLenderIntegrationError } from './lender-integration.errors';

@Injectable()
export class LenderIntegrationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LenderIntegrationWorker.name);
  private readonly workerId = `lender-worker-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private draining = false;
  private lastRecoveryAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: LenderIntegrationService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>('LENDER_INTEGRATION_WORKER_ENABLED') || this.config.get<string>('NODE_ENV') === 'test') return;
    try {
      await this.recoverStaleEvents();
    } catch (error) {
      this.logger.error(`Lender worker startup recovery failed: ${(error as Error).message}`);
    }
    const intervalMs = this.config.get<number>('LENDER_INTEGRATION_WORKER_POLL_MS') ?? 5000;
    this.timer = setInterval(() => void this.drainOnce(), intervalMs);
    this.timer.unref();
    void this.drainOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drainOnce(): Promise<boolean> {
    if (this.draining) return false;
    this.draining = true;
    try {
      const staleSeconds = this.config.get<number>('LENDER_INTEGRATION_WORKER_LOCK_SECONDS') ?? 300;
      if (Date.now() - this.lastRecoveryAt >= Math.max(30_000, staleSeconds * 500)) {
        await this.recoverStaleEvents();
        this.lastRecoveryAt = Date.now();
      }
      const event = await this.claimNextEvent();
      if (!event) return false;
      try {
        const completedAtomically = await this.integrations.processEvent(event.id, event.lockToken);
        if (!completedAtomically) {
          const completed = await this.prisma.lenderIntegrationOutbox.updateMany({
            where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
            data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
          });
          if (completed.count !== 1) this.logger.warn(`Lender event=${event.id} completion ignored because the worker lease was lost.`);
        }
      } catch (unknownError) {
        const error = normalizeLenderIntegrationError(unknownError);
        const stillOwned = await this.prisma.lenderIntegrationOutbox.count({ where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken } });
        if (!stillOwned) {
          this.logger.warn(`Lender event=${event.id} failure ignored because the worker lease was lost.`);
          return true;
        }
        const policy = await this.retryPolicy(event.applicationId);
        const retrying = error.retryable && event.attemptCount < policy.maximumAttempts;
        await this.integrations.markStageFailure(event.id, event.lockToken, error, retrying);
        const retryDelay = policy.scheduleSeconds[Math.min(event.attemptCount, policy.scheduleSeconds.length - 1)] ?? 3600;
        await this.prisma.lenderIntegrationOutbox.updateMany({
          where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
          data: {
            status: retrying ? 'RETRY_PENDING' : 'FAILED',
            availableAt: retrying ? new Date(Date.now() + retryDelay * 1000) : event.availableAt,
            processedAt: retrying ? null : new Date(),
            lockedAt: null,
            lockedBy: null,
            lockToken: null,
            leaseExpiresAt: null,
            lastErrorCode: error.code,
            lastErrorMessage: error.message,
          },
        });
        this.logger.warn(`Lender event=${event.id} stage=${event.integrationStage} code=${error.code} retrying=${retrying}`);
      }
      return true;
    } catch (error) {
      this.logger.error(`Lender worker poll failed: ${(error as Error).message}`);
      return false;
    } finally {
      this.draining = false;
    }
  }

  async recoverStaleEvents(): Promise<number> {
    const result = await this.prisma.lenderIntegrationOutbox.updateMany({
      where: { status: 'PROCESSING', leaseExpiresAt: { lt: new Date() } },
      data: { status: 'RETRY_PENDING', availableAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: 'WORKER_LOCK_RECOVERED', lastErrorMessage: 'Recovered after an expired worker lease.' },
    });
    return result.count;
  }

  private async claimNextEvent(): Promise<any | null> {
    return this.prisma.$transaction(
      async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM LenderIntegrationOutbox
        WHERE status IN ('PENDING', 'RETRY_PENDING')
          AND availableAt <= NOW(3)
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows[0]) return null;
      const lockToken = randomUUID();
      const leaseSeconds = this.config.get<number>('LENDER_INTEGRATION_WORKER_LOCK_SECONDS') ?? 300;
      const updated = await tx.lenderIntegrationOutbox.updateMany({
        where: { id: rows[0].id, status: { in: ['PENDING', 'RETRY_PENDING'] } },
        data: { status: 'PROCESSING', lockedAt: new Date(), lockedBy: this.workerId, lockToken, leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000), attemptCount: { increment: 1 } },
      });
      if (updated.count !== 1) return null;
      return tx.lenderIntegrationOutbox.findUnique({ where: { id: rows[0].id } });
    },
    { maxWait: 15000, timeout: 20000 });
  }

  private async retryPolicy(applicationId: bigint): Promise<{ maximumAttempts: number; scheduleSeconds: number[] }> {
    const link = await this.prisma.lenderApplicationLink.findUnique({ where: { applicationId }, include: { integrationConfig: true } });
    const maximumAttempts = link?.integrationConfig.maximumRetryAttempts ?? 5;
    const rawSchedule = link?.integrationConfig.retryScheduleSeconds ?? '0,60,300,900,3600';
    const scheduleSeconds = rawSchedule.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0);
    return { maximumAttempts, scheduleSeconds: scheduleSeconds.length ? scheduleSeconds : [0, 60, 300, 900, 3600] };
  }
}
